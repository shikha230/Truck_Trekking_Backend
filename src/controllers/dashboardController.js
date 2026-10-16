const { pool } = require('../config/db');

const getDashboardStats = async (req, res) => {
    try {
        // 1. Aaj ki total completed trips
      const totalTrips = await pool.query(
    "SELECT COUNT(*) FROM trips WHERE LOWER(status) = 'completed'"
);

        // 2. Currently kitne trucks 'Ongoing' ya 'LOADING'/'IN_TRANSIT' trip par hain
        const activeTrips = await pool.query(
            "SELECT COUNT(*) FROM trips WHERE LOWER(status) IN ('ongoing', 'loading', 'in_transit', 'unloading')"
        );

        // 3. Total truck count
        const totalVehicles = await pool.query("SELECT COUNT(*) FROM vehicles WHERE type = 'truck'");

        // 4. Average cycle time for today's completed trips (in minutes)
        const avgCycle = await pool.query(`
            SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))/60)::INT as avg_time 
            FROM trips 
            WHERE LOWER(status) = 'completed' AND DATE(start_time) = CURRENT_DATE
        `);

        res.status(200).json({
            todayTrips: parseInt(totalTrips.rows[0].count, 10) || 0,
            activeOnTrip: parseInt(activeTrips.rows[0].count, 10) || 0,
            totalTrucks: parseInt(totalVehicles.rows[0].count, 10) || 0,
            avgCycleTime: (avgCycle.rows[0]?.avg_time || 0) + ' min'
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: err.message });
    }
};
module.exports = { getDashboardStats };