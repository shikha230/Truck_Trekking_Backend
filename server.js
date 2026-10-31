const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');
const { runGeofenceCheck } = require('./src/services/geofenceService');
const { syncDynamicTripsFromTraccar } = require('./src/services/dynamicTripScanner');
const { pool } = require('./src/config/db');
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["https://usptrack.tech", "http://localhost:5173", "http://localhost:3000"], // Yahan apna production domain add karein
        methods: ["GET", "POST"]
    }
});

global.io = io;

io.on('connection', (socket) => {
    console.log('A client connected for live tracking');
    socket.on('disconnect', () => console.log('❌ Client disconnected'));
});

require('./src/workers/gpsWorker');
require('./src/workers/tripStateMachineWorker'); 
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