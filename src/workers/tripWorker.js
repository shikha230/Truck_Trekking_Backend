const { pool, traccarPool } = require('../config/db');
const geolib = require('geolib');

const activeTrips = {};

// Cache geofences for 60s to avoid querying DB every 10s
const GEOFENCE_CACHE_TTL_MS = 60000;
let zoneCache = {
    rows: [],
    expiresAt: 0,
};

// Prevent overlapping interval ticks
let isWorkerRunning = false;

const getCachedZones = async () => {
    const now = Date.now();
    if (zoneCache.rows.length > 0 && now < zoneCache.expiresAt) {
        return zoneCache.rows;
    }

    const res = await pool.query("SELECT * FROM geofences");
    zoneCache = {
        rows: res.rows || [],
        expiresAt: now + GEOFENCE_CACHE_TTL_MS,
    };
    return zoneCache.rows;
};

const processTripDetection = async () => {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        const [zonesRows, latestPositions] = await Promise.all([
            getCachedZones(),
            traccarPool.query(`
                SELECT d.id AS deviceid,
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

        for (const row of latestPositions.rows) {
            const deviceId = row.deviceid;
            let attributes = {};
            try {
                attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
            } catch (e) {
                attributes = {};
            }

            // Sensor Check (Traccar screenshot ke mutabiq 'in1' 'Yes' ya true ho sakta hai)
            const isTipperActive = attributes.in1 === true || attributes.in1 === 'Yes' || attributes.in1 == 1;

            // Geofence Check
            let currentZone = null;
            for (const zone of zonesRows) {
                const distance = geolib.getDistance(
                    { latitude: Number(row.latitude), longitude: Number(row.longitude) },
                    { latitude: Number(zone.latitude), longitude: Number(zone.longitude) }
                );
                if (distance <= (zone.radius || 100)) {
                    currentZone = zone;
                    break;
                }
            }

            // 1. Loading Zone me enter hone par Trip Start
            if (currentZone && currentZone.name.toLowerCase().includes('loading')) {
                if (!activeTrips[deviceId]) {
                    activeTrips[deviceId] = {
                        vehicle_id: deviceId,
                        start_time: row.devicetime,
                        start_location: currentZone.name,
                        status: 'LOADING'
                    };
                    console.log(`[TRIP STARTED] Vehicle ${deviceId} inside ${currentZone.name}`);
                }
            }

            // 2. Unloading Zone me pahunch kar Tipper Uthne par Status Update
            if (activeTrips[deviceId] && currentZone && currentZone.name.toLowerCase().includes('unloading')) {
                if (isTipperActive && activeTrips[deviceId].status !== 'UNLOADING') {
                    activeTrips[deviceId].status = 'UNLOADING';
                    console.log(`[UNLOADING STARTED] Vehicle ${deviceId}`);
                }
            }

            // 3. Trip Complete & Save (Jab tipper niche ho jaye ya unloading zone complete ho)
            if (activeTrips[deviceId] && activeTrips[deviceId].status === 'UNLOADING') {
                if (!isTipperActive) {
                    const tripData = activeTrips[deviceId];

                    await pool.query(`
                        INSERT INTO trips (vehicle_id, start_time, end_time, start_location, status)
                        VALUES ($1, $2, $3, $4, 'COMPLETED')
                    `, [tripData.vehicle_id, tripData.start_time, row.devicetime, tripData.start_location]);

                    console.log(`[TRIP COMPLETED & SAVED] Vehicle ${deviceId}`);
                    delete activeTrips[deviceId];
                }
            }
        }
    } catch (err) {
        console.error("Worker Error:", err.message);
    } finally {
        isWorkerRunning = false;
    }
};

const startTripWorker = () => {
    setInterval(processTripDetection, 10000); // Har 10 second me check karega
};

module.exports = startTripWorker;