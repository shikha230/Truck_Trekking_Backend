// geofenceController.js
const { pool, traccarPool } = require('../config/db');
const { parseWKT } = require('../utils/distance');

exports.getAllGeofences = async (req, res) => {
    try {
        const result = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        
        const formattedGeofences = result.rows.map(g => {
            const { coordinates, center } = parseWKT(g.area);
            const nameLower = g.name.toLowerCase();
            
            let geofenceType = 'loading';
            if (nameLower.includes('unloading')) {
                geofenceType = 'unloading';
            } else if (nameLower.includes('loading')) {
                geofenceType = 'loading';
            }

            return {
                id: g.id,
                name: g.name,
                type: geofenceType,
                coordinates: coordinates, // Sends real polygon boundary points to frontend
                latitude: center ? center.latitude : null,
                longitude: center ? center.longitude : null
            };
        });

        res.status(200).json(formattedGeofences);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.addGeofence = async (req, res) => {
    const { name, type, latitude, longitude, radius } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO geofences (name, type, latitude, longitude, radius) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [name, type, latitude, longitude, radius]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteGeofence = async (req, res) => {
    try {
        await pool.query("DELETE FROM geofences WHERE id = $1", [req.params.id]);
        res.status(200).json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};