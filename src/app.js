const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();// 1. Routes Import karein
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
app.use('/api/trips', tripRoutes); 
app.use('/api/auth', authRoutes); 
app.use('/api/users', userRoutes);
app.get('/api/download_csv', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id, 
                d.name AS device_name, 
                d.uniqueid AS device_imei, 
                p.protocol, 
                -- 🕒 Clean 12-Hour AM/PM Format with IST Conversion (+5:30)
                TO_CHAR((p.servertime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS servertime, 
                TO_CHAR((p.devicetime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime, 
                TO_CHAR((p.fixtime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime, 
                p.valid, 
                p.latitude, 
                p.longitude, 
                p.altitude, 
                p.speed, 
                p.course, 
                p.address, 
                (p.attributes::jsonb)->>'sat' AS satellites, 
                (p.attributes::jsonb)->>'ignition' AS ignition, 
                (p.attributes::jsonb)->>'motion' AS motion, 
                (p.attributes::jsonb)->>'power' AS power, 
                (p.attributes::jsonb)->>'battery' AS battery, 
                (p.attributes::jsonb)->>'hdop' AS hdop, 
                (p.attributes::jsonb)->>'pdop' AS pdop, 
                (p.attributes::jsonb)->>'odometer' AS odometer, 
                (p.attributes::jsonb)->>'totalDistance' AS total_distance, 
                (p.attributes::jsonb)->>'hours' AS hours, 
                (p.attributes::jsonb)->>'rssi' AS rssi, 
                (p.attributes::jsonb)->>'event' AS event, 
                (p.attributes::jsonb)->>'priority' AS priority, 
                (p.attributes::jsonb)->>'operator' AS operator, 
                (p.attributes::jsonb)->>'in1' AS input_1, 
                (p.attributes::jsonb)->>'out1' AS output_1, 
                (p.attributes::jsonb)->>'io9' AS io9, 
                (p.attributes::jsonb)->>'io69' AS io69, 
                (p.attributes::jsonb)->>'io68' AS io68, 
                (p.attributes::jsonb)->>'io113' AS io113
            FROM tc_positions p 
            JOIN tc_devices d ON p.deviceid = d.id 
            WHERE p.servertime >= (NOW() - INTERVAL '24 hours') -- ⚡ Real-Time filter: Sirf pichle 24 ghante ka live data aayega
            ORDER BY p.servertime DESC
            LIMIT 5000;
        `;
        
        const result = await pool.query(query);
        if (result.rows.length === 0) return res.status(404).send('No real-time data found for the last 24 hours.');

        const headers = Object.keys(result.rows[0]).join(',');
        const csvRows = result.rows.map(row => 
            Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
        );
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="traccar_realtime_report.csv"');
        return res.status(200).send([headers, ...csvRows].join('\n'));
    } catch (err) {
        console.error('CSV Export Error:', err);
        return res.status(500).send('Error generating real-time CSV');
    }
});
// app.get('/api/download_custom_csv', async (req, res) => {
//     try {
//         let { deviceId, startDate, endDate } = req.query;

//         let query = `
//             SELECT 
//                 p.id, 
//                 d.name AS device_name, 
//                 d.uniqueid AS device_imei, 
//                 p.protocol, 
//                 -- 🕒 Explicitly shifted to IST (+5:30)
//                 (p.servertime + INTERVAL '5 hours 30 minutes') AS servertime, 
//                 (p.devicetime + INTERVAL '5 hours 30 minutes') AS devicetime, 
//                 (p.fixtime + INTERVAL '5 hours 30 minutes') AS fixtime, 
//                 p.valid, 
//                 p.latitude, 
//                 p.longitude, 
//                 p.altitude, 
//                 p.speed, 
//                 p.course, 
//                 p.address, 
//                 (p.attributes::jsonb)->>'sat' AS satellites, 
//                 (p.attributes::jsonb)->>'ignition' AS ignition, 
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

//         if (startDate) {
//             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') >= $${paramIndex}`;
//             queryParams.push(startDate);
//             paramIndex++;
//         }

//         if (endDate) {
//             query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') <= $${paramIndex}`;
//             queryParams.push(endDate);
//             paramIndex++;
//         }

//         query += ` ORDER BY p.devicetime DESC LIMIT 10000;`;

//         const result = await traccarPool.query(query, queryParams);
        
//         if (result.rows.length === 0) {
//             return res.status(404).send('No data found for the selected filters.');
//         }

//         const headers = Object.keys(result.rows[0]).join(',');
//         const csvRows = result.rows.map(row => 
//             Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
//         );
        
//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', 'attachment; filename="filtered_truck_report_ist.csv"');
//         return res.status(200).send([headers, ...csvRows].join('\n'));

//     } catch (err) {
//         console.error('Custom CSV Export Error:', err);
//         return res.status(500).send('Error generating filtered CSV');
//     }
// });

app.get('/api/download_custom_csv', async (req, res) => {
    try {
        let { deviceId, startDate, endDate } = req.query;

        let query = `
            SELECT 
                p.id, 
                d.name AS device_name, 
                d.uniqueid AS device_imei, 
                p.protocol, 
                -- 🕒 Forced text format with AM/PM and seconds so Excel doesn't hide them
                TO_CHAR((p.servertime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS servertime, 
                TO_CHAR((p.devicetime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS devicetime, 
                TO_CHAR((p.fixtime + INTERVAL '5 hours 30 minutes'), 'YYYY-MM-DD HH12:MI:SS AM') AS fixtime, 
                p.valid, 
                p.latitude, 
                p.longitude, 
                p.altitude, 
                p.speed, 
                p.course, 
                p.address, 
                COALESCE((p.attributes::jsonb)->>'sat', (p.attributes::jsonb)->>'SAT') AS satellites, 
                COALESCE((p.attributes::jsonb)->>'ignition', (p.attributes::jsonb)->>'Ignition') AS ignition, 
                (p.attributes::jsonb)->>'motion' AS motion, 
                (p.attributes::jsonb)->>'power' AS power, 
                (p.attributes::jsonb)->>'battery' AS battery, 
                (p.attributes::jsonb)->>'hdop' AS hdop, 
                (p.attributes::jsonb)->>'pdop' AS pdop, 
                (p.attributes::jsonb)->>'odometer' AS odometer, 
                (p.attributes::jsonb)->>'totalDistance' AS total_distance, 
                (p.attributes::jsonb)->>'hours' AS hours, 
                (p.attributes::jsonb)->>'rssi' AS rssi, 
                (p.attributes::jsonb)->>'event' AS event, 
                (p.attributes::jsonb)->>'priority' AS priority, 
                (p.attributes::jsonb)->>'operator' AS operator, 
                (p.attributes::jsonb)->>'in1' AS input_1, 
                (p.attributes::jsonb)->>'out1' AS output_1, 
                (p.attributes::jsonb)->>'io9' AS io9,
                -- ⚡ Robust handling for io6 with case-insensitive fallback
                COALESCE(
                    (p.attributes::jsonb)->>'io6', 
                    (p.attributes::jsonb)->>'IO6', 
                    (p.attributes::jsonb)->>'Io6',
                    ((p.attributes::jsonb)->'io6')::text
                ) AS io6, 
                (p.attributes::jsonb)->>'io69' AS io69, 
                (p.attributes::jsonb)->>'io68' AS io68, 
                (p.attributes::jsonb)->>'io113' AS io113
            FROM tc_positions p 
            JOIN tc_devices d ON p.deviceid = d.id 
            WHERE 1=1
        `;

        let queryParams = [];
        let paramIndex = 1;

        if (deviceId && deviceId !== 'all') {
            query += ` AND d.id = $${paramIndex}`;
            queryParams.push(deviceId);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') >= $${paramIndex}`;
            queryParams.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND (p.devicetime + INTERVAL '5 hours 30 minutes') <= $${paramIndex}`;
            queryParams.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY p.devicetime DESC LIMIT 10000;`;

        const result = await traccarPool.query(query, queryParams);
        
        if (result.rows.length === 0) {
            return res.status(404).send('No data found for the selected filters.');
        }

        const headers = Object.keys(result.rows[0]).join(',');
        const csvRows = result.rows.map(row => 
            Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
        );
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="filtered_truck_report_exact.csv"');
        return res.status(200).send([headers, ...csvRows].join('\n'));

    } catch (err) {
        console.error('Custom CSV Export Error:', err);
        return res.status(500).send('Error generating filtered CSV');
    }
});
app.get('/api/historical_playback', async (traccarPool, req, res) => {
    try {
        let { deviceId, startDate, endDate } = req.query;

        if (!deviceId || !startDate || !endDate) {
            return res.status(400).send('Missing required parameters: deviceId, startDate, endDate');
        }

        const query = `
            SELECT 
                p.id, 
                d.name AS device_name, 
                d.uniqueid AS device_imei, 
                p.latitude, 
                p.longitude, 
                p.speed, 
                p.course, 
                p.altitude,
                (p.attributes::jsonb)->>'ignition' AS ignition,
                (p.attributes::jsonb)->>'io9' AS io9,
                (p.servertime + INTERVAL '5 hours 30 minutes') AS servertime
            FROM tc_positions p 
            JOIN tc_devices d ON p.deviceid = d.id 
            WHERE p.deviceid = $1 
              AND (p.servertime + INTERVAL '5 hours 30 minutes') >= $2 
              AND (p.servertime + INTERVAL '5 hours 30 minutes') <= $3
            ORDER BY p.servertime ASC;
        `;

        const result = await traccarPool.query(query, [deviceId, startDate, endDate]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('No historical playback data found for this range.');
        }

        return res.status(200).json(result.rows);
    } catch (err) {
        console.error('Historical Playback Error:', err);
        return res.status(500).send('Error fetching historical telemetry');
    }
});
module.exports = app;