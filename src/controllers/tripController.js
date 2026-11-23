// const { pool, traccarPool } = require('../config/db');
// const { isPointWithinRadius } = require('geolib');

// // Get Vehicles List for Dropdown
// const getVehiclesList = async (req, res) => {
//     try {
//         const result = await pool.query(`SELECT id, name, traccar_id FROM vehicles ORDER BY name ASC`);
//         res.status(200).json(result.rows);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };

// // Paginated & Filtered Completed Trips Fetch Controller
// const getRecentTrips = async (req, res) => {
//     try {
//         const { vehicleId, from, to, shift, page = 1, limit = 10 } = req.query;
//         const pageNum = parseInt(page, 10) || 1;
//         const limitNum = parseInt(limit, 10) || 10;
//         const offset = (pageNum - 1) * limitNum;
        
//         let queryText = `
//             SELECT 
//                 t.*, 
//                 COALESCE(v.name, 'Unknown Truck') as vehicle_name 
//             FROM trips t 
//             LEFT JOIN vehicles v ON t.vehicle_id::text = v.traccar_id::text 
//             WHERE 1=1
//         `;
//         const queryParams = [];
//         let paramIndex = 1;

//         if (vehicleId && vehicleId !== 'all') {
//             queryText += ` AND (t.vehicle_id::text = $${paramIndex}::text OR v.traccar_id::text = $${paramIndex}::text)`;
//             queryParams.push(vehicleId);
//             paramIndex++;
//         }

//         // Shift-wise filtering based on client requirement (6am-2pm, 2pm-10pm, 10pm-6am)
//         if (shift) {
//             if (shift === 'shift1') { // 06:00 to 14:00
//                 queryText += ` AND EXTRACT(HOUR FROM t.start_time) >= 6 AND EXTRACT(HOUR FROM t.start_time) < 14`;
//             } else if (shift === 'shift2') { // 14:00 to 22:00
//                 queryText += ` AND EXTRACT(HOUR FROM t.start_time) >= 14 AND EXTRACT(HOUR FROM t.start_time) < 22`;
//             } else if (shift === 'shift3') { // 22:00 to 06:00
//                 queryText += ` AND (EXTRACT(HOUR FROM t.start_time) >= 22 OR EXTRACT(HOUR FROM t.start_time) < 6)`;
//             }
//         }

//         // DateTime Filters
//         if (from && !to) {
//             queryText += ` AND t.start_time >= $${paramIndex}::timestamp`;
//             queryParams.push(from);
//             paramIndex++;
//         }
//         else if (!from && to) {
//             queryText += ` AND t.start_time <= $${paramIndex}::timestamp`;
//             queryParams.push(to);
//             paramIndex++;
//         }
//         else if (from && to) {
//             queryText += ` AND t.start_time >= $${paramIndex}::timestamp AND t.start_time <= $${paramIndex + 1}::timestamp`;
//             queryParams.push(from, to);
//             paramIndex += 2;
//         }

//         queryText += ` ORDER BY t.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
//         queryParams.push(limitNum, offset);

//         const result = await pool.query(queryText, queryParams);
        
//         console.log(`📤 Sending ${result.rows.length} trips to frontend for vehicleId: ${vehicleId || 'All'}`);
//         res.status(200).json(result.rows);
//     } catch (err) {
//         console.error("❌ Trips API Error:", err.message);
//         res.status(500).json({ error: err.message });
//     }
// };

// // const getTruckHistory = async (req, res) => {
// //     const { deviceId } = req.params;
// //     let { from, to, fromTime, toTime } = req.query;

// //     try {
// //         // 1. Fetch local geofences
// //         const zonesRes = await pool.query("SELECT * FROM geofences");
// //         const zones = zonesRes.rows;

// //         // Base Query joining tc_positions and vehicles
// //         let queryText = `
// //             SELECT p.devicetime, p.latitude, p.longitude, p.speed, p.attributes, p.deviceid, v.name as vehicle_name
// //             FROM tc_positions p 
// //             LEFT JOIN vehicles v ON p.deviceid = v.traccar_id
// //         `;
// //         const queryParams = [];

// //         // 2. Dynamic Vehicle Filter ('all' vs specific deviceId)
// //         if (deviceId && deviceId !== 'all') {
// //             queryParams.push(Number(deviceId));
// //             queryText += ` WHERE p.deviceid = $1`;
// //         }

