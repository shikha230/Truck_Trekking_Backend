const { pool, traccarPool } = require('../config/db');
const geolib = require('geolib');

const activeTrips = {}; 

const processTripDetection = async () => {
    try {
        const zones = await pool.query("SELECT * FROM geofences");
        
        const latestPositions = await traccarPool.query(`
            SELECT DISTINCT ON (deviceid) deviceid, devicetime, latitude, longitude, speed, attributes 
            FROM tc_positions 
            ORDER BY deviceid, devicetime DESC
        `);

        for (const row of latestPositions.rows) {
            const deviceId = row.deviceid;
            let attributes = {};
            try {
                attributes = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
            } catch (e) {
                attributes = {};
            }
            
            // Sensor Check (Traccar screenshot ke mutabiq 'in1' 'Yes' ya true ho sakta hai)
            const isTipperActive = attributes.in1 === true || attributes.in1 === 'Yes' || attributes.in1 == 1;

            // Geofence Check
            let currentZone = null;
            for (const zone of zones.rows) {
                const distance = geolib.getDistance(
                    { latitude: Number(row.latitude), longitude: Number(row.longitude) },
                    { latitude: Number(zone.latitude), longitude: Number(zone.longitude) }
                );
                if (distance <= (zone.radius || 100)) {
                    currentZone = zone;
                    break;
                }
            }

            // 1. Loading Zone me enter hone par Trip Start
            if (currentZone && currentZone.name.toLowerCase().includes('loading')) {
                if (!activeTrips[deviceId]) {
                    activeTrips[deviceId] = {
                        vehicle_id: deviceId,
                        start_time: row.devicetime,
                        start_location: currentZone.name,
                        status: 'LOADING'
                    };
                    console.log(`[TRIP STARTED] Vehicle ${deviceId} inside ${currentZone.name}`);
                }
            }

            // 2. Unloading Zone me pahunch kar Tipper Uthne par Status Update
            if (activeTrips[deviceId] && currentZone && currentZone.name.toLowerCase().includes('unloading')) {
                if (isTipperActive) {
                    activeUrips = activeTrips[deviceId];
                    activeTrips[deviceId].status = 'UNLOADING';
                    console.log(`[UNLOADING STARTED] Vehicle ${deviceId}`);
                }
            }

            // 3. Trip Complete & Save (Jab tipper niche ho jaye ya unloading zone complete ho)
            if (activeTrips[deviceId] && activeTrips[deviceId].status === 'UNLOADING') {
                if (!isTipperActive) {
                    const tripData = activeTrips[deviceId];
                    
                    await pool.query(`
                        INSERT INTO trips (vehicle_id, start_time, end_time, start_location, status)
                        VALUES ($1, $2, $3, $4, 'COMPLETED')
                    `, [tripData.vehicle_id, tripData.start_time, row.devicetime, tripData.start_location]);

                    console.log(`[TRIP COMPLETED & SAVED] Vehicle ${deviceId}`);
                    delete activeTrips[deviceId];
                }
            }
        }
    } catch (err) {
        console.error("Worker Error:", err.message);
    }
};

const startTripWorker = () => {
    setInterval(processTripDetection, 10000); // Har 10 second me check karega
};

module.exports = startTripWorker;