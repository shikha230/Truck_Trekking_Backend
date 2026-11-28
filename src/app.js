// const express = require('express');
// const cors = require('cors');
// const app = express();
// require('dotenv').config();// 1. Routes Import karein
// const dashboardRoutes = require('./routes/dashboardRoutes');
// const vehicleRoutes = require('./routes/vehicleRoutes');
// const reportRoutes = require('./routes/reportRoutes');
// const eventRoutes = require('./routes/eventRoutes');
// const geofenceRoutes = require('./routes/geofenceRoutes');
// const tripRoutes = require('./routes/tripRoutes');
// const authRoutes = require('./routes/authRoutes');
// const userRoutes = require('./routes/userRoutes');
// const { pool, traccarPool } = require('./config/db');
// app.use(cors());
// app.use(express.json());
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/vehicles', vehicleRoutes);
// app.use('/api/trips', tripRoutes);
// app.use('/api/reports', reportRoutes);
// app.use('/api/events', eventRoutes);
// app.use('/api/geofences', geofenceRoutes); 
// app.use('/api/trips', tripRoutes); 
// app.use('/api/auth', authRoutes); 
// app.use('/api/users', userRoutes);
// // app.get('/api/download_custom_csv', async (req, res) => {
// //     try {
// //         let { deviceId, startDate, endDate } = req.query;

// //         console.log("📥 Clean Query Params -> Device:", deviceId, "| Start:", startDate, "| End:", endDate);

// //         let query = `
// //             SELECT 
// //                 p.id, 
// //                 d.name AS device_name, 
// //                 d.uniqueid AS device_imei, 
// //                 p.protocol, 
// //                 TO_CHAR((p.servertime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS servertime, 
// //                 TO_CHAR((p.devicetime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime, 
// //                 TO_CHAR((p.fixtime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime, 
// //                 p.valid, 
// //                 p.latitude, 
// //                 p.longitude, 
// //                 p.altitude, 
// //                 p.speed, 
// //                 p.course, 
// //                 p.address, 
// //                 COALESCE((p.attributes::jsonb)->>'sat', (p.attributes::jsonb)->>'SAT') AS satellites, 
// //                 COALESCE((p.attributes::jsonb)->>'ignition', (p.attributes::jsonb)->>'Ignition') AS ignition, 
// //                 (p.attributes::jsonb)->>'motion' AS motion, 
// //                 (p.attributes::jsonb)->>'power' AS power, 
// //                 (p.attributes::jsonb)->>'battery' AS battery, 
// //                 (p.attributes::jsonb)->>'hdop' AS hdop, 
// //                 (p.attributes::jsonb)->>'pdop' AS pdop, 
// //                 (p.attributes::jsonb)->>'odometer' AS odometer, 
// //                 (p.attributes::jsonb)->>'totalDistance' AS total_distance, 
// //                 (p.attributes::jsonb)->>'hours' AS hours, 
// //                 (p.attributes::jsonb)->>'rssi' AS rssi, 
// //                 (p.attributes::jsonb)->>'event' AS event, 
// //                 (p.attributes::jsonb)->>'priority' AS priority, 
// //                 (p.attributes::jsonb)->>'operator' AS operator, 
// //                 (p.attributes::jsonb)->>'in1' AS input_1, 
// //                 (p.attributes::jsonb)->>'out1' AS output_1, 
// //                 (p.attributes::jsonb)->>'io9' AS io9,
// //                 COALESCE(
// //                     (p.attributes::jsonb)->>'io6', 
// //                     (p.attributes::jsonb)->>'IO6', 
// //                     (p.attributes::jsonb)->>'Io6',
// //                     ((p.attributes::jsonb)->'io6')::text
// //                 ) AS io6, 
// //                 (p.attributes::jsonb)->>'io69' AS io69, 
// //                 (p.attributes::jsonb)->>'io68' AS io68, 
// //                 (p.attributes::jsonb)->>'io113' AS io113
// //             FROM tc_positions p 
// //             JOIN tc_devices d ON p.deviceid = d.id 
// //             WHERE 1=1
// //         `;

// //         let queryParams = [];
// //         let paramIndex = 1;

// //         if (deviceId && deviceId !== 'all') {
// //             query += ` AND d.id = $${paramIndex}`;
// //             queryParams.push(deviceId);
// //             paramIndex++;
// //         }

