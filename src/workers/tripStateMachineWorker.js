const { pool, traccarPool } = require('../config/db');

// In-Memory state management for live background worker
const vehicleStates = {};

const parseAttributes = (rawAttributes) => {
    if (!rawAttributes) return {};
    if (typeof rawAttributes === 'string') {
        try { return JSON.parse(rawAttributes); } catch (e) { return {}; }
    }
    return rawAttributes;
};

const runTripStateMachine = async () => {
    try {
        // 1. Local geofences fetch karein (latitude, longitude, radius)
        const geofencesRes = await pool.query(`SELECT id, name, latitude, longitude, radius FROM geofences`);
        const zones = geofencesRes.rows;

        if (zones.length === 0) return;

        // 2. Latest position har device ki fetch karein
        const latestPositions = await traccarPool.query(`
            SELECT DISTINCT ON (deviceid) 
                deviceid, devicetime, latitude, longitude, speed 
            FROM tc_positions
            ORDER BY deviceid, devicetime DESC
        `);

        for (const pos of latestPositions.rows) {
            const deviceId = pos.deviceid;
            const devTime = new Date(pos.devicetime);
            const point = { latitude: pos.latitude, longitude: pos.longitude };

            // 3. Geolib se check karein truck kis zone ke andar hai
            let matchedZoneName = '';
            for (const zone of zones) {
                const radiusMeters = zone.radius || 100;
                const isInside = isPointWithinRadius(
                    point,
                    { latitude: zone.latitude, longitude: zone.longitude },
                    radiusMeters
                );

                if (isInside) {
                    matchedZoneName = zone.name.toLowerCase();
                    break;
                }
            }

            const isLoadingZone = matchedZoneName.includes('loading') || matchedZoneName.includes('mine');
            const isUnloadingZone = matchedZoneName.includes('unloading') || matchedZoneName.includes('plant');

            if (!vehicleStates[deviceId]) {
                vehicleStates[deviceId] = { state: 'IDLE', startTime: null, unloadingStartTime: null, startLat: pos.latitude, startLng: pos.longitude };
            }

            const currentState = vehicleStates[deviceId];

            // State Machine Logic
            if ((currentState.state === 'IDLE' || currentState.state === 'IN_TRANSIT') && isLoadingZone) {
                currentState.state = 'LOADING';
                currentState.startTime = devTime;
                currentState.startLat = pos.latitude;
                currentState.startLng = pos.longitude;
                console.log(`✅ [TRIP STARTED] Vehicle ${deviceId} entered Loading Zone`);
            } 
            else if (currentState.state === 'LOADING' && !isLoadingZone) {
                currentState.state = 'IN_TRANSIT';
                console.log(`🚚 [IN TRANSIT] Vehicle ${deviceId} left loading zone`);
            } 
            else if ((currentState.state === 'IN_TRANSIT' || currentState.state === 'LOADING') && isUnloadingZone) {
                currentState.state = 'UNLOADING';
                currentState.unloadingStartTime = devTime;
                console.log(`🏗️ [UNLOADING] Vehicle ${deviceId} reached unloading zone`);
            } 
            else if (currentState.state === 'UNLOADING' && !isUnloadingZone) {
                const endTime = devTime;
                const startTime = currentState.startTime || devTime;
                const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

                console.log(`🎉 [TRIP COMPLETED] Vehicle ${deviceId} completed in ${durationMinutes} mins.`);

                await pool.query(`
                    INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng)
                    VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7)
                `, [
                    deviceId, 
                    startTime, 
                    currentState.unloadingStartTime || devTime, 
                    endTime, 
                    durationMinutes, 
                    currentState.startLat, 
                    currentState.startLng
                ]);

                if (global.io) {
                    global.io.emit('trip_completed', { deviceId, durationMinutes, completedAt: endTime });
                }

                vehicleStates[deviceId] = { state: 'IDLE', startTime: null, unloadingStartTime: null };
            }
        }
    } catch (err) {
        console.error("❌ Error in Trip State Machine Worker:", err.message);
    }
};

setInterval(runTripStateMachine, 10000);
module.exports = { runTripStateMachine };