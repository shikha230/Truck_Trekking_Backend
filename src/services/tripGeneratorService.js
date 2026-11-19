const { isPointWithinRadius } = require('geolib');
const { pool, traccarPool } = require('../config/db');

// Function to scan truck history strictly matching Client Rules & Zone-to-Zone Cycle
const generateTripsFromHistory = async (deviceId) => {
    try {
        console.log(`🔍 Scanning history with Strict Client Rules for device ${deviceId}...`);
        
        // 1. Fetch local geofences
        const geofencesRes = await pool.query(`SELECT id, name, type, category, latitude, longitude, radius FROM geofences`);
        const zones = geofencesRes.rows;

        if (zones.length === 0) {
            console.log(`⚠️ No geofences found in database!`);
            return { success: false, message: 'No geofences found' };
        }

        // 2. Fetch historical positions from Traccar (Oldest to Newest)
        const queryText = `
            SELECT devicetime, latitude, longitude, speed, attributes, course 
            FROM tc_positions 
            WHERE deviceid = $1 
            ORDER BY devicetime ASC
        `;
        const result = await traccarPool.query(queryText, [deviceId]);

        if (result.rows.length === 0) {
            console.log(`⚠️ No history found for deviceid ${deviceId}`);
            return { success: false, message: 'No history found' };
        }

        // Clear existing trips before clean re-scan
        await pool.query(`DELETE FROM trips WHERE vehicle_id = $1`, [Number(deviceId)]);

        let tripState = 'IDLE'; // IDLE -> IN_TRANSIT -> WAITING_UNLOAD
        let currentTrip = null;
        let lastTripEndTime = 0; 
        let generatedTripsCount = 0;

        for (const pos of result.rows) {
            const devTime = new Date(pos.devicetime);
            const point = { latitude: pos.latitude, longitude: pos.longitude };
            const attributes = typeof pos.attributes === 'string' ? JSON.parse(pos.attributes) : (pos.attributes || {});
            
            const speedKmh = Math.round((pos.speed || 0) * 1.852);
            const io6 = Number(attributes.io6 || 0);
            const io9 = Number(attributes.io9 || 0);
            const io1 = Number(attributes.input_1 || attributes.io1 || 1);

            // Check geofence zone match
            let matchedZone = null;
            for (const zone of zones) {
                const radiusMeters = zone.radius || 150; 
                if (isPointWithinRadius(point, { latitude: zone.latitude, longitude: zone.longitude }, radiusMeters)) {
                    matchedZone = zone;
                    break;
                }
            }

            const zoneType = matchedZone ? (matchedZone.type || matchedZone.category || matchedZone.name || '').toLowerCase() : '';
            const isLoadingArea = zoneType.includes('loading') || zoneType.includes('mine');
            const isUnloadingArea = zoneType.includes('unloading') || zoneType.includes('plant');

            // -----------------------------------------------------------------
            // STRICT CLIENT RULE STATE MACHINE
            // -----------------------------------------------------------------

            // STATE 1: IDLE -> Look for Loading Start (Must be in Loading Area OR meet exact start IO rules)
            if (tripState === 'IDLE') {
                const isStartRuleMet = (speedKmh <= 2 && io1 === 1 && io6 < 900 && io9 > 3000);
                const timeSinceLastTrip = (devTime.getTime() - lastTripEndTime) / 1000; // in seconds

                if (isStartRuleMet && (lastTripEndTime === 0 || timeSinceLastTrip > 600)) {
                    tripState = 'IN_TRANSIT';
                    currentTrip = {
                        vehicle_id: Number(deviceId),
                        start_time: devTime,
                        start_lat: pos.latitude,
                        start_lng: pos.longitude,
                        status: 'IN_TRANSIT'
                    };
                }
            } 
            // STATE 2: IN_TRANSIT -> Truck has started, now it must travel and reach Unloading Area to end trip
            else if (tripState === 'IN_TRANSIT') {
                // Client Rule for Trip Ends: Speed = 0, IO6 > 3000, IO9 < 750
                const isEndRuleMet = (speedKmh <= 2 && io6 > 3000 && io9 < 750);

                if (isEndRuleMet) {
                    const endTime = devTime;
                    const durationMinutes = Math.max(2, Math.round((endTime - new Date(currentTrip.start_time)) / (1000 * 60)));

                    let status = 'COMPLETED';
                    let remarks = 'Normal Completion';

                    // Client Flag Rule: "Even if not in Un-loading Area then don't reject. Flag It"
                    if (!isUnloadingArea && matchedZone) {
                        status = 'FLAGGED';
                        remarks = 'Flagged: Outside Un-loading Area';
                    } else if (!matchedZone) {
                        status = 'FLAGGED';
                        remarks = 'Flagged: Completed outside geofence';
                    }

                    // Save valid trip into database
                    await pool.query(`
                        INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, end_io9, remarks, start_lat, start_lng)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [
                        currentTrip.vehicle_id,
                        currentTrip.start_time,
                        endTime,
                        endTime,
                        status,
                        durationMinutes,
                        io9,
                        remarks,
                        currentTrip.start_lat,
                        currentTrip.start_lng
                    ]);

                    generatedTripsCount++;
                    lastTripEndTime = endTime.getTime(); 
                    tripState = 'IDLE'; // Reset for next cycle
                    currentTrip = null;
                }
            }
        }

        console.log(`✅ Successfully generated ${generatedTripsCount} strict client-compliant trips for device ${deviceId}`);
        return { success: true, count: generatedTripsCount };

    } catch (err) {
        console.error("❌ Error in strict client trip generation:", err.message);
        return { success: false, error: err.message };
    }
};

module.exports = { generateTripsFromHistory };