// //         // ⚡ Simple and direct comparison with IST converted database time
// //         if (startDate && startDate !== 'undefined' && startDate.trim() !== '') {
// //             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') >= $${paramIndex}::timestamp`;
// //             queryParams.push(startDate.replace('T', ' '));
// //             paramIndex++;
// //         }

// //         if (endDate && endDate !== 'undefined' && endDate.trim() !== '') {
// //             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') <= $${paramIndex}::timestamp`;
// //             queryParams.push(endDate.replace('T', ' '));
// //             paramIndex++;
// //         }

// //         query += ` ORDER BY p.devicetime ASC LIMIT 20000;`;

// //         const result = await traccarPool.query(query, queryParams);
        
// //         if (result.rows.length === 0) {
// //             return res.status(404).send('No data found for the selected date range.');
// //         }

// //         const headers = Object.keys(result.rows[0]).join(',');
// //         const csvRows = result.rows.map(row => 
// //             Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
// //         );
        
// //         res.setHeader('Content-Type', 'text/csv');
// //         res.setHeader('Content-Disposition', 'attachment; filename="filtered_truck_report_exact.csv"');
// //         return res.status(200).send([headers, ...csvRows].join('\n'));

// //     } catch (err) {
// //         console.error('Custom CSV Export Error:', err);
// //         return res.status(500).send('Error generating filtered CSV');
// //     }
// // });


// // app.get('/api/download_custom_csv', async (req, res) => {
// //   try {
// //     const { deviceId, startDate, endDate } = req.query;

// //     const whereClauses = ['1=1'];
// //     const queryParams = [];
// //     let paramIndex = 1;

// //     if (deviceId && deviceId !== 'all') {
// //       const ids = String(deviceId)
// //         .split(',')
// //         .map((id) => Number(id.trim()))
// //         .filter((id) => Number.isInteger(id) && id > 0);

// //       if (ids.length === 0) {
// //         return res.status(200).json([]);
// //       }

// //       if (ids.length === 1) {
// //         whereClauses.push(`p.deviceid = $${paramIndex}`);
// //         queryParams.push(ids[0]);
// //         paramIndex++;
// //       } else {
// //         whereClauses.push(`p.deviceid = ANY($${paramIndex}::int[])`);
// //         queryParams.push(ids);
// //         paramIndex++;
// //       }
// //     }

// //     // IST timestamp -> UTC for index-friendly comparison on p.devicetime
// //     if (startDate && startDate !== 'undefined' && startDate.trim() !== '') {
// //       whereClauses.push(`p.devicetime >= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
// //       queryParams.push(startDate.replace('T', ' '));
// //       paramIndex++;
// //     }

// //     if (endDate && endDate !== 'undefined' && endDate.trim() !== '') {
// //       whereClauses.push(`p.devicetime <= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
// //       queryParams.push(endDate.replace('T', ' '));
// //       paramIndex++;
// //     }

// //     const query = `
// //       WITH filtered_pos AS (
// //         SELECT
// //           p.id,
// //           p.deviceid,
// //           p.protocol,
// //           p.servertime,
// //           p.devicetime,
// //           p.fixtime,
// //           p.valid,
// //           p.latitude,
// //           p.longitude,
// //           p.altitude,
// //           p.speed,
// //           p.course,
// //           p.address,
// //           p.attributes::jsonb AS attr
// //         FROM tc_positions p
// //         WHERE ${whereClauses.join(' AND ')}
// //         ORDER BY p.deviceid ASC, p.devicetime ASC
// //         LIMIT 50000
// //       )
// //       SELECT
// //         fp.id,
// //         d.name AS device_name,
// //         d.uniqueid AS device_imei,
// //         fp.protocol,
// //         TO_CHAR(fp.servertime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS servertime,
// //         TO_CHAR(fp.devicetime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime,
// //         TO_CHAR(fp.fixtime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime,
// //         fp.valid,
// //         fp.latitude,
// //         fp.longitude,
// //         fp.altitude,
// //         fp.speed,
// //         fp.course,
// //         fp.address,
// //         COALESCE(fp.attr->>'sat', fp.attr->>'SAT') AS satellites,
// //         COALESCE(fp.attr->>'ignition', fp.attr->>'Ignition') AS ignition,
// //         fp.attr->>'motion' AS motion,
// //         fp.attr->>'power' AS power,
// //         fp.attr->>'battery' AS battery,
// //         fp.attr->>'hdop' AS hdop,
// //         fp.attr->>'pdop' AS pdop,
// //         fp.attr->>'odometer' AS odometer,
// //         fp.attr->>'totalDistance' AS total_distance,
// //         fp.attr->>'hours' AS hours,
// //         fp.attr->>'rssi' AS rssi,
// //         fp.attr->>'event' AS event,
// //         fp.attr->>'priority' AS priority,
// //         fp.attr->>'operator' AS operator,
// //         fp.attr->>'in1' AS input_1,
// //         fp.attr->>'out1' AS output_1,
// //         fp.attr->>'io9' AS io9,
// //         COALESCE(
// //           fp.attr->>'io6',
// //           fp.attr->>'IO6',
// //           fp.attr->>'Io6',
// //           (fp.attr->'io6')::text
// //         ) AS io6,
// //         fp.attr->>'io69' AS io69,
// //         fp.attr->>'io68' AS io68,
// //         fp.attr->>'io113' AS io113
// //       FROM filtered_pos fp
// //       JOIN tc_devices d ON fp.deviceid = d.id
// //       ORDER BY d.name ASC, fp.devicetime ASC;
// //     `;

