const { pool, traccarPool } = require('../config/db');
const geolib = require('geolib');

const runGeofenceCheck = async () => {
    try {
        const geoRes = await pool.query("SELECT * FROM geofences");
        const myGeofences = geoRes.rows;

        // PostgreSQL JSONB casting added to p.attributes
        const traccarRes = await traccarPool.query(`
            SELECT d.id as traccar_id, d.name, p.latitude, p.longitude, p.speed, 
                   p.attributes::jsonb->>'ignition' as ignition, 
                   p.attributes::jsonb->>'motion' as motion
            FROM tc_devices d 
            JOIN tc_positions p ON d.positionid = p.id
        `);
        const liveTrucks = traccarRes.rows;

        for (const truck of liveTrucks) {
            let foundFence = null;
            const truckSpeedKMH = Math.round(truck.speed * 1.852);

            // 1. Check if inside any Geofence
            for (const fence of myGeofences) {
                const distance = geolib.getDistance(
                    { latitude: truck.latitude, longitude: truck.longitude },
                    { latitude: fence.latitude, longitude: fence.longitude }
                );
                if (distance <= fence.radius) {
                    foundFence = fence;
                    break;
                }
            }

            // 2. Logic to determine status
            let currentStatus = 'MOVING';
            if (foundFence) {
                if (truckSpeedKMH < 5) {
                    currentStatus = foundFence.type === 'mine' ? 'AT_MINE' : 'AT_PLANT';
                } else {
                    currentStatus = 'IN_TRANSIT';
                }
            } else {
                currentStatus = 'IN_TRANSIT';
            }

            // 3. Status Change Detection & Database Updates
            // 3. Status Change Detection & Database Updates
        const oldStatusRes = await pool.query("SELECT current_state FROM vehicle_status WHERE vehicle_id = $1", [truck.traccar_id]);
        const oldStatus = oldStatusRes.rows[0]?.current_state;

        if (currentStatus !== oldStatus) {
    // LOG EVENT: 'description' ki jagah 'details' column use kiya gaya hai
    await pool.query(
        "INSERT INTO event_logs (vehicle_id, event_type, details) VALUES ($1, $2, $3)",
        [truck.traccar_id, 'STATUS_CHANGE', `Truck changed status from ${oldStatus} to ${currentStatus}`]
    );

    // TRIP START: AT_MINE
    if (currentStatus === 'AT_MINE' && oldStatus !== 'AT_MINE') {
        await pool.query("INSERT INTO trips (truck_id, start_time, status) VALUES ($1, NOW(), 'ongoing')", [truck.traccar_id]);
    }
    
    // TRIP COMPLETE: AT_PLANT
    if (currentStatus === 'AT_PLANT' && oldStatus === 'IN_TRANSIT') {
        await pool.query(
            "UPDATE trips SET end_time = NOW(), status = 'completed' WHERE truck_id = $1 AND status = 'ongoing'",
            [truck.traccar_id]
        );
    }

    await pool.query(`
        INSERT INTO vehicle_status (vehicle_id, current_state, last_update)
        VALUES ($1, $2, NOW())
        ON CONFLICT (vehicle_id) DO UPDATE SET current_state = $2, last_update = NOW()
    `, [truck.traccar_id, currentStatus]);

    // 4. SOCKET EMIT
    if (global.io) {
        global.io.emit('v-update', {
            traccar_id: truck.traccar_id,
            name: truck.name,
            latitude: truck.latitude,
            longitude: truck.longitude,
            speed: truckSpeedKMH,
            current_state: currentStatus,
            ignition: truck.ignition
        });
    }
}
        }
    } catch (err) {
        console.error("Geofence Check Error:", err.message);
    }
};

setInterval(runGeofenceCheck, 10000);
module.exports = { runGeofenceCheck };