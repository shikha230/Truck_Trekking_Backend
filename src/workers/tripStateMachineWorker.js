const { isPointWithinRadius, isPointInPolygon } = require('geolib');
const { pool, traccarPool } = require('../config/db');
const { parseWKT } = require('../utils/distance');

// In-Memory state management for live background worker
const vehicleStates = {};

// 60-second Geofence & Parsed Polygon Cache (avoids repeated DB queries & WKT parsing every 10s)
const GEOFENCE_CACHE_TTL_MS = 60000;
let geofenceCache = {
    gpsLimitPolygon: null,
    innerZones: [],
    expiresAt: 0,
};

// Prevent overlapping worker runs if a DB query ever slows down
let isWorkerRunning = false;

const parseAttributes = (rawAttributes) => {
    if (!rawAttributes) return {};
    if (typeof rawAttributes === 'string') {
        try { return JSON.parse(rawAttributes); } catch (e) { return {}; }
    }
    return rawAttributes;
};

// Helper: Extract IO6, IO9, IO1, Speed safely
const getSensorValues = (attributes, speed) => {
    const io6 = Number(attributes.io6 ?? attributes.adc1 ?? 0);
    const io9 = Number(attributes.io9 ?? attributes.adc2 ?? 0);
    const io1 = (attributes.io1 === 1 || attributes.io1 === true || attributes.in1 === true || attributes.in1 === 1) ? 1 : 0;
    const currentSpeed = Number(speed || 0);
    return { io6, io9, io1, speed: currentSpeed };
};

// Client Sheet Rules: CAT Dumpers vs Volvo Trucks
const getVehicleThresholds = (vehicleName = '') => {
    const isVolvo = vehicleName.toLowerCase().includes('volvo');
    if (isVolvo) {
        return {
            type: 'VOLVO',
            start: { io6Max: 1400, io9Min: 15000, io1: 1, speed: 0 },
            end:   { io6Min: 2000, io9Max: 2500,  io1: 1, speed: 0 }
        };
    }
    return {
        type: 'CAT',
        start: { io6Max: 900,  io9Min: 3000, io1: 1, speed: 0 },
        end:   { io6Min: 3000, io9Max: 750,  io1: 1, speed: 0 }
    };
};

// Helper: Convert WKT parsed coordinates to geolib polygon array
const toGeolibPolygon = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return null;
    return coordinates.map(coord => ({
        latitude: Array.isArray(coord) ? Number(coord[0]) : Number(coord.latitude),
        longitude: Array.isArray(coord) ? Number(coord[1]) : Number(coord.longitude)
    }));
};

const getCachedZones = async () => {
    const now = Date.now();
    if (now < geofenceCache.expiresAt && (geofenceCache.gpsLimitPolygon || geofenceCache.innerZones.length > 0)) {
        return geofenceCache;
    }

    const geofencesRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
    let gpsLimitPolygon = null;
    const innerZones = [];

    for (const g of geofencesRes.rows) {
        const { coordinates, center } = parseWKT(g.area);
        const polygon = toGeolibPolygon(coordinates);
        const nameLower = (g.name || '').toLowerCase();

        if (nameLower.includes('gps limit')) {
            gpsLimitPolygon = polygon;
        } else {
            innerZones.push({
                id: g.id,
                name: nameLower,
                polygon,
                center
            });
        }
    }

    geofenceCache = {
        gpsLimitPolygon,
        innerZones,
        expiresAt: now + GEOFENCE_CACHE_TTL_MS,
    };

    return geofenceCache;
};

