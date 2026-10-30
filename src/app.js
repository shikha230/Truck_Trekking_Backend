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
const { pool } = require('./config/db');
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
app.get('/traccer/download_csv', async (req, res) => {
    try {
      const query = `
            SELECT 
                p.id, 
                d.name AS device_name, 
                d.uniqueid AS device_imei, 
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
            ORDER BY p.servertime DESC
            LIMIT 5000;
        `;
        const result = await pool.query(query);
        if (result.rows.length === 0) return res.status(404).send('No data');

        const headers = Object.keys(result.rows[0]).join(',');
        const csvRows = result.rows.map(row => 
            Object.values(row).map(val => val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`).join(',')
        );
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="traccar_complete_report.csv"');
        return res.status(200).send([headers, ...csvRows].join('\n'));
    } catch (err) {
        console.error('CSV Export Error:', err);
        return res.status(500).send('Error generating CSV');
    }
});
module.exports = app;