// //         // 3. Date Range Handling (Fixed Duplicate String issue)
// //         if (from && to) {
// //             let startTimestamp = String(from).trim().replace('T', ' ');
// //             let endTimestamp = String(to).trim().replace('T', ' ');

// //             if (startTimestamp.length === 10) {
// //                 const startTimeStr = fromTime ? (fromTime.length === 5 ? `${fromTime}:00` : fromTime) : '00:00:00';
// //                 startTimestamp = `${startTimestamp} ${startTimeStr}`;
// //             }

// //             if (endTimestamp.length === 10) {
// //                 const endTimeStr = toTime ? (toTime.length === 5 ? `${toTime}:59` : toTime) : '23:59:59';
// //                 endTimestamp = `${endTimestamp} ${endTimeStr}`;
// //             }

// //             const hasWhere = queryText.includes('WHERE');
// //             queryText += hasWhere ? ` AND ` : ` WHERE `;

// //             // IST to UTC time offset adjustment for Traccar database
// //             queryText += `p.devicetime >= ($${queryParams.length + 1}::timestamp - INTERVAL '5 hours 30 minutes') AND p.devicetime <= ($${queryParams.length + 2}::timestamp - INTERVAL '5 hours 30 minutes')`;
// //             queryParams.push(startTimestamp, endTimestamp);
// //         }

// //         queryText += ` ORDER BY p.devicetime DESC LIMIT 100`; 

// //         console.log("🔍 Executing History Query:", queryText);
// //         console.log("📦 Query Params:", queryParams);

// //         const result = await traccarPool.query(queryText, queryParams);
// //         console.log(`✅ Rows fetched from DB: ${result.rows.length}`);

// //         const processedHistory = result.rows.map(row => {
// //             const attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
// //             const speedKmh = Math.round((row.speed || 0) * 1.852);
// //             const point = { latitude: row.latitude, longitude: row.longitude };
// //             let activeZoneName = '';

// //             for (const zone of zones) {
// //                 if (typeof isPointWithinRadius === 'function' && isPointWithinRadius(point, { latitude: parseFloat(zone.latitude), longitude: parseFloat(zone.longitude) }, zone.radius || 150)) {
// //                     activeZoneName = zone.name;
// //                     break;
// //                 }
// //             }

// //             return {
// //                 ...row,
// //                 speed_kmh: speedKmh,
// //                 geofence_name: activeZoneName || null,
// //                 location: activeZoneName || 'On Road / In Transit',
// //                 status: speedKmh > 2 ? 'IN_TRANSIT' : (activeZoneName ? 'LOADING/UNLOADING' : 'STOPPED')
// //             };
// //         });

// //         res.status(200).json({ history: processedHistory, zones });
// //     } catch (err) {
// //         console.error("❌ Error in getTruckHistory:", err.message);
// //         res.status(500).json({ error: err.message });
// //     }
// // };


// const getTruckHistory = async (req, res) => {
//     const { deviceId } = req.params;
//     let { startDate, endDate } = req.query;

//     try {
//         const zonesRes = await pool.query("SELECT * FROM geofences");
//         const zones = zonesRes.rows;

//         let queryText = `
//             SELECT 
//                 (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as devicetime, 
//                 p.latitude, p.longitude, p.speed, p.course, p.attributes, p.deviceid, v.name as vehicle_name
//             FROM tc_positions p 
//             LEFT JOIN vehicles v ON p.deviceid = v.traccar_id
//         `;
//         const queryParams = [];

//         if (deviceId && deviceId !== 'all') {
//             queryParams.push(Number(deviceId));
//             queryText += ` WHERE p.deviceid = $1`;
//         }

//         if (startDate && endDate) {
//             const hasWhere = queryText.includes('WHERE');
//             queryText += hasWhere ? ` AND ` : ` WHERE `;

//             // Yahan frontend ke IST input ko seedha match karenge kyunki p.devicetime ko bhi IST mein convert kar liya hai
//             queryText += `(p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${queryParams.length + 1}::timestamp 
//                           AND (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${queryParams.length + 2}::timestamp`;
//             queryParams.push(startDate, endDate);
//         }

