const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');
const { runGeofenceCheck } = require('./src/services/geofenceService');
const { syncDynamicTripsFromTraccar } = require('./src/services/dynamicTripScanner');
const { pool } = require('./src/config/db');
const server = http.createServer(app);

// Socket.io setup for Real-time communication
const io = new Server(server, {
    cors: {
              origin: ["https://usptrack.tech", "http://localhost:5173", "http://localhost:3000"], // Yahan apna production domain add karein

        methods: ["GET", "POST"]
    }
});

// Global variable taaki hum worker se frontend ko message bhej saken
global.io = io;

io.on('connection', (socket) => {
    console.log('🌐 A client connected for live tracking');
    socket.on('disconnect', () => console.log('❌ Client disconnected'));
});
app.get('/download_csv', async (req, res) => {
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
                p.attributes->>'sat' AS satellites, 
                p.attributes->>'ignition' AS ignition, 
                p.attributes->>'motion' AS motion, 
                p.attributes->>'power' AS power, 
                p.attributes->>'battery' AS battery, 
                p.attributes->>'hdop' AS hdop, 
                p.attributes->>'pdop' AS pdop, 
                p.attributes->>'odometer' AS odometer, 
                p.attributes->>'totalDistance' AS total_distance, 
                p.attributes->>'hours' AS hours, 
                p.attributes->>'rssi' AS rssi, 
                p.attributes->>'event' AS event, 
                p.attributes->>'priority' AS priority, 
                p.attributes->>'operator' AS operator, 
                p.attributes->>'in1' AS input_1, 
                p.attributes->>'out1' AS output_1, 
                p.attributes->>'io9' AS io9, 
                p.attributes->>'io69' AS io69, 
                p.attributes->>'io68' AS io68, 
                p.attributes->>'io113' AS io113
            FROM tc_positions p 
            JOIN tc_devices d ON p.deviceid = d.id 
            ORDER BY p.servertime DESC;
        `;

        const result = await pool.query(query);

        if (result.rows.length === 0) {
            return res.status(404).send('No tracking data found');
        }

        // Generate CSV Header & Rows dynamically
        const headers = Object.keys(result.rows[0]).join(',');
        const csvRows = result.rows.map(row => {
            return Object.values(row).map(val => {
                if (val === null || val === undefined) return '';
                // Escape commas and quotes inside string data
                const stringVal = String(val).replace(/"/g, '""');
                return `"${stringVal}"`;
            }).join(',');
        });

        const csvContent = [headers, ...csvRows].join('\n');

        // Force fresh download and disable browser caching
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="traccar_complete_report.csv"');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        
        return res.status(200).send(csvContent);

    } catch (error) {
        console.error('❌ CSV Export Error:', error);
        return res.status(500).send('Failed to generate full CSV report');
    }
});
// Background GPS Worker Shuru Karein
require('./src/workers/gpsWorker');
require('./src/workers/tripStateMachineWorker'); // <--- Nayi file attach ho gayi
runGeofenceCheck();
runGeofenceCheck();
const PORT = process.env.PORT || 8082;
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    // Yahan use karna hai
    const vehiclesRes = await pool.query(`SELECT traccar_id, name FROM vehicles WHERE traccar_id IS NOT NULL`);
    for (const truck of vehiclesRes.rows) {
        await syncDynamicTripsFromTraccar(truck.traccar_id);
    }
});