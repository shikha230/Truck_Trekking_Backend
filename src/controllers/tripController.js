const { pool, traccarPool } = require('../config/db');
const { isPointWithinRadius } = require('geolib');

// Get Vehicles List for Dropdown
const getVehiclesList = async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, traccar_id FROM vehicles ORDER BY name ASC`);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Paginated & Filtered Completed Trips Fetch Controller
const getRecentTrips = async (req, res) => {
    try {
        const { vehicleId, from, to, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let queryText = `
            SELECT 
                t.*, 
                COALESCE(v.name, 'Unknown Truck') as vehicle_name 
            FROM trips t 
            LEFT JOIN vehicles v ON t.vehicle_id::text = v.traccar_id::text 
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        if (vehicleId && vehicleId !== 'all') {
            queryText += ` AND t.vehicle_id::text = $${paramIndex}::text`;
            queryParams.push(vehicleId);
            paramIndex++;
        }

        // DateTime Filters (Independent & Combined)
        if (from && !to) {
            queryText += ` AND t.start_time >= $${paramIndex}::timestamp`;
            queryParams.push(from);
            paramIndex++;
        }
        else if (!from && to) {
            queryText += ` AND t.start_time <= $${paramIndex}::timestamp`;
            queryParams.push(to);
            paramIndex++;
        }
        else if (from && to) {
            queryText += ` AND t.start_time >= $${paramIndex}::timestamp AND t.start_time <= $${paramIndex+1}::timestamp`;
            queryParams.push(from, to);
            paramIndex += 2;
        }

        queryText += ` ORDER BY t.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), offset);

        const result = await pool.query(queryText, queryParams);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getTruckHistory = async (req, res) => {
    const { deviceId } = req.params;
    const { from, to } = req.query;

    try {
        const zonesRes = await pool.query("SELECT * FROM geofences");
        const zones = zonesRes.rows;
        
        let queryText = `
            SELECT p.devicetime, p.latitude, p.longitude, p.speed, p.attributes
            FROM tc_positions p WHERE p.deviceid = $1
        `;
        const queryParams = [deviceId];

        if (from && to) {
            queryText += ` AND p.devicetime >= $2::timestamp AND p.devicetime < ($3::date + interval '1 day')`;
            queryParams.push(from, to);
        }

        queryText += ` ORDER BY p.devicetime DESC`;
        if (!from || !to) queryText += ` LIMIT 100`;

        const result = await traccarPool.query(queryText, queryParams);

        const processedHistory = result.rows.map(row => {
            const attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
            const speedKmh = Math.round((row.speed || 0) * 1.852);
            const point = { latitude: row.latitude, longitude: row.longitude };
            let activeZoneName = '';

            for (const zone of zones) {
                if (isPointWithinRadius(point, { latitude: zone.latitude, longitude: zone.longitude }, zone.radius || 100)) {
                    activeZoneName = zone.name;
                    break;
                }
            }

            return {
                ...row,
                speed_kmh: speedKmh,
                geofence_name: activeZoneName || null,
                location: activeZoneName || 'On Road / In Transit',
                status: speedKmh > 2 ? 'IN_TRANSIT' : (activeZoneName ? 'LOADING/UNLOADING' : 'STOPPED')
            };
        });

        res.status(200).json({ history: processedHistory, zones });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getRecentTrips, getTruckHistory, getVehiclesList };