// //     const result = await traccarPool.query(query, queryParams);
// //     return res.status(200).json(result.rows || []);
// //   } catch (err) {
// //     console.error('Custom Report Error:', err);
// //     return res.status(500).json({ error: 'Error generating filtered report' });
// //   }
// // });


// app.get('/api/download_custom_csv', async (req, res) => {
//   try {
//     const { deviceId, startDate, endDate } = req.query;

//     const whereClauses = ['1=1'];
//     const queryParams = [];
//     let paramIndex = 1;

//     if (deviceId && deviceId !== 'all') {
//       const ids = String(deviceId)
//         .split(',')
//         .map((id) => Number(id.trim()))
//         .filter((id) => Number.isInteger(id) && id > 0);

//       if (ids.length === 0) {
//         return res.status(200).json([]);
//       }

//       if (ids.length === 1) {
//         whereClauses.push(`p.deviceid = $${paramIndex}`);
//         queryParams.push(ids[0]);
//         paramIndex++;
//       } else {
//         whereClauses.push(`p.deviceid = ANY($${paramIndex}::int[])`);
//         queryParams.push(ids);
//         paramIndex++;
//       }
//     }

//     // IST timestamp -> UTC for index-friendly comparison on p.devicetime
//     if (startDate && startDate !== 'undefined' && startDate.trim() !== '') {
//       whereClauses.push(`p.devicetime >= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
//       queryParams.push(startDate.replace('T', ' '));
//       paramIndex++;
//     }

//     if (endDate && endDate !== 'undefined' && endDate.trim() !== '') {
//       whereClauses.push(`p.devicetime <= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
//       queryParams.push(endDate.replace('T', ' '));
//       paramIndex++;
//     }

//     const query = `
//       WITH filtered_pos AS (
//         SELECT
//           p.id,
//           p.deviceid,
//           p.protocol,
//           p.servertime,
//           p.devicetime,
//           p.fixtime,
//           p.valid,
//           p.latitude,
//           p.longitude,
//           p.altitude,
//           p.speed,
//           p.course,
//           p.address,
//           p.attributes::jsonb AS attr
//         FROM tc_positions p
//         WHERE ${whereClauses.join(' AND ')}
//         ORDER BY p.deviceid ASC, p.devicetime ASC
//       )
//       SELECT
//         fp.id,
//         d.name AS device_name,
//         d.uniqueid AS device_imei,
//         fp.protocol,
//         TO_CHAR(fp.servertime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS servertime,
//         TO_CHAR(fp.devicetime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime,
//         TO_CHAR(fp.fixtime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime,
//         fp.valid,
//         fp.latitude,
//         fp.longitude,
//         fp.altitude,
//         fp.speed,
//         fp.course,
//         fp.address,
//         COALESCE(fp.attr->>'sat', fp.attr->>'SAT') AS satellites,
//         COALESCE(fp.attr->>'ignition', fp.attr->>'Ignition') AS ignition,
//         fp.attr->>'motion' AS motion,
//         fp.attr->>'power' AS power,
//         fp.attr->>'battery' AS battery,
//         fp.attr->>'hdop' AS hdop,
//         fp.attr->>'pdop' AS pdop,
//         fp.attr->>'odometer' AS odometer,
//         fp.attr->>'totalDistance' AS total_distance,
//         fp.attr->>'hours' AS hours,
//         fp.attr->>'rssi' AS rssi,
//         fp.attr->>'event' AS event,
//         fp.attr->>'priority' AS priority,
//         fp.attr->>'operator' AS operator,
//         fp.attr->>'in1' AS input_1,
//         fp.attr->>'out1' AS output_1,
//         fp.attr->>'io9' AS io9,
//         COALESCE(
//           fp.attr->>'io6',
//           fp.attr->>'IO6',
//           fp.attr->>'Io6',
//           (fp.attr->'io6')::text
//         ) AS io6,
//         fp.attr->>'io69' AS io69,
//         fp.attr->>'io68' AS io68,
//         fp.attr->>'io113' AS io113
//       FROM filtered_pos fp
//       JOIN tc_devices d ON fp.deviceid = d.id
//       ORDER BY d.name ASC, fp.devicetime ASC;
//     `;

