const { pool } = require('../config/db');
const { calculateDistance } = require('../utils/distance');

const processTripLogic = async (truck, zones, loaders) => {
    const { traccar_id, latitude, longitude, attributes } = truck;

    // 1. Check Geofence
    let currentZone = zones.find(z => calculateDistance(latitude, longitude, z.latitude, z.longitude) <= z.radius);

    // 2. Check Proximity to Loader (10 meters)
    let nearLoader = loaders.find(l => calculateDistance(latitude, longitude, l.latitude, l.longitude) <= 10);

    // 3. Logic: Start Trip (Mine + Near Loader + Load Increasing)
    if (currentZone?.type === 'mine' && nearLoader) {
        const ongoing = await pool.query("SELECT * FROM trips WHERE vehicle_id = $1 AND status = 'ongoing'", [traccar_id]);
        if (ongoing.rows.length === 0) {
            await pool.query(
                "INSERT INTO trips (vehicle_id, loader_id, start_lat, start_lng, status) VALUES ($1, $2, $3, $4, 'ongoing')",
                [traccar_id, nearLoader.traccar_id, latitude, longitude]
            );
            return "LOADING_STARTED";
        }
    }

    // 4. Logic: End Trip (Plant + Body Up Sensor)
    // Maan lete hain 'in1' body up sensor hai
    if (currentZone?.type === 'plant' && attributes.in1 === "true") {
        await pool.query(
            "UPDATE trips SET status = 'completed', end_time = NOW() WHERE vehicle_id = $1 AND status = 'ongoing'",
            [traccar_id]
        );
        return "TRIP_COMPLETED";
    }

    return "MOVING";
};

module.exports = { processTripLogic };