//         queryText += ` ORDER BY p.devicetime ASC LIMIT 500`; 

//         console.log("🔍 Executing History Query:", queryText);
//         console.log("📦 Query Params:", queryParams);

//         const result = await traccarPool.query(queryText, queryParams);
//         console.log(`✅ Rows fetched from DB: ${result.rows.length}`);

//         const processedHistory = result.rows.map(row => {
//             const attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
//             const rawSpeedKnots = Number(row.speed || 0);
//             const speedKmh = Math.round(rawSpeedKnots * 1.852);
            
//             const point = { latitude: row.latitude, longitude: row.longitude };
//             let activeZoneName = '';

//             for (const zone of zones) {
//                 if (typeof isPointWithinRadius === 'function' && isPointWithinRadius(point, { latitude: parseFloat(zone.latitude), longitude: parseFloat(zone.longitude) }, zone.radius || 150)) {
//                     activeZoneName = zone.name;
//                     break;
//                 }
//             }

//             return {
//                 ...row,
//                 attributes,
//                 speed: rawSpeedKnots, 
//                 speed_kmh: speedKmh,
//                 geofence_name: activeZoneName || null,
//                 location: activeZoneName || 'On Road / In Transit',
//                 status: speedKmh > 2 ? 'IN_TRANSIT' : (activeZoneName ? 'LOADING/UNLOADING' : 'STOPPED')
//             };
//         });

//         res.status(200).json({ history: processedHistory, zones });
//     } catch (err) {
//         console.error("❌ Error in getTruckHistory:", err.message);
//         res.status(500).json({ error: err.message });
//     }
// };
// module.exports = { getRecentTrips, getTruckHistory, getVehiclesList };


const { pool, traccarPool } = require('../config/db');
const { isPointInPolygon, isPointWithinRadius } = require('geolib');