//     const result = await traccarPool.query(query, queryParams);
//     return res.status(200).json(result.rows || []);
//   } catch (err) {
//     console.error('Custom Report Error:', err);
//     return res.status(500).json({ error: 'Error generating filtered report' });
//   }
// });
// // app.get('/api/download_custom_csv', async (req, res) => {
// //     try {
// //         let { deviceId, startDate, endDate } = req.query;

// //         let query = `
// //             SELECT 
// //                 p.id, 
// //                 d.name AS device_name, 
// //                 d.uniqueid AS device_imei, 
// //                 p.protocol, 
// //                 -- 🕒 Explicitly shifted to IST (+5:30)
// //                 (p.servertime + INTERVAL '5 hours 30 minutes') AS servertime, 
// //                 (p.devicetime + INTERVAL '5 hours 30 minutes') AS devicetime, 
// //                 (p.fixtime + INTERVAL '5 hours 30 minutes') AS fixtime, 
// //                 p.valid, 
// //                 p.latitude, 
// //                 p.longitude, 
// //                 p.altitude, 
// //                 p.speed, 
// //                 p.course, 
// //                 p.address, 
// //                 (p.attributes::jsonb)->>'sat' AS satellites, 
// //                 (p.attributes::jsonb)->>'ignition' AS ignition, 
// //                 (p.attributes::jsonb)->>'motion' AS motion, 
// //                 (p.attributes::jsonb)->>'power' AS power, 
// //                 (p.attributes::jsonb)->>'battery' AS battery, 
// //                 (p.attributes::jsonb)->>'hdop' AS hdop, 
// //                 (p.attributes::jsonb)->>'pdop' AS pdop, 
// //                 (p.attributes::jsonb)->>'odometer' AS odometer, 
// //                 (p.attributes::jsonb)->>'totalDistance' AS total_distance, 
// //                 (p.attributes::jsonb)->>'hours' AS hours, 
// //                 (p.attributes::jsonb)->>'rssi' AS rssi, 
// //                 (p.attributes::jsonb)->>'event' AS event, 
// //                 (p.attributes::jsonb)->>'priority' AS priority, 
// //                 (p.attributes::jsonb)->>'operator' AS operator, 
// //                 (p.attributes::jsonb)->>'in1' AS input_1, 
// //                 (p.attributes::jsonb)->>'out1' AS output_1, 
// //                 (p.attributes::jsonb)->>'io9' AS io9, 
// //                 (p.attributes::jsonb)->>'io69' AS io69, 
// //                 (p.attributes::jsonb)->>'io68' AS io68, 
// //                 (p.attributes::jsonb)->>'io113' AS io113
// //             FROM tc_positions p 
// //             JOIN tc_devices d ON p.deviceid = d.id 
// //             WHERE 1=1
// //         `;

// //         let queryParams = [];
// //         let paramIndex = 1;

// //         if (deviceId && deviceId !== 'all') {
// //             query += ` AND d.id = $${paramIndex}`;
// //             queryParams.push(deviceId);
// //             paramIndex++;
// //         }

