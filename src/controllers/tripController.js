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
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;
        
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
    queryText += ` AND (t.vehicle_id::text = $${paramIndex}::text OR v.traccar_id::text = $${paramIndex}::text)`;
    queryParams.push(vehicleId);
    paramIndex++;
}

        // DateTime Filters
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
            queryText += ` AND t.start_time >= $${paramIndex}::timestamp AND t.start_time <= $${paramIndex + 1}::timestamp`;
            queryParams.push(from, to);
            paramIndex += 2;
        }

        queryText += ` ORDER BY t.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(limitNum, offset);

        const result = await pool.query(queryText, queryParams);
        
        console.log(`📤 Sending ${result.rows.length} trips to frontend for vehicleId: ${vehicleId || 'All'}`);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("❌ Trips API Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getRecentTrips };
const getTruckHistory = async (req, res) => {
    const { deviceId } = req.params;
    let { from, to, fromTime, toTime } = req.query;

    try {
        // 1. Fetch local geofences
        const zonesRes = await pool.query("SELECT * FROM geofences");
        const zones = zonesRes.rows;

        // Base Query joining tc_positions and vehicles
        let queryText = `
            SELECT p.devicetime, p.latitude, p.longitude, p.speed, p.attributes, p.deviceid, v.name as vehicle_name
            FROM tc_positions p 
            LEFT JOIN vehicles v ON p.deviceid = v.traccar_id
        `;
        const queryParams = [];

        // 2. Dynamic Vehicle Filter ('all' vs specific deviceId)
        if (deviceId && deviceId !== 'all') {
            queryParams.push(Number(deviceId));
            queryText += ` WHERE p.deviceid = $1`;
        }

        // 3. Date Range Handling (Fixed Duplicate String issue)
        if (from && to) {
            let startTimestamp = String(from).trim().replace('T', ' ');
            let endTimestamp = String(to).trim().replace('T', ' ');

            if (startTimestamp.length === 10) {
                const startTimeStr = fromTime ? (fromTime.length === 5 ? `${fromTime}:00` : fromTime) : '00:00:00';
                startTimestamp = `${startTimestamp} ${startTimeStr}`;
            }

            if (endTimestamp.length === 10) {
                const endTimeStr = toTime ? (toTime.length === 5 ? `${toTime}:59` : toTime) : '23:59:59';
                endTimestamp = `${endTimestamp} ${endTimeStr}`;
            }

            const hasWhere = queryText.includes('WHERE');
            queryText += hasWhere ? ` AND ` : ` WHERE `;

            // IST to UTC time offset adjustment for Traccar database
            queryText += `p.devicetime >= ($${queryParams.length + 1}::timestamp - INTERVAL '5 hours 30 minutes') AND p.devicetime <= ($${queryParams.length + 2}::timestamp - INTERVAL '5 hours 30 minutes')`;
            queryParams.push(startTimestamp, endTimestamp);
        }

        queryText += ` ORDER BY p.devicetime DESC LIMIT 100`; 

        console.log("🔍 Executing History Query:", queryText);
        console.log("📦 Query Params:", queryParams);

        const result = await traccarPool.query(queryText, queryParams);
        console.log(`✅ Rows fetched from DB: ${result.rows.length}`);

        const processedHistory = result.rows.map(row => {
            const attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
            const speedKmh = Math.round((row.speed || 0) * 1.852);
            const point = { latitude: row.latitude, longitude: row.longitude };
            let activeZoneName = '';

            for (const zone of zones) {
                if (typeof isPointWithinRadius === 'function' && isPointWithinRadius(point, { latitude: parseFloat(zone.latitude), longitude: parseFloat(zone.longitude) }, zone.radius || 150)) {
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
        console.error("❌ Error in getTruckHistory:", err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getRecentTrips, getTruckHistory, getVehiclesList };