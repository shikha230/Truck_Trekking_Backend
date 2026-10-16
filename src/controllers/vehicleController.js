const { pool, traccarPool } = require('../config/db');

const { calculateDistance, getGeofenceCenter } = require('../utils/distance'); // Aapki distance.js file

const getLiveVehicles = async (req, res) => {
    try {
        const ourVehicles = await pool.query(`
            SELECT v.name, v.traccar_id, s.current_state, s.last_update 
            FROM vehicles v
            LEFT JOIN vehicle_status s ON v.traccar_id = s.vehicle_id
            WHERE v.type = 'truck'
        `);

        if (ourVehicles.rows.length === 0) return res.json([]);
        const ids = ourVehicles.rows.map(v => v.traccar_id);

        // Fetch Live Positions & Attributes (Ignition, Speed, Body Up/Down via attributes) from Traccar
        const traccarData = await traccarPool.query(`
            SELECT d.id as traccar_id, p.latitude, p.longitude, p.speed, p.address, p.attributes
            FROM tc_devices d
            JOIN tc_positions p ON p.id = d.positionid
            WHERE d.id = ANY($1)
        `, [ids]);

        // Fetch Geofences directly from Traccar DB
        const geofences = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        
        const loadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('loading'));
        const unloadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('unloading'));

        const loadingCenter = loadingGeofence ? getGeofenceCenter(loadingGeofence.area) : null;
        const unloadingCenter = unloadingGeofence ? getGeofenceCenter(unloadingGeofence.area) : null;

        const finalData = ourVehicles.rows.map(v => {
            const gps = traccarData.rows.find(g => g.traccar_id === v.traccar_id);
            
            let distToLoading = 'N/A';
            let distToUnloading = 'N/A';

            let ignition = false;
            let bodyStatus = 'Down'; // Default body status

            if (gps) {
                // Parse attributes JSON object from Traccar
                let attrs = {};
                try {
                    attrs = typeof gps.attributes === 'string' ? JSON.parse(gps.attributes) : (gps.attributes || {});
                } catch (e) {
                    attrs = {};
                }

                // Extract Ignition (Traccar usually stores as boolean or string 'true'/'false' / 1/0)
                ignition = attrs.ignition === true || attrs.ignition === 'true' || attrs.ignition === 1;

                // Truck body up/down detection (Aapke sensor ke mutabiq io68, io69 ya specific attribute check kar sakte hain)
                // Jaise screenshot me io69 ya io68 dikh raha hai, yahan hum generic attribute ya io check kar rahe hain:
                if (attrs.io68 === 1 || attrs.io68 === '1' || attrs.body === 'up' || attrs.tipping === true) {
                    bodyStatus = 'Up';
                } else {
                    bodyStatus = 'Down';
                }

                if (gps.latitude && gps.longitude) {
                    if (loadingCenter) {
                        const m = calculateDistance(gps.latitude, gps.longitude, loadingCenter.latitude, loadingCenter.longitude);
                        distToLoading = (m / 1000).toFixed(2) + ' km';
                    }
                    if (unloadingCenter) {
                        const m = calculateDistance(gps.latitude, gps.longitude, unloadingCenter.latitude, unloadingCenter.longitude);
                        distToUnloading = (m / 1000).toFixed(2) + ' km';
                    }
                }
            }

            return {
                ...v,
                latitude: gps ? gps.latitude : null,
                longitude: gps ? gps.longitude : null,
                speed: gps ? gps.speed : 0,
                ignition: ignition,         // true/false
                bodyStatus: bodyStatus,     // 'Up' or 'Down'
                distToLoading,
                distToUnloading
            };
        });

        res.status(200).json(finalData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
// 2. Fetch All Registered Vehicles
const getAllVehicles = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, s.current_state, s.last_update 
            FROM vehicles v
            LEFT JOIN vehicle_status s ON v.traccar_id = s.vehicle_id
            ORDER BY v.id ASC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Register New Vehicle
const registerVehicle = async (req, res) => {
    const { name, traccar_id, type, imei } = req.body;
    
    if (!name || !traccar_id || !type) {
        return res.status(400).json({ error: "Name, Traccar ID, and Type are required" });
    }

    try {
        const result = await pool.query(
            "INSERT INTO vehicles (name, traccar_id, type, imei) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, traccar_id, type.toLowerCase(), imei]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Database error: " + err.message });
    }
};

// 4. Update Vehicle
const updateVehicle = async (req, res) => {
    const { id } = req.params;
    const { name, traccar_id, type, imei } = req.body;

    if (!name || !traccar_id || !type) {
        return res.status(400).json({ error: "Name, Traccar ID, and Type are required" });
    }

    try {
        const result = await pool.query(
            "UPDATE vehicles SET name = $1, traccar_id = $2, type = $3, imei = $4 WHERE id = $5 RETURNING *",
            [name, traccar_id, type.toLowerCase(), imei, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Vehicle not found" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Database error: " + err.message });
    }
};

// 5. Delete Vehicle
const deleteVehicle = async (req, res) => {
    const { id } = req.params;

    try {
        // Optional: cleanup associated vehicle status
        await pool.query(
            "DELETE FROM vehicle_status WHERE vehicle_id IN (SELECT traccar_id FROM vehicles WHERE id = $1)", 
            [id]
        );

        const result = await pool.query("DELETE FROM vehicles WHERE id = $1 RETURNING *", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Vehicle not found" });
        }

        res.status(200).json({ message: "Vehicle deleted successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Database error: " + err.message });
    }
};

module.exports = { 
    getLiveVehicles, 
    getAllVehicles, 
    registerVehicle, 
    updateVehicle, 
    deleteVehicle 
};