// //         if (startDate) {
// //             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') >= $${paramIndex}`;
// //             queryParams.push(startDate);
// //             paramIndex++;
// //         }

// //         if (endDate) {
// //             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') <= $${paramIndex}`;
// //             queryParams.push(endDate);
// //             paramIndex++;
// //         }

// //         query += ` ORDER BY p.devicetime DESC LIMIT 10000;`;

// //         const result = await traccarPool.query(query, queryParams);
        
// //         if (result.rows.length === 0) {
// //             return res.status(404).send('No data found for the selected filters.');
// //         }

// //         const headers = Object.keys(result.rows[0]).join(',');
// //         const csvRows = result.rows.map(row => 
// //             Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
// //         );
        
// //         res.setHeader('Content-Type', 'text/csv');
// //         res.setHeader('Content-Disposition', 'attachment; filename="filtered_truck_report_ist.csv"');
// //         return res.status(200).send([headers, ...csvRows].join('\n'));

// //     } catch (err) {
// //         console.error('Custom CSV Export Error:', err);
// //         return res.status(500).send('Error generating filtered CSV');
// //     }
// // });

// app.get('/api/download_custom_csv', async (req, res) => {
//     try {
//         let { deviceId, startDate, endDate } = req.query;

//         console.log("📥 Raw Query Params Received -> Device ID:", deviceId, "| Start:", startDate, "| End:", endDate);

//         let query = `
//             SELECT 
//                 p.id, 
//                 d.name AS device_name, 
//                 d.uniqueid AS device_imei, 
//                 p.protocol, 
//                 TO_CHAR((p.servertime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS servertime, 
//                 TO_CHAR((p.devicetime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime, 
//                 TO_CHAR((p.fixtime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime, 
//                 p.valid, 
//                 p.latitude, 
//                 p.longitude, 
//                 p.altitude, 
//                 p.speed, 
//                 p.course, 
//                 p.address, 
//                 COALESCE((p.attributes::jsonb)->>'sat', (p.attributes::jsonb)->>'SAT') AS satellites, 
//                 COALESCE((p.attributes::jsonb)->>'ignition', (p.attributes::jsonb)->>'Ignition') AS ignition, 
//                 (p.attributes::jsonb)->>'motion' AS motion, 
//                 (p.attributes::jsonb)->>'power' AS power, 
//                 (p.attributes::jsonb)->>'battery' AS battery, 
//                 (p.attributes::jsonb)->>'hdop' AS hdop, 
//                 (p.attributes::jsonb)->>'pdop' AS pdop, 
//                 (p.attributes::jsonb)->>'odometer' AS odometer, 
//                 (p.attributes::jsonb)->>'totalDistance' AS total_distance, 
//                 (p.attributes::jsonb)->>'hours' AS hours, 
//                 (p.attributes::jsonb)->>'rssi' AS rssi, 
//                 (p.attributes::jsonb)->>'event' AS event, 
//                 (p.attributes::jsonb)->>'priority' AS priority, 
//                 (p.attributes::jsonb)->>'operator' AS operator, 
//                 (p.attributes::jsonb)->>'in1' AS input_1, 
//                 (p.attributes::jsonb)->>'out1' AS output_1, 
//                 (p.attributes::jsonb)->>'io9' AS io9,
//                 COALESCE(
//                     (p.attributes::jsonb)->>'io6', 
//                     (p.attributes::jsonb)->>'IO6', 
//                     (p.attributes::jsonb)->>'Io6',
//                     ((p.attributes::jsonb)->'io6')::text
//                 ) AS io6, 
//                 (p.attributes::jsonb)->>'io69' AS io69, 
//                 (p.attributes::jsonb)->>'io68' AS io68, 
//                 (p.attributes::jsonb)->>'io113' AS io113
//             FROM tc_positions p 
//             JOIN tc_devices d ON p.deviceid = d.id 
//             WHERE 1=1
//         `;

//         let queryParams = [];
//         let paramIndex = 1;

//         if (deviceId && deviceId !== 'all') {
//             query += ` AND d.id = $${paramIndex}`;
//             queryParams.push(deviceId);
//             paramIndex++;
//         }

//         // 📅 Strict Date Filtering with format safety check
//         if (startDate && startDate !== 'undefined' && startDate.trim() !== '') {
//             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') >= $${paramIndex}::timestamp`;
//             queryParams.push(startDate);
//             paramIndex++;
//         }