const runTripStateMachine = async () => {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        // 1. Fetch cached geofences & latest device positions in parallel (fast primary-key join via d.positionid)
        const [zonesData, latestPositions] = await Promise.all([
            getCachedZones(),
            traccarPool.query(`
                SELECT d.id AS deviceid,
                       d.name AS device_name,
                       p.devicetime,
                       p.latitude,
                       p.longitude,
                       p.speed,
                       p.attributes
                FROM tc_devices d
                INNER JOIN tc_positions p ON p.id = d.positionid
                WHERE p.devicetime >= NOW() - INTERVAL '24 hours'
                  AND p.latitude IS NOT NULL
                  AND p.longitude IS NOT NULL
            `)
        ]);

        const { gpsLimitPolygon, innerZones } = zonesData;
        if (!gpsLimitPolygon && innerZones.length === 0) return;

        for (const pos of latestPositions.rows) {
            const deviceId = pos.deviceid;
            const point = { latitude: Number(pos.latitude), longitude: Number(pos.longitude) };

            // =====================================================================
            // STEP A: MASTER BOUNDARY CHECK ("GPS LIMITs")
            // Agar truck GPS LIMITs geofence ke bahar hai, toh data ignore karein
            // =====================================================================
            if (gpsLimitPolygon && !isPointInPolygon(point, gpsLimitPolygon)) {
                continue;
            }

            const deviceName = pos.device_name || 'CAT Dumper';
            const rules = getVehicleThresholds(deviceName);
            const devTime = new Date(pos.devicetime);
            const attrs = parseAttributes(pos.attributes);
            const sensors = getSensorValues(attrs, pos.speed);

            // =====================================================================
            // STEP B: INNER GEOFENCE CHECK (Loading vs Unloading)
            // =====================================================================
            let isLoadingZone = false;
            let isUnloadingZone = false;

            for (const zone of innerZones) {
                let isInside = false;
                if (zone.polygon) {
                    isInside = isPointInPolygon(point, zone.polygon);
                } else if (zone.center) {
                    isInside = isPointWithinRadius(point, zone.center, 150);
                }

                if (isInside) {
                    if (zone.name.includes('unloading') || zone.name.includes('plant')) {
                        isUnloadingZone = true;
                    } else if (zone.name.includes('loading') || zone.name.includes('mine') || zone.name.includes('siding')) {
                        isLoadingZone = true;
                    }
                }
            }

            if (!vehicleStates[deviceId]) {
                vehicleStates[deviceId] = {
                    state: 'IDLE',
                    startTime: null,
                    unloadingStartTime: null,
                    startLat: pos.latitude,
                    startLng: pos.longitude
                };
            }

            const currentState = vehicleStates[deviceId];

            // =====================================================================
            // STEP C: TRIP START (In Loading Zone + CAT/Volvo Sensor Match)
            // =====================================================================
            const isStartMatch =
                isLoadingZone &&
                sensors.io6 < rules.start.io6Max &&
                sensors.io9 > rules.start.io9Min &&
                sensors.io1 === rules.start.io1 &&
                sensors.speed === rules.start.speed;

            if (currentState.state === 'IDLE' && isStartMatch) {
                currentState.state = 'IN_TRANSIT';
                currentState.startTime = devTime;
                currentState.startLat = pos.latitude;
                currentState.startLng = pos.longitude;
                currentState.unloadingStartTime = null;
                console.log(`✅ [TRIP STARTED - ${rules.type}] ${deviceName} inside GPS LIMITs`);
            }

            // Track when vehicle enters Unloading Zone
            if (currentState.state === 'IN_TRANSIT' && isUnloadingZone && !currentState.unloadingStartTime) {
                currentState.unloadingStartTime = devTime;
                console.log(`🏗️ [UNLOADING ENTERED] ${deviceName}`);
            }

            // =====================================================================
            // STEP D: TRIP END (Sensor Match + Flag if outside Unloading Zone)
            // =====================================================================
            const isEndMatch =
                sensors.io6 > rules.end.io6Min &&
                sensors.io9 < rules.end.io9Max &&
                sensors.io1 === rules.end.io1 &&
                sensors.speed === rules.end.speed;

            if (currentState.state === 'IN_TRANSIT' && isEndMatch) {
                const endTime = devTime;
                const startTime = currentState.startTime || devTime;
                const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

                // Client Remark: Do not reject if outside Un-Loading area; Flag It
                const tripStatus = isUnloadingZone ? 'COMPLETED' : 'FLAGGED';
                const remarks = isUnloadingZone
                    ? 'Completed inside Un-Loading Area'
                    : 'Flagged: Unloaded outside Un-Loading Zone';

                console.log(`🎉 [TRIP ${tripStatus}] ${deviceName} | ${durationMinutes} mins | End IO9: ${sensors.io9}`);

                await pool.query(`
                    INSERT INTO trips (
                        vehicle_id, start_time, unloading_start_time, end_time, 
                        status, total_cycle_minutes, start_lat, start_lng, end_io9, remarks
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    deviceId,
                    startTime,
                    currentState.unloadingStartTime || endTime,
                    endTime,
                    tripStatus,
                    durationMinutes,
                    currentState.startLat,
                    currentState.startLng,
                    sensors.io9,
                    remarks
                ]);

                if (global.io) {
                    global.io.emit('trip_completed', {
                        deviceId,
                        deviceName,
                        status: tripStatus,
                        durationMinutes,
                        completedAt: endTime
                    });
                }

                // Reset state for next cycle
                vehicleStates[deviceId] = { state: 'IDLE', startTime: null, unloadingStartTime: null };
            }
        }
    } catch (err) {
        console.error("❌ Error in Trip State Machine Worker:", err.message);
    } finally {
        isWorkerRunning = false;
    }
};

setInterval(runTripStateMachine, 10000);
module.exports = { runTripStateMachine };