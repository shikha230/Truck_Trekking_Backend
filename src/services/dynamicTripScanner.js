const { isPointInPolygon } = require('geolib');
const { pool, traccarPool } = require('../config/db');

// Attributes JSON ko safely parse karne ke liye helper function
const parseAttributes = (rawAttributes) => {
    if (!rawAttributes) return {};
    if (typeof rawAttributes === 'string') {
        try { return JSON.parse(rawAttributes); } catch (e) { return {}; }
    }
    return rawAttributes;
};

// const syncDynamicTripsFromTraccar = async (deviceId) => {
//     try {
//         // 1. Traccar se LINESTRING geofences fetch karein
//         const geofencesRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
//         const zones = [];

//         for (const g of geofencesRes.rows) {
//             if (g.area && g.area.startsWith('LINESTRING')) {
//                 const matches = [...g.area.matchAll(/([-\d.]+)\s+([-\d.]+)/g)];
//                 const polygonCoords = matches.map(m => ({
//                     latitude: parseFloat(m[1]),
//                     longitude: parseFloat(m[2])
//                 }));

//                 if (polygonCoords.length > 0) {
//                     zones.push({
//                         id: g.id,
//                         name: g.name,
//                         polygon: polygonCoords
//                     });
//                 }
//             }
//         }

//         if (zones.length === 0) {
//             console.log(`⚠️ Traccar mein koi valid polygon geofences nahi mile!`);
//             return;
//         }

//         // 2. Traccar positions history fetch karein (attributes ke sath taaki io9 mil sake)
//         const positionsRes = await traccarPool.query(`
//             SELECT devicetime, latitude, longitude, speed, attributes 
//             FROM tc_positions 
//             WHERE deviceid = $1 
//             ORDER BY devicetime ASC
//         `, [deviceId]);

//         const positions = positionsRes.rows;
//         if (!positions || positions.length === 0) return;

//         let currentState = 'IDLE';
//         let startTime = null;
//         let unloadingStartTime = null;
//         let startLat = null;
//         let startLng = null;
//         let lastTripEndTime = null; // Jitter / spam rokne ke liye cooldown tracker
        
//         const generatedTrips = [];

//         for (const pos of positions) {
//             const devTime = new Date(pos.devicetime);
//             const point = { latitude: pos.latitude, longitude: pos.longitude };
            
//             // Attributes se io9 extract karna
//             const attributes = parseAttributes(pos.attributes);
//             const io9 = attributes.io9 !== undefined ? Number(attributes.io9) : null;
            
//             // Client rule: io9 < 1000 matlab truck empty hai
//             const isTruckEmpty = io9 !== null && io9 < 1000;

//             // 3. Geofence check using geolib
//             let matchedZoneName = '';
//             for (const zone of zones) {
//                 const isInside = isPointInPolygon(point, zone.polygon);
//                 if (isInside) {
//                     matchedZoneName = zone.name.toLowerCase();
//                     break;
//                 }
//             }

//             const isLoadingZone = matchedZoneName.includes('loading') || matchedZoneName.includes('mine');
//             const isUnloadingZone = matchedZoneName.includes('unloading') || matchedZoneName.includes('plant');

//             // 4. State Machine Logic with Anti-Jitter Cooldown
//             if ((currentState === 'IDLE' || currentState === 'IN_TRANSIT') && isLoadingZone) {
//                 // Agar pichli trip khatam hone mein aur abhi me 5 minute ka gap nahi hai, toh ignore karo (Jitter filter)
//                 if (!lastTripEndTime || (devTime - lastTripEndTime) > (5 * 60 * 1000)) {
//                     currentState = 'LOADING';
//                     startTime = devTime;
//                     startLat = pos.latitude;
//                     startLng = pos.longitude;
//                 }
//             } 
//             else if (currentState === 'LOADING' && !isLoadingZone) {
//                 currentState = 'IN_TRANSIT';
//             } 
//             else if ((currentState === 'IN_TRANSIT' || currentState === 'LOADING') && isUnloadingZone) {
//                 if (!unloadingStartTime) {
//                     unloadingStartTime = devTime;
//                 }
//                 currentState = 'UNLOADING';
//             } 
//             // 5. Trip Complete Condition: Unloading Zone + io9 < 1000 (Truck Empty)
//             else if (currentState === 'UNLOADING' && isUnloadingZone && isTruckEmpty) {
//                 const endTime = devTime;
//                 const tripStartTime = startTime || devTime;
//                 const durationMinutes = Math.round((endTime - tripStartTime) / (1000 * 60));

//                 // Minimum 2 minutes ka cycle hona chahiye taaki fake/1-min trips generate na ho
//                 if (durationMinutes >= 2) {
//                     generatedTrips.push({
//                         vehicle_id: deviceId,
//                         start_time: tripStartTime,
//                         unloading_start_time: unloadingStartTime || devTime,
//                         end_time: endTime,
//                         status: 'COMPLETED',
//                         total_cycle_minutes: durationMinutes,
//                         start_lat: startLat || pos.latitude,
//                         start_lng: startLng || pos.longitude,
//                         end_io9: io9
//                     });