//         if (endDate && endDate !== 'undefined' && endDate.trim() !== '') {
//             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') <= $${paramIndex}::timestamp`;
//             queryParams.push(endDate);
//             paramIndex++;
//         }

//         query += ` ORDER BY p.devicetime ASC LIMIT 20000;`;

//         console.log("🛠️ Generated SQL Query:", query);
//         console.log("📦 Query Parameters Array:", queryParams);

//         const result = await traccarPool.query(query, queryParams);
        
//         if (result.rows.length === 0) {
//             return res.status(404).send('No data found for the selected date range.');
//         }

//         const headers = Object.keys(result.rows[0]).join(',');
//         const csvRows = result.rows.map(row => 
//             Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
//         );
        
//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', 'attachment; filename="filtered_truck_report_exact.csv"');
//         return res.status(200).send([headers, ...csvRows].join('\n'));

//     } catch (err) {
//         console.error('Custom CSV Export Error:', err);
//         return res.status(500).send('Error generating filtered CSV');
//     }
// });
// app.get('/api/historical_playback', async (traccarPool, req, res) => {
//     try {
//         let { deviceId, startDate, endDate } = req.query;

//         if (!deviceId || !startDate || !endDate) {
//             return res.status(400).send('Missing required parameters: deviceId, startDate, endDate');
//         }

//         const query = `
//             SELECT 
//                 p.id, 
//                 d.name AS device_name, 
//                 d.uniqueid AS device_imei, 
//                 p.latitude, 
//                 p.longitude, 
//                 p.speed, 
//                 p.course, 
//                 p.altitude,
//                 (p.attributes::jsonb)->>'ignition' AS ignition,
//                 (p.attributes::jsonb)->>'io9' AS io9,
//                 (p.servertime + INTERVAL '5 hours 30 minutes') AS servertime
//             FROM tc_positions p 
//             JOIN tc_devices d ON p.deviceid = d.id 
//             WHERE p.deviceid = $1 
//               AND (p.servertime + INTERVAL '5 hours 30 minutes') >= $2 
//               AND (p.servertime + INTERVAL '5 hours 30 minutes') <= $3
//             ORDER BY p.servertime ASC;
//         `;

//         const result = await traccarPool.query(query, [deviceId, startDate, endDate]);
        
//         if (result.rows.length === 0) {
//             return res.status(404).send('No historical playback data found for this range.');
//         }

//         return res.status(200).json(result.rows);
//     } catch (err) {
//         console.error('Historical Playback Error:', err);
//         return res.status(500).send('Error fetching historical telemetry');
//     }
// });
// app.use((req, res, next) => {
//   const start = process.hrtime.bigint();

//   res.on('finish', () => {
//     const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
//     if (durationMs > 500) { // 500ms se zyada wali har API log hogi
//       console.warn(
//         `[SLOW API] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${durationMs.toFixed(1)} ms`
//       );
//     }
//   });

//   next();
// });
// module.exports = app;


const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

