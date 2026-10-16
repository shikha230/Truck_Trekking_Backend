const { isPointWithinRadius } = require('geolib');
const { pool, traccarPool } = require('../config/db');

// Function to scan truck history and automatically generate completed trips
const generateTripsFromHistory = async (deviceId) => {
    try {
        console.log(`🔍 Scanning history using Geolib for device ${deviceId}...`);
        const geofencesRes = await pool.query(`SELECT id, name, latitude, longitude, radius FROM geofences`);
        const zones = geofencesRes.rows;

        if (zones.length === 0) {
            console.log(`⚠️ No local geofences found in database!`);
            return { success: false, message: 'No local geofences found' };
        }

        // 2. Traccar se historical positions fetch karein (Oldest to Newest)
        const queryText = `
            SELECT devicetime, latitude, longitude, speed 
            FROM tc_positions 
            WHERE deviceid = $1 
            ORDER BY devicetime ASC
        `;
        const result = await traccarPool.query(queryText, [deviceId]);

        if (result.rows.length === 0) {
            console.log(`⚠️ No history found for device ${deviceId}`);
            return { success: false, message: 'No history found' };
        }

        let currentTrip = null;
        let generatedTripsCount = 0;

        for (const pos of result.rows) {
            const devTime = new Date(pos.devicetime);
            const point = { latitude: pos.latitude, longitude: pos.longitude };

            // 3. Check karein ki truck kis geofence ke andar hai using geolib
            let matchedZoneName = '';
            for (const zone of zones) {
                // zone.radius agar meters me hai (default 100m ya jo bhi ho)
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

            // 4. State Machine Logic
            if (!currentTrip && isLoadingZone) {
                currentTrip = {
                    vehicle_id: deviceId,
                    start_time: devTime,
                    start_lat: pos.latitude,
                    start_lng: pos.longitude,
                    status: 'LOADING'
                };
            } else if (currentTrip && currentTrip.status === 'LOADING' && !isLoadingZone) {
                currentTrip.status = 'IN_TRANSIT';
            } else if (currentTrip && (currentTrip.status === 'IN_TRANSIT' || currentTrip.status === 'LOADING') && isUnloadingZone) {
                currentTrip.status = 'UNLOADING';
                currentTrip.unloading_start_time = devTime;
            } else if (currentTrip && currentTrip.status === 'UNLOADING' && !isUnloadingZone) {
                const endTime = devTime;
                const durationMinutes = Math.max(1, Math.round((endTime - new Date(currentTrip.start_time)) / (1000 * 60)));

                // Main database ki trips table me save karein
                await pool.query(`
                    INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng)
                    VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7)
                `, [
                    currentTrip.vehicle_id,
                    currentTrip.start_time,
                    currentTrip.unloading_start_time || endTime,
                    endTime,
                    durationMinutes,
                    currentTrip.start_lat,
                    currentTrip.start_lng
                ]);

                generatedTripsCount++;
                currentTrip = null;
            }
        }

        console.log(`✅ Successfully generated ${generatedTripsCount} completed trips using Geolib for device ${deviceId}`);
        return { success: true, count: generatedTripsCount };

    } catch (err) {
        console.error("❌ Error in Geolib trip generation:", err.message);
        return { success: false, error: err.message };
    }
};
module.exports = { generateTripsFromHistory };