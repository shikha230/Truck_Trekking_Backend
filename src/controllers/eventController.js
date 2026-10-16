const { pool } = require('../config/db');

const getRecentEvents = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, v.name as vehicle_name 
            FROM event_logs e
            JOIN vehicles v ON v.traccar_id = e.vehicle_id
            ORDER BY e.timestamp DESC 
            LIMIT 20
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getRecentEvents };