//                     lastTripEndTime = endTime;
//                 }

//                 // Reset state for next cycle
//                 currentState = 'IDLE';
//                 startTime = null;
//                 unloadingStartTime = null;
//                 startLat = null;
//                 startLng = null;
//             }
//         }

//         console.log(`✨ Device ${deviceId}: Cleaned logic ke mutabiq ${generatedTrips.length} valid trips detect huyi hain.`);

//         // 6. Database mein insert karein (Duplicate check ke sath)
//         for (const trip of generatedTrips) {
//             await pool.query(`
//                 INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng, end_io9)
//                 SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
//                 WHERE NOT EXISTS (
//                     SELECT 1 FROM trips WHERE vehicle_id = $1 AND start_time = $2
//                 )
//             `, [
//                 trip.vehicle_id, trip.start_time, trip.unloading_start_time, 
//                 trip.end_time, trip.status, trip.total_cycle_minutes, 
//                 trip.start_lat, trip.start_lng, trip.end_io9
//             ]);
//         }
//     } catch (err) {
//         console.error(`❌ Sync Error (Device ${deviceId}):`, err.message);
//     }
// };


const syncDynamicTripsFromTraccar = async (deviceId) => {
    try {
        // 1. Vehicle ka naam fetch karein taaki pata chale CAT dumper hai ya Volvo truck
        const vehicleRes = await pool.query(`SELECT name FROM vehicles WHERE traccar_id::text = $1::text OR id::text = $1::text`, [deviceId]);
        const vehicleName = vehicleRes.rows.length > 0 ? vehicleRes.rows[0].name.toUpperCase() : '';
        const isCat = vehicleName.includes('CAT');
        const isVolvo = vehicleName.includes('VOLVO');

        if (!isCat && !isVolvo) {
            console.log(`⚠️ Device ${deviceId} (${vehicleName}) CAT ya Volvo ki category mein match nahi hua.`);
            return;
        }

        // 2. Traccar se geofences fetch karein (Loading aur Un-loading zones ke liye)
        const geofencesRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        const zones = [];

        for (const g of geofencesRes.rows) {
            if (g.area) {
                const matches = [...g.area.matchAll(/([-\d.]+)\s+([-\d.]+)/g)];
                const polygonCoords = matches.map(m => ({
                    latitude: parseFloat(m[1]),
                    longitude: parseFloat(m[2])
                }));

                if (polygonCoords.length > 0) {
                    zones.push({
                        id: g.id,
                        name: g.name.toLowerCase(),
                        polygon: polygonCoords
                    });
                }
            }
        }

        // 3. Traccar positions history fetch karein with attributes (io6, io9, in1, speed)
        const positionsRes = await traccarPool.query(`
            SELECT devicetime, latitude, longitude, speed, attributes 
            FROM tc_positions 
            WHERE deviceid = $1 
            ORDER BY devicetime ASC
        `, [deviceId]);

        const positions = positionsRes.rows;
        if (!positions || positions.length === 0) return;

        let currentState = 'IDLE';
        let startTime = null;
        let unloadingStartTime = null;
        let startLat = null;
        let startLng = null;
        let lastTripEndTime = null;
        
        const generatedTrips = [];

        for (const pos of positions) {
            const devTime = new Date(pos.devicetime);
            const point = { latitude: pos.latitude, longitude: pos.longitude };
            const speed = Number(pos.speed || 0);
            
            // Attributes parsing
            const attributes = parseAttributes(pos.attributes);
            const io6 = Number(attributes.io6 || attributes.IO6 || 0);
            const io9 = Number(attributes.io9 || attributes.IO9 || 0);
            const in1 = Number(attributes.in1 || attributes.IN1 || attributes.io1 || attributes.IO1 || 0);

            // Client Rule: in1 must be true/1 and speed must be 0 (stopped)
            const isIn1True = (in1 === 1 || in1 === true || in1 === '1');
            const isStopped = speed <= 0.5;

            if (!isIn1True || !isStopped) continue; // Skip if conditions don't match

            // Check Geofence zone
            let matchedZoneName = '';
            for (const zone of zones) {
                const isInside = isPointInPolygon(point, zone.polygon);
                if (isInside) {
                    matchedZoneName = zone.name;
                    break;
                }
            }

            const isLoadingZone = matchedZoneName.includes('loading') || matchedZoneName.includes('mine');
            const isUnloadingZone = matchedZoneName.includes('unloading') || matchedZoneName.includes('plant');

            // --- CATEGORY WISE RULES ---
            if (isCat) {
                // CAT Dumpers Logic: Start -> Loading Area, IO6 < 900, IO9 > 3000
                if ((currentState === 'IDLE' || currentState === 'IN_TRANSIT') && isLoadingZone) {
                    if (io6 < 900 && io9 > 3000) {
                        if (!lastTripEndTime || (devTime - lastTripEndTime) > (5 * 60 * 1000)) {
                            currentState = 'LOADING';
                            startTime = devTime;
                            startLat = pos.latitude;
                            startLng = pos.longitude;
                        }
                    }
                } 
                else if (currentState === 'LOADING' && !isLoadingZone) {
                    currentState = 'IN_TRANSIT';
                } 
                else if ((currentState === 'IN_TRANSIT' || currentState === 'LOADING') && isUnloadingZone) {
                    if (!unloadingStartTime) unloadingStartTime = devTime;
                    currentState = 'UNLOADING';
                } 
                // CAT Ends Logic: IO6 > 3000, IO9 < 750 (Even if not strictly in un-loading area, flag it per remarks)[cite: 8]
                else if (currentState === 'UNLOADING' && io6 > 3000 && io9 < 750) {
                    const endTime = devTime;
                    const tripStartTime = startTime || devTime;
                    const durationMinutes = Math.round((endTime - tripStartTime) / (1000 * 60));
                    const isFlagged = !isUnloadingZone; // Flag if outside un-loading area[cite: 8]

                    if (durationMinutes >= 2) {
                        generatedTrips.push({
                            vehicle_id: deviceId,
                            start_time: tripStartTime,
                            unloading_start_time: unloadingStartTime || devTime,
                            end_time: endTime,
                            status: isFlagged ? 'FLAGGED' : 'COMPLETED',
                            total_cycle_minutes: durationMinutes,
                            start_lat: startLat || pos.latitude,
                            start_lng: startLng || pos.longitude,
                            end_io9: io9,
                            remarks: isFlagged ? 'Completed outside un-loading area (Flagged)' : 'Normal Completion'
                        });
                        lastTripEndTime = endTime;
                    }

                    currentState = 'IDLE';
                    startTime = null;
                    unloadingStartTime = null;
                    startLat = null;
                    startLng = null;
                }
            } else if (isVolvo) {
                // Volvo Trucks Logic: Start -> Loading Area, IO6 < 1400, IO9 > 15000
                if ((currentState === 'IDLE' || currentState === 'IN_TRANSIT') && isLoadingZone) {
                    if (io6 < 1400 && io9 > 15000) {
                        if (!lastTripEndTime || (devTime - lastTripEndTime) > (5 * 60 * 1000)) {
                            currentState = 'LOADING';
                            startTime = devTime;
                            startLat = pos.latitude;
                            startLng = pos.longitude;
                        }
                    }
                } 
                else if (currentState === 'LOADING' && !isLoadingZone) {
                    currentState = 'IN_TRANSIT';
                } 
                else if ((currentState === 'IN_TRANSIT' || currentState === 'LOADING') && isUnloadingZone) {
                    if (!unloadingStartTime) unloadingStartTime = devTime;
                    currentState = 'UNLOADING';
                } 
                // Volvo Ends Logic: IO6 > 2000, IO9 < 2500 (Flag if outside un-loading area)[cite: 8]
                else if (currentState === 'UNLOADING' && io6 > 2000 && io9 < 2500) {
                    const endTime = devTime;
                    const tripStartTime = startTime || devTime;
                    const durationMinutes = Math.round((endTime - tripStartTime) / (1000 * 60));
                    const isFlagged = !isUnloadingZone; // Flag if outside un-loading area[cite: 8]

                    if (durationMinutes >= 2) {
                        generatedTrips.push({
                            vehicle_id: deviceId,
                            start_time: tripStartTime,
                            unloading_start_time: unloadingStartTime || devTime,
                            end_time: endTime,
                            status: isFlagged ? 'FLAGGED' : 'COMPLETED',
                            total_cycle_minutes: durationMinutes,
                            start_lat: startLat || pos.latitude,
                            start_lng: startLng || pos.longitude,
                            end_io9: io9,
                            remarks: isFlagged ? 'Completed outside un-loading area (Flagged)' : 'Normal Completion'
                        });
                        lastTripEndTime = endTime;
                    }

                    currentState = 'IDLE';
                    startTime = null;
                    unloadingStartTime = null;
                    startLat = null;
                    startLng = null;
                }
            }
        }

        console.log(`✨ Device ${deviceId} (${vehicleName}): Sheet rules ke mutabiq ${generatedTrips.length} trips generate huyi hain.`);

        // 6. Database Insert with Duplicate Prevention
        for (const trip of generatedTrips) {
            await pool.query(`
                INSERT INTO trips (vehicle_id, start_time, unloading_start_time, end_time, status, total_cycle_minutes, start_lat, start_lng, end_io9)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
                WHERE NOT EXISTS (
                    SELECT 1 FROM trips WHERE vehicle_id = $1 AND start_time = $2
                )
            `, [
                trip.vehicle_id, trip.start_time, trip.unloading_start_time, 
                trip.end_time, trip.status, trip.total_cycle_minutes, 
                trip.start_lat, trip.start_lng, trip.end_io9
            ]);
        }
    } catch (err) {
        console.error(`❌ Sync Error (Device ${deviceId}):`, err.message);
    }
};
module.exports = { syncDynamicTripsFromTraccar };