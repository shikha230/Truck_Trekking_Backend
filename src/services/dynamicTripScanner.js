const { pool, traccarPool } = require('../config/db');

const syncDynamicTripsFromTraccar = async (deviceId) => {
    try {
        // 1. Geofences map
        const geofencesRes = await traccarPool.query(`SELECT id, name FROM tc_geofences`);
        const geofenceMap = {};
        geofencesRes.rows.forEach(g => {
            geofenceMap[g.id] = g.name;
        });

        // 2. Positions history fetch
        const positionsRes = await traccarPool.query(`
            SELECT devicetime, latitude, longitude, speed, attributes, geofenceids
            FROM tc_positions
            WHERE deviceid = $1
            ORDER BY devicetime ASC
        `, [deviceId]);

        const positions = positionsRes.rows;
        if (!positions || positions.length === 0) {
            console.log(`⚠️ Device ${deviceId} ke liye koi positions nahi mili.`);
            return;
        }

        let currentState = 'IDLE';
        let startTime = null;
        let unloadingStartTime = null;
        const generatedTrips = [];

        for (const pos of positions) {
            const devTime = new Date(pos.devicetime);
            
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

            // Cycle Tracking Logic
            if ((currentState === 'IDLE' || currentState === 'IN_TRANSIT') && isLoadingZone) {
                currentState = 'LOADING';
                startTime = devTime;
            } else if (currentState === 'LOADING' && !isLoadingZone) {
                currentState = 'IN_TRANSIT';
            } else if ((currentState === 'IN_TRANSIT' || currentState === 'LOADING') && isUnloadingZone) {
                currentState = 'UNLOADING';
                unloadingStartTime = devTime;
            } else if (currentState === 'UNLOADING' && !isUnloadingZone) {
                const endTime = devTime;
                const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

                generatedTrips.push({
                    vehicle_id: deviceId,
                    start_time: startTime,
                    unloading_start_time: unloadingStartTime || devTime,
                    end_time: endTime,
                    status: 'COMPLETED',
                    total_cycle_minutes: durationMinutes,
                    start_lat: pos.latitude,
                    start_lng: pos.longitude
                });

                currentState = 'IDLE';
                startTime = null;
                unloadingStartTime = null;
            }
        }

        console.log(`✨ Device ${deviceId}: ${generatedTrips.length} dynamic trips detected.`);

        // Duplicate protection on DB insert
        for (const trip of generatedTrips) {
            await pool.query(`
                INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8
                WHERE NOT EXISTS (
                    SELECT 1 FROM trips WHERE vehicle_id = $1 AND start_time = $2
                )
            `, [
                trip.vehicle_id, 
                trip.start_time, 
                trip.unloading_start_time, 
                trip.end_time, 
                trip.status, 
                trip.total_cycle_minutes, 
                trip.start_lat, 
                trip.start_lng
            ]);
        }
    } catch (err) {
        console.error(`❌ Scanner Error (Device ${deviceId}):`, err.message);
    }
};

module.exports = { syncDynamicTripsFromTraccar };