const { pool, traccarPool } = require('../config/db');

const { calculateDistance, getGeofenceCenter } = require('../utils/distance'); // Aapki distance.js file
const getLiveVehicles = async (req, res) => {
    try {
        const ourVehicles = await pool.query(`
            SELECT v.name, v.traccar_id, v.imei as vehicle_imei, s.current_state, s.last_update 
            FROM vehicles v
            LEFT JOIN vehicle_status s ON v.traccar_id = s.vehicle_id
            WHERE v.type = 'truck'
        `);

        if (ourVehicles.rows.length === 0) return res.json([]);
        const ids = ourVehicles.rows.map(v => v.traccar_id);

        // Fetch Traccar devices & positions
        const traccarData = await traccarPool.query(`
            SELECT d.id as traccar_id, d.uniqueid as traccar_imei, p.latitude, p.longitude, p.speed, p.address, p.attributes
            FROM tc_devices d
            LEFT JOIN tc_positions p ON p.id = d.positionid
            WHERE d.id = ANY($1)
        `, [ids]);

        // Fetch Geofences directly from Traccar DB
        const geofences = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        
        const loadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('loading'));
        const unloadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('unloading'));

        const loadingCenter = loadingGeofence ? getGeofenceCenter(loadingGeofence.area) : null;
        const unloadingCenter = unloadingGeofence ? getGeofenceCenter(unloadingGeofence.area) : null;

        const finalData = ourVehicles.rows.map(v => {
            // Number comparison to avoid type mismatch (String vs Number)
            const gps = traccarData.rows.find(g => Number(g.traccar_id) === Number(v.traccar_id));
            
            let distToLoading = 'N/A';
            let distToUnloading = 'N/A';
            let ignition = false;
            let bodyStatus = 'Down';

            if (gps) {
                let attrs = {};
                try {
                    attrs = typeof gps.attributes === 'string' ? JSON.parse(gps.attributes) : (gps.attributes || {});
                } catch (e) {
                    attrs = {};
                }

                ignition = attrs.ignition === true || attrs.ignition === 'true' || attrs.ignition === 1;

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

            // Stronger IMEI mapping logic:
            // 1. local vehicles table imei
            // 2. traccar uniqueid
            // 3. fallback to traccar_id string
            const finalImei = v.vehicle_imei || (gps ? gps.traccar_imei : null) || String(v.traccar_id);

            return {
                ...v,
                imei: finalImei,
                latitude: gps ? gps.latitude : null,
                longitude: gps ? gps.longitude : null,
                speed: gps ? gps.speed : 0,
                ignition: ignition,
                bodyStatus: bodyStatus,
                distToLoading,
                distToUnloading
            };
        });

        res.status(200).json(finalData);
    } catch (err) {
        console.error("Error in getLiveVehicles:", err);
        res.status(500).json({ error: err.message });
    }
};
// 2. Fetch All Registered Vehicles
const getAllVehicles = async (req, res) => {
    try {
        // 1. Fetch vehicles from local database
        const result = await pool.query(`
            SELECT v.id, v.name, v.traccar_id, v.type, v.imei as vehicle_imei, s.current_state, s.last_update 
            FROM vehicles v
            LEFT JOIN vehicle_status s ON v.traccar_id = s.vehicle_id
            ORDER BY v.id ASC
        `);

        if (result.rows.length === 0) return res.json([]);
        const ids = result.rows.map(v => v.traccar_id).filter(Boolean);

        // 2. Fetch IMEI (uniqueid) from Traccar database using traccar_ids
        let traccarData = { rows: [] };
        if (ids.length > 0) {
            traccarData = await traccarPool.query(`
                SELECT id as traccar_id, uniqueid as traccar_imei 
                FROM tc_devices 
                WHERE id = ANY($1)
            `, [ids]);
        }

        // 3. Map IMEI properly to each vehicle
        const finalData = result.rows.map(v => {
            const gps = traccarData.rows.find(g => Number(g.traccar_id) === Number(v.traccar_id));
            const finalImei = v.vehicle_imei || (gps ? gps.traccar_imei : null) || String(v.traccar_id);

            return {
                ...v,
                imei: finalImei
            };
        });

        res.status(200).json(finalData);
    } catch (err) {
        console.error("Error in getAllVehicles:", err);
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