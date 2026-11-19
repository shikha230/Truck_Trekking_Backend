const { pool, traccarPool } = require('../config/db');

const getDashboardStats = async (req, res) => {
    try {
        // 1. Total Vehicles
        const totalVehiclesRes = await pool.query("SELECT COUNT(*) FROM vehicles");
        const totalVehicles = parseInt(totalVehiclesRes.rows[0]?.count, 10) || 0;

        // 2. Total Online Vehicles (recent position within last 10 mins or speed > 0 / motion)
        let totalOnline = 0;
        try {
            const onlineRes = await traccarPool.query(`
                SELECT COUNT(DISTINCT deviceid) AS online_count
                FROM tc_positions
                WHERE devicetime >= NOW() - INTERVAL '10 minutes'
            `);
            totalOnline = parseInt(onlineRes.rows[0]?.online_count, 10) || 0;
        } catch (traccarErr) {
            console.warn("⚠️ Traccar online query fallback:", traccarErr.message);
            const fallbackRes = await pool.query(`
                SELECT COUNT(*) AS online_count
                FROM vehicles
                WHERE LOWER(COALESCE(status, '')) IN ('online', 'active', 'moving', 'running')
            `);
            totalOnline = parseInt(fallbackRes.rows[0]?.online_count, 10) || 0;
        }

        res.status(200).json({
            totalVehicles,
            totalOnline
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getDashboardStats };