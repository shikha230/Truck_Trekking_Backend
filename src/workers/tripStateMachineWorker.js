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
        // 1. Geofences map safely fetch karein
        const geofencesRes = await traccarPool.query(`SELECT id, name FROM tc_geofences`);
        const geofenceMap = {};
        geofencesRes.rows.forEach(g => {
            geofenceMap[g.id] = g.name;
        });

        // 2. Traccar positions without broken SQL ANY() Join
        const latestPositions = await traccarPool.query(`
            SELECT DISTINCT ON (deviceid) 
                deviceid, devicetime, latitude, longitude, speed, attributes, geofenceids
            FROM tc_positions
            ORDER BY deviceid, devicetime DESC
        `);

        for (const pos of latestPositions.rows) {
            const deviceId = pos.deviceid;
            const devTime = new Date(pos.devicetime);
            const attributes = parseAttributes(pos.attributes);

            // Dynamic Geofence resolution in JS
            let activeZone = '';
            if (pos.geofenceids) {
                let gIds = pos.geofenceids;
                if (typeof gIds === 'string') {
                    gIds = gIds.split(',').map(id => id.trim());
                } else if (!Array.isArray(gIds)) {
                    gIds = [gIds];
                }
                const matchedNames = gIds.map(id => geofenceMap[id]).filter(Boolean);
                activeZone = matchedNames.join(' ').toLowerCase();
            }

            const isLoadingZone = activeZone.includes('loading');
            const isUnloadingZone = activeZone.includes('unloading');

            if (!vehicleStates[deviceId]) {
                vehicleStates[deviceId] = { state: 'IDLE', startTime: null, unloadingStartTime: null };
            }

            const currentState = vehicleStates[deviceId];

            // STEP 1: Entry into Loading Zone -> Trip Start
            if ((currentState.state === 'IDLE' || currentState.state === 'IN_TRANSIT') && isLoadingZone) {
                currentState.state = 'LOADING';
                currentState.startTime = devTime;
                console.log(`✅ [TRIP STARTED] Vehicle ${deviceId} entered ${activeZone}`);
            }

            // STEP 2: Exit Loading Zone -> In Transit
            else if (currentState.state === 'LOADING' && !isLoadingZone) {
                currentState.state = 'IN_TRANSIT';
                console.log(`🚚 [IN TRANSIT] Vehicle ${deviceId} left loading zone`);
            }

            // STEP 3: Entry into Unloading Zone -> Unloading Started
            else if ((currentState.state === 'IN_TRANSIT' || currentState.state === 'LOADING') && isUnloadingZone) {
                currentState.state = 'UNLOADING';
                currentState.unloadingStartTime = devTime;
                console.log(`🏗️ [UNLOADING] Vehicle ${deviceId} reached unloading zone`);
            }

            // STEP 4: Exit Unloading Zone -> Trip Completed
            else if (currentState.state === 'UNLOADING' && !isUnloadingZone) {
                const endTime = devTime;
                const startTime = currentState.startTime || devTime;
                const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

                console.log(`🎉 [TRIP COMPLETED] Vehicle ${deviceId} finished cycle in ${durationMinutes} mins.`);

                await pool.query(`
                    INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng)
                    VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7)
                `, [deviceId, startTime, currentState.unloadingStartTime || devTime, endTime, durationMinutes, pos.latitude, pos.longitude]);

                if (global.io) {
                    global.io.emit('trip_completed', { deviceId, durationMinutes, completedAt: endTime });
                }

                vehicleStates[deviceId] = { state: 'IDLE', startTime: null, unloadingStartTime: null };
            }
        }
    } catch (err) {
        console.error("❌ Error in Trip Worker:", err.message);
    }
};

setInterval(runTripStateMachine, 10000);
module.exports = { runTripStateMachine };