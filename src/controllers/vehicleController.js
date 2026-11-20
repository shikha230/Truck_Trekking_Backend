const { pool, traccarPool } = require('../config/db');

const { calculateDistance, getGeofenceCenter } = require('../utils/distance'); // Aapki distance.js file
const extractVoltage = (attrs = {}) => {
    const rawVolt =
        attrs.power ??
        attrs.battery ??
        attrs.voltage ??
        attrs.extPower ??
        attrs.io66 ??
        attrs.adc2 ??
        null;

    if (rawVolt === null || rawVolt === undefined || rawVolt === '') return null;
    const num = Number(rawVolt);
    if (Number.isNaN(num)) return null;

    const volts = num > 100 ? num / 1000 : num;
    return Number(volts.toFixed(1));
};

const formatInput1 = (attrs = {}) => {
    const raw = attrs.in1 ?? attrs.input1 ?? attrs.input_1 ?? attrs.io1 ?? null;
    if (raw === null || raw === undefined || raw === '') return 'No';
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
    const str = String(raw).trim().toLowerCase();
    if (str === 'true' || str === 'yes' || str === '1' || str === 'on') return 'Yes';
    if (str === 'false' || str === 'no' || str === '0' || str === 'off') return 'No';
    return String(raw);
};

const extractIo6 = (attrs = {}) => {
    const raw = attrs.io6 ?? attrs.io06 ?? attrs.adc3 ?? null;
    if (raw === null || raw === undefined || raw === '') return 0;
    const num = Number(raw);
    return Number.isNaN(num) ? 0 : num;
};

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
        const traccarData = await traccarPool.query(`
            SELECT d.id as traccar_id, d.uniqueid as traccar_imei, d.lastupdate as device_last_update,
                   p.latitude, p.longitude, p.speed, p.address, p.attributes
            FROM tc_devices d
            LEFT JOIN tc_positions p ON p.id = d.positionid
            WHERE d.id = ANY($1)
        `, [ids]);

        const geofences = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        const loadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('loading'));
        const unloadingGeofence = geofences.rows.find(g => g.name.toLowerCase().includes('unloading'));

        const loadingCenter = loadingGeofence ? getGeofenceCenter(loadingGeofence.area) : null;
        const unloadingCenter = unloadingGeofence ? getGeofenceCenter(unloadingGeofence.area) : null;

        const finalData = ourVehicles.rows.map(v => {
            const gps = traccarData.rows.find(g => Number(g.traccar_id) === Number(v.traccar_id));

            let distToLoading = 'N/A';
            let distToUnloading = 'N/A';
            let ignition = false;
            let bodyStatus = 'Down';
            let voltageVal = null;
            let batteryFuelVal = 'N/A';
            let io6Val = 0;
            let io9Val = 0;
            let input1Val = 'No';
            let attrs = {};

            if (gps) {
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

                io6Val = extractIo6(attrs);

                if (attrs.io9 !== undefined) {
                    io9Val = Number(attrs.io9);
                } else if (attrs.adc1 !== undefined) {
                    io9Val = Number(attrs.adc1);
                }

                input1Val = formatInput1(attrs);
                voltageVal = extractVoltage(attrs);

                if (voltageVal !== null) {
                    batteryFuelVal = `${voltageVal.toFixed(1)} V`;
                } else if (attrs.batteryLevel !== undefined) {
                    batteryFuelVal = `${attrs.batteryLevel}%`;
                } else if (attrs.fuel !== undefined) {
                    batteryFuelVal = `${attrs.fuel}%`;
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

            const finalImei = v.vehicle_imei || (gps ? gps.traccar_imei : null) || String(v.traccar_id);
            const lastUpdate = v.last_update || (gps ? gps.device_last_update : null);

            return {
                ...v,
                imei: finalImei,
                lastUpdate,
                latitude: gps ? gps.latitude : null,
                longitude: gps ? gps.longitude : null,
                speed: gps ? Number(gps.speed || 0) : 0,
                address: gps ? gps.address : 'Location updating...',
                ignition,
                bodyStatus,
                io6: io6Val,
                io9: io9Val,
                input1: input1Val,
                in1: input1Val,
                voltage: voltageVal,
                batteryFuel: batteryFuelVal,
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