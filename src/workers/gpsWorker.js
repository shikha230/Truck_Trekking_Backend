const { pool, traccarPool } = require('../config/db');
const { calculateDistance } = require('../utils/distance');

/**
 * 🔄 Automatic Device Sync
 * Traccar DB se naye devices/trucks read karke App DB me auto-add karta hai
 */
const syncTraccarDevices = async () => {
    try {
        const traccarDevices = (await traccarPool.query("SELECT id, name, uniqueid FROM tc_devices")).rows;

        for (const dev of traccarDevices) {
            // Direct UPSERT: Agar traccar_id pehle se hai to name update karega, nahi to NAYA INSERT kar dega
            await pool.query(`
                INSERT INTO vehicles (traccar_id, name, type, status)
                VALUES ($1, $2, 'truck', 'idle')
                ON CONFLICT (traccar_id) DO UPDATE SET name = EXCLUDED.name
            `, [dev.id, dev.name]);
        }
    } catch (err) {
        console.error("⚠️ Device Auto-Sync Error:", err.message);
    }
};

/**
 * Professional GPS Worker Loop
 */
const processGpsData = async () => {
    try {
        console.log("--- 🕵️‍♂️ GPS Monitoring Cycle Started ---");

        // 0. Sabse pehle Traccar se naye Trucks Auto-Sync karein
        await syncTraccarDevices();

        // 1. Fetch Updated Master Data
        const trucks = (await pool.query("SELECT * FROM vehicles WHERE type = 'truck'")).rows;
        const zones = (await pool.query("SELECT * FROM geofences")).rows;

        for (const truck of trucks) {
            const traccarId = parseInt(truck.traccar_id, 10);
            if (isNaN(traccarId)) continue;

            // 2. Fetch Latest Position from Traccar DB
            const traccarRes = await traccarPool.query(`
                SELECT p.latitude, p.longitude, p.speed, p.attributes, p.devicetime
                FROM tc_positions p
                JOIN tc_devices d ON d.positionid = p.id  
                WHERE d.id = $1
            `, [traccarId]);

            if (traccarRes.rows.length === 0) continue;

            const { latitude, longitude, speed, attributes, devicetime } = traccarRes.rows[0];

            let sensorData = {};
            if (typeof attributes === 'string') {
                try { sensorData = JSON.parse(attributes); } catch (e) { sensorData = {}; }
            } else if (attributes && typeof attributes === 'object') {
                sensorData = attributes;
            }

            const currentLat = parseFloat(latitude);
            const currentLng = parseFloat(longitude);
            const currentSpeed = parseFloat((speed * 1.852).toFixed(1));
            const ignition = Boolean(sensorData.ignition);
            const rawDistance = sensorData.totalDistance || sensorData.distance || 0;
            const odometer = parseFloat((rawDistance / 1000).toFixed(2));

            // Status State Engine
            let newState = ignition ? (currentSpeed > 0.5 ? 'MOVING' : 'IDLE') : 'PARKED';

            let currentZone = zones.find(z => 
                calculateDistance(currentLat, currentLng, parseFloat(z.latitude), parseFloat(z.longitude)) <= parseFloat(z.radius)
            );

            if (currentZone) {
                const zoneType = String(currentZone.type).toLowerCase();
                if (zoneType === 'mine' || zoneType === 'loading') {
                    newState = currentSpeed < 0.5 ? 'LOADING' : 'AT_MINE';
                } else if (zoneType === 'plant' || zoneType === 'unloading') {
                    const isBodyUp = sensorData.in1 === "true" || sensorData.in1 === true || sensorData.in1 === 1;
                    newState = isBodyUp ? 'UNLOADING' : 'AT_PLANT';
                }
            }

            // Update Status in DB
            await pool.query(`
                INSERT INTO vehicle_status (vehicle_id, current_state, latitude, longitude, speed, last_update, ignition, odometer)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (vehicle_id) DO UPDATE SET 
                current_state = $2, latitude = $3, longitude = $4, speed = $5, last_update = $6, ignition = $7, odometer = $8
            `, [traccarId, newState, currentLat, currentLng, currentSpeed, devicetime, ignition, odometer]);

            // Socket Emit
            if (global.io) {
                global.io.emit('v-update', {
                    traccar_id: traccarId,
                    name: truck.name,
                    latitude: currentLat, 
                    longitude: currentLng,
                    speed: currentSpeed,
                    current_state: newState,
                    ignition, odometer,
                    last_update: devicetime
                });
            }
        }
        console.log("--- ✅ GPS Cycle Finished ---");
    } catch (err) {
        console.error("❌ CRITICAL WORKER ERROR:", err.message);
    }
};

setInterval(processGpsData, 10000);

module.exports = { processGpsData };