// 1. Routes Import karein
const dashboardRoutes = require('./routes/dashboardRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const reportRoutes = require('./routes/reportRoutes');
const eventRoutes = require('./routes/eventRoutes');
const geofenceRoutes = require('./routes/geofenceRoutes');
const tripRoutes = require('./routes/tripRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { pool, traccarPool } = require('./config/db');

app.use(cors());
app.use(express.json());

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Frontend Consolidated Excel Export Endpoint
app.get('/api/download_custom_csv', async (req, res) => {
  try {
    const { deviceId, startDate, endDate } = req.query;

    const whereClauses = ['1=1'];
    const queryParams = [];
    let paramIndex = 1;

    if (deviceId && deviceId !== 'all') {
      const ids = String(deviceId)
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (ids.length === 0) {
        return res.status(200).json([]);
      }

      if (ids.length === 1) {
        whereClauses.push(`p.deviceid = $${paramIndex}`);
        queryParams.push(ids[0]);
        paramIndex++;
      } else {
        whereClauses.push(`p.deviceid = ANY($${paramIndex}::int[])`);
        queryParams.push(ids);
        paramIndex++;
      }
    }

    // IST timestamp -> UTC for index-friendly comparison on p.devicetime
    if (startDate && startDate !== 'undefined' && startDate.trim() !== '') {
      whereClauses.push(`p.devicetime >= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
      queryParams.push(startDate.replace('T', ' ').trim());
      paramIndex++;
    }

    if (endDate && endDate !== 'undefined' && endDate.trim() !== '') {
      whereClauses.push(`p.devicetime <= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
      queryParams.push(endDate.replace('T', ' ').trim());
      paramIndex++;
    }

    const query = `
      WITH filtered_pos AS (
        SELECT
          p.id,
          p.deviceid,
          p.protocol,
          p.servertime,
          p.devicetime,
          p.fixtime,
          p.valid,
          p.latitude,
          p.longitude,
          p.altitude,
          p.speed,
          p.course,
          p.address,
          p.attributes::jsonb AS attr
        FROM tc_positions p
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY p.deviceid ASC, p.devicetime ASC
      )
      SELECT
        fp.id,
        d.name AS device_name,
        d.uniqueid AS device_imei,
        fp.protocol,
        TO_CHAR(fp.servertime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS servertime,
        TO_CHAR(fp.devicetime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime,
        TO_CHAR(fp.fixtime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime,
        fp.valid,
        fp.latitude,
        fp.longitude,
        fp.altitude,
        fp.speed,
        fp.course,
        fp.address,
        COALESCE(fp.attr->>'sat', fp.attr->>'SAT') AS satellites,
        COALESCE(fp.attr->>'ignition', fp.attr->>'Ignition') AS ignition,
        fp.attr->>'motion' AS motion,
        fp.attr->>'power' AS power,
        fp.attr->>'battery' AS battery,
        fp.attr->>'hdop' AS hdop,
        fp.attr->>'pdop' AS pdop,
        fp.attr->>'odometer' AS odometer,
        fp.attr->>'totalDistance' AS total_distance,
        fp.attr->>'hours' AS hours,
        fp.attr->>'rssi' AS rssi,
        fp.attr->>'event' AS event,
        fp.attr->>'priority' AS priority,
        fp.attr->>'operator' AS operator,
        fp.attr->>'in1' AS input_1,
        fp.attr->>'out1' AS output_1,
        fp.attr->>'io9' AS io9,
        COALESCE(
          fp.attr->>'io6',
          fp.attr->>'IO6',
          fp.attr->>'Io6',
          (fp.attr->'io6')::text
        ) AS io6,
        fp.attr->>'io69' AS io69,
        fp.attr->>'io68' AS io68,
        fp.attr->>'io113' AS io113
      FROM filtered_pos fp
      JOIN tc_devices d ON fp.deviceid = d.id
      ORDER BY d.name ASC, fp.devicetime ASC;
    `;

    const result = await traccarPool.query(query, queryParams);
    return res.status(200).json(result.rows || []);
  } catch (err) {
    console.error('Custom Report Error:', err);
    return res.status(500).json({ error: 'Error generating filtered report' });
  }
});

const EXTERNAL_API_USER = (process.env.EXTERNAL_RAW_USER || 'trucktrak_client_feed').trim();
const EXTERNAL_API_PASS = (process.env.EXTERNAL_RAW_PASS || 'TrkFeed2026Raw94').trim();
function externalBasicAuth(req, res, next) {
  const expectedUser = (process.env.EXTERNAL_RAW_USER || 'trucktrak_client_feed').trim();
  const expectedPass = (process.env.EXTERNAL_RAW_PASS || 'TrkFeed2026Raw94').trim();

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="External Raw GPS Data"');
    return res.status(401).json({ error: 'Authentication required (User ID & Password)' });
  }

  const base64Credentials = authHeader.split(' ')[1] || '';
  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  const userId = (colonIndex >= 0 ? decoded.slice(0, colonIndex) : '').trim();
  const password = (colonIndex >= 0 ? decoded.slice(colonIndex + 1) : '').trim();

  if (userId !== expectedUser || password !== expectedPass) {
    console.warn('[EXTERNAL AUTH MISMATCH]', {
      receivedUser: userId,
      expectedUser,
      receivedPassLen: password.length,
      expectedPassLen: expectedPass.length,
      hasEnvUser: Boolean(process.env.EXTERNAL_RAW_USER),
      hasEnvPass: Boolean(process.env.EXTERNAL_RAW_PASS),
    });
    return res.status(403).json({ error: 'Invalid User ID or Password' });
  }

  next();
}
app.get('/api/external/raw-positions', externalBasicAuth, async (req, res) => {
  try {
    const { deviceId = 'all', startDate, endDate, limit = '250000', offset = '0' } = req.query;

    const whereClauses = ['1=1'];
    const queryParams = [];
    let paramIndex = 1;

    if (deviceId && String(deviceId).toLowerCase() !== 'all') {
      const ids = String(deviceId)
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (ids.length === 0) {
        return res.status(200).json({ count: 0, data: [] });
      }

      if (ids.length === 1) {
        whereClauses.push(`p.deviceid = $${paramIndex}`);
        queryParams.push(ids[0]);
        paramIndex++;
      } else {
        whereClauses.push(`p.deviceid = ANY($${paramIndex}::int[])`);
        queryParams.push(ids);
        paramIndex++;
      }
    }

    if (startDate && String(startDate).trim() !== '') {
      whereClauses.push(`p.devicetime >= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
      queryParams.push(String(startDate).replace('T', ' ').trim());
      paramIndex++;
    }

    if (endDate && String(endDate).trim() !== '') {
      whereClauses.push(`p.devicetime <= ($${paramIndex}::timestamp - INTERVAL '5 hours 30 minutes')`);
      queryParams.push(String(endDate).replace('T', ' ').trim());
      paramIndex++;
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 250000, 1), 500000);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const query = `
      WITH filtered_pos AS (
        SELECT
          p.id,
          p.deviceid,
          p.protocol,
          p.servertime,
          p.devicetime,
          p.fixtime,
          p.valid,
          p.latitude,
          p.longitude,
          p.altitude,
          p.speed,
          p.course,
          p.address,
          p.attributes::jsonb AS attr
        FROM tc_positions p
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY p.deviceid ASC, p.devicetime ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      )
      SELECT
        fp.id,
        d.name AS device_name,
        d.uniqueid AS device_imei,
        fp.protocol,
        TO_CHAR(fp.servertime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH24:MI:SS') AS servertime_ist,
        TO_CHAR(fp.devicetime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH24:MI:SS') AS devicetime_ist,
        TO_CHAR(fp.fixtime + INTERVAL '5 hours 30 minutes', 'YYYY-MM-DD HH24:MI:SS') AS fixtime_ist,
        fp.valid,
        fp.latitude,
        fp.longitude,
        fp.altitude,
        fp.speed,
        fp.course,
        fp.address,
        COALESCE(fp.attr->>'sat', fp.attr->>'SAT') AS satellites,
        COALESCE(fp.attr->>'ignition', fp.attr->>'Ignition') AS ignition,
        fp.attr->>'motion' AS motion,
        fp.attr->>'power' AS power,
        fp.attr->>'battery' AS battery,
        fp.attr->>'hdop' AS hdop,
        fp.attr->>'pdop' AS pdop,
        fp.attr->>'odometer' AS odometer,
        fp.attr->>'totalDistance' AS total_distance,
        fp.attr->>'hours' AS hours,
        fp.attr->>'rssi' AS rssi,
        fp.attr->>'event' AS event,
        fp.attr->>'priority' AS priority,
        fp.attr->>'operator' AS operator,
        fp.attr->>'in1' AS input_1,
        fp.attr->>'out1' AS output_1,
        fp.attr->>'io9' AS io9,
        COALESCE(fp.attr->>'io6', fp.attr->>'IO6', fp.attr->>'Io6', (fp.attr->'io6')::text) AS io6,
        fp.attr->>'io69' AS io69,
        fp.attr->>'io68' AS io68,
        fp.attr->>'io113' AS io113
      FROM filtered_pos fp
      JOIN tc_devices d ON fp.deviceid = d.id
      ORDER BY d.name ASC, fp.devicetime ASC;
    `;

    const result = await traccarPool.query(query, [...queryParams, safeLimit, safeOffset]);
    return res.status(200).json({
      count: result.rows.length,
      data: result.rows || [],
    });
  } catch (err) {
    console.error('External Raw Data Error:', err);
    return res.status(500).json({ error: 'Failed to fetch raw GPS data' });
  }
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (durationMs > 500) {
      console.warn(
        `[SLOW API] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${durationMs.toFixed(1)} ms`
      );
    }
  });

  next();
});

module.exports = app;