// 1. Get Vehicles List for Dropdown
const getVehiclesList = async (req, res) => {
    try {
        const localRes = await pool.query(`SELECT id, name, traccar_id FROM vehicles ORDER BY name ASC`);
        if (localRes.rows.length > 0) {
            return res.status(200).json(localRes.rows);
        }
        const traccarRes = await traccarPool.query(`SELECT id, id as traccar_id, name FROM tc_devices ORDER BY name ASC`);
        res.status(200).json(traccarRes.rows);
    } catch (err) {
        console.error("❌ Vehicles List Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// 2. Paginated & Filtered Trips Fetch Controller
const getRecentTrips = async (req, res) => {
    try {
        const { vehicleId, from, to, shift, page = 1, limit = 8 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 8);
        const offset = (pageNum - 1) * limitNum;

        const nameMap = {};
        try {
            const traccarDevs = await traccarPool.query(`SELECT id, name FROM tc_devices`);
            traccarDevs.rows.forEach(d => { nameMap[String(d.id)] = d.name; });
        } catch (e) {}

        try {
            const localDevs = await pool.query(`SELECT id, traccar_id, name FROM vehicles`);
            localDevs.rows.forEach(v => {
                if (v.traccar_id) nameMap[String(v.traccar_id)] = v.name;
                if (v.id) nameMap[String(v.id)] = v.name;
            });
        } catch (e) {}

        let whereClause = ` WHERE 1=1`;
        const queryParams = [];
        let paramIndex = 1;

        if (vehicleId && vehicleId !== 'all') {
            whereClause += ` AND t.vehicle_id::text = $${paramIndex}::text`;
            queryParams.push(String(vehicleId));
            paramIndex++;
        }

        if (shift && shift !== 'all') {
            if (shift === 'shift1') {
                whereClause += ` AND EXTRACT(HOUR FROM t.start_time) >= 6 AND EXTRACT(HOUR FROM t.start_time) < 14`;
            } else if (shift === 'shift2') {
                whereClause += ` AND EXTRACT(HOUR FROM t.start_time) >= 14 AND EXTRACT(HOUR FROM t.start_time) < 22`;
            } else if (shift === 'shift3') {
                whereClause += ` AND (EXTRACT(HOUR FROM t.start_time) >= 22 OR EXTRACT(HOUR FROM t.start_time) < 6)`;
            }
        }

        if (from && !to) {
            whereClause += ` AND t.start_time >= $${paramIndex}::timestamp`;
            queryParams.push(from);
            paramIndex++;
        } else if (!from && to) {
            whereClause += ` AND t.start_time <= $${paramIndex}::timestamp`;
            queryParams.push(to);
            paramIndex++;
        } else if (from && to) {
            whereClause += ` AND t.start_time >= $${paramIndex}::timestamp AND t.start_time <= $${paramIndex + 1}::timestamp`;
            queryParams.push(from, to);
            paramIndex += 2;
        }

        const countResult = await pool.query(`SELECT COUNT(*) FROM trips t ${whereClause}`, queryParams);
        const totalRecords = parseInt(countResult.rows[0].count, 10) || 0;
        const totalPages = Math.ceil(totalRecords / limitNum) || 1;

        const dataQuery = `
            SELECT t.* 
            FROM trips t 
            ${whereClause}
            ORDER BY t.start_time DESC, t.id DESC 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const dataParams = [...queryParams, limitNum, offset];
        const result = await pool.query(dataQuery, dataParams);

        const enrichedTrips = result.rows.map(row => ({
            ...row,
            vehicle_name: nameMap[String(row.vehicle_id)] || `Truck #${row.vehicle_id}`
        }));

        res.status(200).json({
            trips: enrichedTrips,
            pagination: { page: pageNum, limit: limitNum, totalRecords, totalPages, hasMore: pageNum < totalPages }
        });
    } catch (err) {
        console.error("❌ Trips API Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// 3. Truck History & Playback Controller
// const getTruckHistory = async (req, res) => {
//     const { deviceId } = req.params;
//     let { startDate, endDate } = req.query;

//     try {
//         const zonesRes = await pool.query("SELECT * FROM geofences");
//         const zones = zonesRes.rows;

//         let queryText = `
//             SELECT 
//                 (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as devicetime, 
//                 p.latitude, p.longitude, p.speed, p.course, p.attributes, p.deviceid, v.name as vehicle_name
//             FROM tc_positions p 
//             LEFT JOIN vehicles v ON p.deviceid = v.traccar_id
//         `;
//         const queryParams = [];

//         if (deviceId && deviceId !== 'all') {
//             queryParams.push(Number(deviceId));
//             queryText += ` WHERE p.deviceid = $1`;
//         }

//         if (startDate && endDate) {
//             const hasWhere = queryText.includes('WHERE');
//             queryText += hasWhere ? ` AND ` : ` WHERE `;
//             queryText += `(p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${queryParams.length + 1}::timestamp 
//                           AND (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${queryParams.length + 2}::timestamp`;
//             queryParams.push(startDate, endDate);
//         }

//         queryText += ` ORDER BY p.devicetime ASC LIMIT 1000`; 

//         const result = await traccarPool.query(queryText, queryParams);

//         const processedHistory = result.rows.map(row => {
//             const attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
//             const rawSpeedKnots = Number(row.speed || 0);
//             const speedKmh = Math.round(rawSpeedKnots * 1.852);
            
//             const point = { latitude: row.latitude, longitude: row.longitude };
//             let activeZoneName = '';

//             for (const zone of zones) {
//                 if (typeof isPointWithinRadius === 'function' && isPointWithinRadius(point, { latitude: parseFloat(zone.latitude), longitude: parseFloat(zone.longitude) }, zone.radius || 150)) {
//                     activeZoneName = zone.name;
//                     break;
//                 }
//             }

//             return {
//                 ...row,
//                 attributes,
//                 speed: rawSpeedKnots, 
//                 speed_kmh: speedKmh,
//                 geofence_name: activeZoneName || null,
//                 location: activeZoneName || 'On Road / In Transit',
//                 status: speedKmh > 2 ? 'IN_TRANSIT' : (activeZoneName ? 'LOADING/UNLOADING' : 'STOPPED')
//             };
//         });

//         res.status(200).json({ history: processedHistory, zones });
//     } catch (err) {
//         console.error("❌ Error in getTruckHistory:", err.message);
//         res.status(500).json({ error: err.message });
//     }
// };



const toGeolibPolygon = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return null;
    return coordinates.map(coord => ({
        latitude: Array.isArray(coord) ? Number(coord[0]) : Number(coord.latitude),
        longitude: Array.isArray(coord) ? Number(coord[1]) : Number(coord.longitude)
    }));
};

// 3. Truck History & Playback Controller (Filtered strictly inside "GPS LIMITs")
const getTruckHistory = async (req, res) => {
    const { deviceId } = req.params;
    let { startDate, endDate } = req.query;

    try {
        // 1. Fetch local geofences for loading/unloading zone matching
        const zonesRes = await pool.query("SELECT * FROM geofences");
        const zones = zonesRes.rows;

        // 2. Fetch "GPS LIMITs" master polygon from Traccar DB (tc_geofences)
        let gpsLimitPolygon = null;
        try {
            const geoRes = await traccarPool.query("SELECT name, area FROM tc_geofences");
            const gpsLimitRow = geoRes.rows.find(g =>
                (g.name || '').toLowerCase().includes('gps limit')
            );
            if (gpsLimitRow && gpsLimitRow.area) {
                const { coordinates } = parseWKT(gpsLimitRow.area);
                gpsLimitPolygon = toGeolibPolygon(coordinates);
            }
        } catch (geoErr) {
            console.warn("⚠️ Could not load GPS LIMITs polygon for history:", geoErr.message);
        }

        // 3. Fetch device names from Traccar as fallback if local vehicles table lacks a name
        const traccarNameMap = {};
        try {
            const devRes = await traccarPool.query("SELECT id, name FROM tc_devices");
            devRes.rows.forEach(d => {
                traccarNameMap[String(d.id)] = d.name;
            });
        } catch (devErr) {
            console.warn("⚠️ Could not fetch tc_devices names:", devErr.message);
        }

        let queryText = `
            SELECT 
                (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as devicetime, 
                p.latitude, p.longitude, p.speed, p.course, p.attributes, p.deviceid, v.name as vehicle_name
            FROM tc_positions p 
            LEFT JOIN vehicles v ON p.deviceid = v.traccar_id
        `;
        const queryParams = [];

        if (deviceId && deviceId !== 'all') {
            queryParams.push(Number(deviceId));
            queryText += ` WHERE p.deviceid = $1`;
        }

        if (startDate && endDate) {
            const hasWhere = queryText.includes('WHERE');
            queryText += hasWhere ? ` AND ` : ` WHERE `;
            queryText += `(p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${queryParams.length + 1}::timestamp 
                          AND (p.devicetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${queryParams.length + 2}::timestamp`;
            queryParams.push(startDate, endDate);
        }

        queryText += ` ORDER BY p.devicetime ASC LIMIT 1000`;

        const result = await traccarPool.query(queryText, queryParams);

        // 4. Filter out any points outside "GPS LIMITs" before processing
        const insideRows = result.rows.filter(row => {
            const lat = Number(row.latitude);
            const lng = Number(row.longitude);
            if (!lat || !lng) return false;
            if (!gpsLimitPolygon) return true;
            return isPointInPolygon({ latitude: lat, longitude: lng }, gpsLimitPolygon);
        });

        const processedHistory = insideRows.map(row => {
            let attributes = {};
            try {
                attributes = typeof row.attributes === 'string'
                    ? JSON.parse(row.attributes)
                    : (row.attributes || {});
            } catch (e) {
                attributes = {};
            }

            const rawSpeedKnots = Number(row.speed || 0);
            const speedKmh = Math.round(rawSpeedKnots * 1.852);

            const point = { latitude: Number(row.latitude), longitude: Number(row.longitude) };
            let activeZoneName = '';

            for (const zone of zones) {
                if ((zone.name || '').toLowerCase().includes('gps limit')) continue;

                if (
                    typeof isPointWithinRadius === 'function' &&
                    zone.latitude != null &&
                    zone.longitude != null &&
                    isPointWithinRadius(
                        point,
                        { latitude: parseFloat(zone.latitude), longitude: parseFloat(zone.longitude) },
                        zone.radius || 150
                    )
                ) {
                    activeZoneName = zone.name;
                    break;
                }
            }

            const resolvedVehicleName =
                row.vehicle_name || traccarNameMap[String(row.deviceid)] || `Truck #${row.deviceid}`;

            return {
                ...row,
                vehicle_name: resolvedVehicleName,
                attributes,
                speed: rawSpeedKnots,
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



module.exports = { 
    getRecentTrips, 
    getTruckHistory, 
    getVehiclesList,
};