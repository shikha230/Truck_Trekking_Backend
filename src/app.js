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
app.get('/download_csv', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id, d.name AS device_name, d.uniqueid AS device_imei, p.protocol, p.servertime, p.devicetime, p.fixtime, p.valid, p.latitude, p.longitude, p.altitude, p.speed, p.course, p.address, 
                p.attributes->>'sat' AS satellites, p.attributes->>'ignition' AS ignition, p.attributes->>'motion' AS motion, p.attributes->>'power' AS power, p.attributes->>'battery' AS battery, p.attributes->>'hdop' AS hdop, p.attributes->>'pdop' AS pdop, p.attributes->>'odometer' AS odometer, p.attributes->>'totalDistance' AS total_distance, p.attributes->>'hours' AS hours, p.attributes->>'rssi' AS rssi, p.attributes->>'event' AS event, p.attributes->>'priority' AS priority, p.attributes->>'operator' AS operator, p.attributes->>'in1' AS input_1, p.attributes->>'out1' AS output_1, p.attributes->>'io9' AS io9, p.attributes->>'io69' AS io69, p.attributes->>'io68' AS io68, p.attributes->>'io113' AS io113
            FROM tc_positions p 
            JOIN tc_devices d ON p.deviceid = d.id 
            ORDER BY p.servertime DESC;
        `;
        const { pool } = require('./config/db');
        const result = await pool.query(query);
        if (result.rows.length === 0) return res.status(404).send('No data');

        const headers = Object.keys(result.rows[0]).join(',');
        const csvRows = result.rows.map(row => Object.values(row).map(val => val === null ? '' : `"${String(val).replace(/"/g, '""')}"`).join(','));
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="traccar_complete_report.csv"');
        return res.status(200).send([headers, ...csvRows].join('\n'));
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error');
    }
});
module.exports = app;