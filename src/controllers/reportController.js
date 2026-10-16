const { pool } = require('../config/db');

const getShiftReport = async (req, res) => {
    try {
        const { date, from, to } = req.query; // date, from, aur to query parameters
        
        let query = `
            SELECT 
                v.id,
                v.name as truck_name,
                COUNT(t.id) as total_trips,
                COALESCE(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time))/60)::INT, 0) as total_minutes
            FROM vehicles v
            LEFT JOIN trips t ON v.traccar_id::text = t.vehicle_id::text
            WHERE v.type = 'truck'
        `;

        const queryParams = [];
        let paramIndex = 1;

        // Agar sirf date di gayi hai aur time nahi
        if (date && !from && !to) {
            query += ` AND DATE(t.start_time) = $${paramIndex}`;
            queryParams.push(date);
            paramIndex++;
        }

        // Agar From aur To time/date diya gaya hai
        if (from) {
            query += ` AND t.start_time >= $${paramIndex}::timestamp`;
            queryParams.push(from);
            paramIndex++;
        }
        if (to) {
            query += ` AND t.start_time <= $${paramIndex}::timestamp`;
            queryParams.push(to);
            paramIndex++;
        }

        query += ` GROUP BY v.id, v.name ORDER BY v.name ASC`;
        
        const result = await pool.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
module.exports = { getShiftReport };