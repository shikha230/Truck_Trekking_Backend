// geofenceController.js
const { traccarPool } = require('../config/db');
const { parseWKT } = require('../utils/distance');
const axios = require('axios');

// Traccar API Credentials (apne server ke mutabiq adjust kar sakte hain)
const TRACCAR_API_URL = 'http://traccar-uksd.srv1882256.hstgr.cloud:8082/api/geofences';
const TRACCAR_AUTH = {
    username: 'sachinpat68@gmail.com', // Apna Traccar login email
    password: 'And&kus26'       // Apna Traccar password
};


exports.getAllGeofences = async (req, res) => {
    try {
        const result = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        
        const formattedGeofences = result.rows.map(g => {
            const { coordinates, center } = parseWKT(g.area);
            const nameLower = (g.name || '').toLowerCase();
            
            let geofenceType = 'loading';
            if (nameLower.includes('gps limit')) {
                geofenceType = 'boundary'; // Master outer limit
            } else if (nameLower.includes('unloading')) {
                geofenceType = 'unloading';
            } else if (nameLower.includes('loading')) {
                geofenceType = 'loading';
            }

            return {
                id: g.id,
                name: g.name,
                type: geofenceType,
                coordinates: coordinates, 
                latitude: center ? center.latitude : null,
                longitude: center ? center.longitude : null
            };
        });

        res.status(200).json(formattedGeofences);
    } catch (err) {
        console.error("❌ Error fetching geofences:", err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.addGeofence = async (req, res) => {
    const { name, latitude, longitude, radius } = req.body;
    try {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        const rad = (parseFloat(radius || 150) / 111320);

        const latMin = lat - rad;
        const latMax = lat + rad;
        const lonMin = lon - rad;
        const lonMax = lon + rad;

        const polygonWkt = `POLYGON ((${latMin} ${lonMin}, ${latMin} ${lonMax}, ${latMax} ${lonMax}, ${latMax} ${lonMin}, ${latMin} ${lonMin}))`;

        let newGeofenceId = null;
        try {
            const apiResponse = await axios.post(TRACCAR_API_URL, {
                name: name,
                description: '',
                area: polygonWkt,
                attributes: {}
            }, {
                auth: TRACCAR_AUTH
            });
            newGeofenceId = apiResponse.data.id;
        } catch (apiErr) {
            console.warn("⚠️ Traccar API failed, falling back to direct database insertion:", apiErr.message);
            
            const dbResult = await traccarPool.query(
                `INSERT INTO tc_geofences (name, description, area, attributes) 
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [name, '', polygonWkt, '{}']
            );
            newGeofenceId = dbResult.rows[0].id;
        }

        try {
            await traccarPool.query(
                `INSERT INTO tc_user_geofences (userid, geofenceid) 
                 SELECT id, $1 FROM tc_users ON CONFLICT DO NOTHING`,
                [newGeofenceId]
            );
        } catch (mapErr) {
            console.warn("⚠️ User mapping warning:", mapErr.message);
        }

        // Log creation in history
        await traccarPool.query(
            `INSERT INTO tc_geofence_history (geofence_id, name, area, action_type) VALUES ($1, $2, $3, $4)`,
            [newGeofenceId, name, polygonWkt, 'CREATED']
        );

        const { coordinates, center } = parseWKT(polygonWkt);

        res.status(201).json({
            id: newGeofenceId,
            name: name,
            coordinates,
            latitude: center ? center.latitude : null,
            longitude: center ? center.longitude : null,
            message: "Geofence added successfully."
        });
    } catch (err) {
        console.error("❌ Error adding geofence to Traccar:", err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteGeofence = async (req, res) => {
    const geofenceId = req.params.id;
    try {
        const existing = await traccarPool.query(`SELECT id, name, area FROM tc_geofences WHERE id = $1`, [geofenceId]);
        
        if (existing.rows.length > 0) {
            const { name, area } = existing.rows[0];
            
            await traccarPool.query(
                `INSERT INTO tc_geofence_history (geofence_id, name, area, action_type) VALUES ($1, $2, $3, $4)`,
                [geofenceId, name, area, 'DELETED']
            );
            console.log(`📝 Logged deletion for geofence: ${name} (ID: ${geofenceId})`);
        }

        try {
            await axios.delete(`${TRACCAR_API_URL}/${geofenceId}`, { auth: TRACCAR_AUTH });
        } catch (apiErr) {
            console.warn("⚠️ Traccar API delete warning, removing from database directly:", apiErr.message);
        }

        await traccarPool.query("DELETE FROM tc_user_geofences WHERE geofenceid = $1", [geofenceId]);
        await traccarPool.query("DELETE FROM tc_geofences WHERE id = $1", [geofenceId]);

        res.status(200).json({ message: "Geofence deleted successfully and logged in history." });
    } catch (err) {
        console.error("❌ Error deleting geofence:", err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.getGeofenceHistory = async (req, res) => {
    try {
        const result = await traccarPool.query(
            `SELECT * FROM tc_geofence_history ORDER BY performed_at DESC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching geofence history:", err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.restoreGeofence = async (req, res) => {
    const { historyId } = req.params;
    try {
        const historyRes = await traccarPool.query(
            `SELECT name, area FROM tc_geofence_history WHERE id = $1`, 
            [historyId]
        );

        if (historyRes.rows.length === 0) {
            return res.status(404).json({ error: "History record not found." });
        }

        const { name, area } = historyRes.rows[0];
        const restoredName = name.includes('(Restored)') ? name : `${name} (Restored)`;

        let restoredGeofenceId = null;
        try {
            const apiResponse = await axios.post(TRACCAR_API_URL, {
                name: restoredName,
                description: '',
                area: area,
                attributes: {}
            }, {
                auth: TRACCAR_AUTH
            });
            restoredGeofenceId = apiResponse.data.id;
        } catch (apiErr) {
            console.warn("⚠️ Traccar API restore failed, falling back to direct database insertion:", apiErr.message);
            
            const insertRes = await traccarPool.query(
                `INSERT INTO tc_geofences (name, description, area, attributes) 
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [restoredName, '', area, '{}']
            );
            restoredGeofenceId = insertRes.rows[0].id;
        }

        await traccarPool.query(
            `INSERT INTO tc_user_geofences (userid, geofenceid) 
             SELECT id, $1 FROM tc_users ON CONFLICT DO NOTHING`,
            [restoredGeofenceId]
        );

        await traccarPool.query(
            `INSERT INTO tc_geofence_history (geofence_id, name, area, action_type) VALUES ($1, $2, $3, $4)`,
            [restoredGeofenceId, restoredName, area, 'RESTORED']
        );

        res.status(200).json({ 
            message: "Geofence restored successfully!", 
            restoredGeofence: { id: restoredGeofenceId, name: restoredName, area } 
        });
    } catch (err) {
        console.error("❌ Error restoring geofence:", err.message);
        res.status(500).json({ error: err.message });
    }
};