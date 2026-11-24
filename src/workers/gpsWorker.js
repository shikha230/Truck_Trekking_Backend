const { pool, traccarPool } = require('../config/db');
const { calculateDistance } = require('../utils/distance');

let isCycleRunning = false;

/**
 * Automatic Device Sync
 * Traccar DB se devices read karke App DB me batch upsert karta hai
 */
const syncTraccarDevices = async () => {
    try {
        const { rows: traccarDevices } = await traccarPool.query(
            "SELECT id, name, uniqueid FROM tc_devices"
        );
        if (!traccarDevices.length) return;

        const ids = traccarDevices.map(d => Number(d.id));
        const names = traccarDevices.map(d => d.name || `Truck-${d.id}`);
        const imeis = traccarDevices.map(d => d.uniqueid || null);

        await pool.query(`
            INSERT INTO vehicles (traccar_id, name, imei, type, status)
            SELECT u.id, u.name, u.imei, 'truck', 'idle'
            FROM UNNEST($1::int[], $2::text[], $3::text[]) AS u(id, name, imei)
            ON CONFLICT (traccar_id) DO UPDATE SET
                name = EXCLUDED.name,
                imei = COALESCE(EXCLUDED.imei, vehicles.imei)
        `, [ids, names, imeis]);
    } catch (err) {
        console.error("⚠️ Device Auto-Sync Error:", err.message);
    }
};

const upsertVehicleStatuses = async (rows) => {
    if (!rows.length) return;

    const vehicleIds = rows.map(r => r.vehicle_id);
    const states = rows.map(r => r.current_state);
    const lats = rows.map(r => r.latitude);
    const lngs = rows.map(r => r.longitude);
    const speeds = rows.map(r => r.speed);
    const lastUpdates = rows.map(r => r.last_update);
    const ignitions = rows.map(r => r.ignition);
    const odometers = rows.map(r => r.odometer);

    await pool.query(`
        INSERT INTO vehicle_status (
            vehicle_id, current_state, latitude, longitude, speed, last_update, ignition, odometer
        )
        SELECT
            u.vehicle_id, u.current_state, u.latitude, u.longitude, u.speed, u.last_update, u.ignition, u.odometer
        FROM UNNEST(
            $1::int[], $2::text[], $3::numeric[], $4::numeric[],
            $5::numeric[], $6::timestamp[], $7::boolean[], $8::numeric[]
        ) AS u(vehicle_id, current_state, latitude, longitude, speed, last_update, ignition, odometer)
        ON CONFLICT (vehicle_id) DO UPDATE SET
            current_state = EXCLUDED.current_state,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            speed = EXCLUDED.speed,
            last_update = EXCLUDED.last_update,
            ignition = EXCLUDED.ignition,
            odometer = EXCLUDED.odometer
    `, [vehicleIds, states, lats, lngs, speeds, lastUpdates, ignitions, odometers]);
};

const processGpsData = async () => {
    if (isCycleRunning) {
        console.log("⏳ GPS Cycle already running, skipping overlapping tick.");
        return;
    }

    isCycleRunning = true;
    try {
        await syncTraccarDevices();

        const [{ rows: trucks }, { rows: zones }] = await Promise.all([
            pool.query("SELECT id, name, traccar_id, imei, status FROM vehicles WHERE type = 'truck'"),
            pool.query("SELECT id, name, type, latitude, longitude, radius FROM geofences")
        ]);

        if (!trucks.length) {
            console.log("--- ✅ GPS Cycle Finished (0 trucks) ---");
            return;
        }

        const traccarIds = [...new Set(
            trucks
                .map(t => parseInt(t.traccar_id, 10))
                .filter(id => !Number.isNaN(id))
        )];

        if (!traccarIds.length) {
            console.log("--- ✅ GPS Cycle Finished (no valid traccar_ids) ---");
            return;
        }

        // Single batch query instead of N+1 per-truck queries
        const { rows: traccarRows } = await traccarPool.query(`
            SELECT
                d.id AS traccar_id,
                p.latitude,
                p.longitude,
                p.speed,
                p.attributes,
                p.devicetime
            FROM tc_devices d
            JOIN tc_positions p ON p.id = d.positionid
            WHERE d.id = ANY($1::int[])
        `, [traccarIds]);

        const posMap = new Map();
        for (const r of traccarRows) {
            posMap.set(Number(r.traccar_id), r);
        }

        const statusUpdates = [];
        const socketPayloads = [];

        for (const truck of trucks) {
            const traccarId = parseInt(truck.traccar_id, 10);
            if (Number.isNaN(traccarId)) continue;

            const pos = posMap.get(traccarId);
            if (!pos) continue;

            let sensorData = {};
            if (typeof pos.attributes === 'string') {
                try { sensorData = JSON.parse(pos.attributes); } catch (e) { sensorData = {}; }
            } else if (pos.attributes && typeof pos.attributes === 'object') {
                sensorData = pos.attributes;
            }

            const currentLat = parseFloat(pos.latitude);
            const currentLng = parseFloat(pos.longitude);
            if (Number.isNaN(currentLat) || Number.isNaN(currentLng)) continue;

            const currentSpeed = parseFloat((Number(pos.speed || 0) * 1.852).toFixed(1));
            const ignition = Boolean(sensorData.ignition);
            const rawDistance = Number(sensorData.totalDistance || sensorData.distance || 0);
            const odometer = parseFloat((rawDistance / 1000).toFixed(2));

            let newState = ignition ? (currentSpeed > 0.5 ? 'MOVING' : 'IDLE') : 'PARKED';

            const currentZone = zones.find(z =>
                calculateDistance(currentLat, currentLng, parseFloat(z.latitude), parseFloat(z.longitude)) <= parseFloat(z.radius)
            );

            if (currentZone) {
                const zoneType = String(currentZone.type || '').toLowerCase();
                if (zoneType === 'mine' || zoneType === 'loading') {
                    newState = currentSpeed < 0.5 ? 'LOADING' : 'AT_MINE';
                } else if (zoneType === 'plant' || zoneType === 'unloading') {
                    const isBodyUp = sensorData.in1 === "true" || sensorData.in1 === true || sensorData.in1 === 1;
                    newState = isBodyUp ? 'UNLOADING' : 'AT_PLANT';
                }
            }

            statusUpdates.push({
                vehicle_id: traccarId,
                current_state: newState,
                latitude: currentLat,
                longitude: currentLng,
                speed: currentSpeed,
                last_update: pos.devicetime,
                ignition,
                odometer
            });

            socketPayloads.push({
                traccar_id: traccarId,
                name: truck.name,
                latitude: currentLat,
                longitude: currentLng,
                speed: currentSpeed,
                current_state: newState,
                ignition,
                odometer,
                last_update: pos.devicetime
            });
        }

        await upsertVehicleStatuses(statusUpdates);

        if (global.io) {
            for (const payload of socketPayloads) {
                global.io.emit('v-update', payload);
            }
        }

        console.log("--- ✅ GPS Cycle Finished ---");
    } catch (err) {
        console.error("❌ CRITICAL WORKER ERROR:", err.message);
    } finally {
        isCycleRunning = false;
    }
};

// 20 sec interval taaki DB & CPU par continuous pressure na pade
setInterval(processGpsData, 20000);

module.exports = { processGpsData };