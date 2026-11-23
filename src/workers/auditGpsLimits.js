const { isPointInPolygon } = require('geolib');
const { pool, traccarPool } = require('../config/db'); // Path apne project structure ke mutabiq check karein
const { parseWKT } = require('../utils/distance');  // Path apne project structure ke mutabiq check karein

const toGeolibPolygon = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return null;
    return coordinates.map(coord => ({
        latitude: Array.isArray(coord) ? Number(coord[0]) : Number(coord.latitude),
        longitude: Array.isArray(coord) ? Number(coord[1]) : Number(coord.longitude)
    }));
};

const runAudit = async (hoursBack = 24) => {
    try {
        console.log(`\n🔍 Starting GPS LIMITs Audit (Last ${hoursBack} hours)...\n`);

        // 1. Fetch "GPS LIMITs" polygon from tc_geofences
        const geoRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
        const gpsLimitRow = geoRes.rows.find(g =>
            (g.name || '').toLowerCase().includes('gps limit')
        );

        if (!gpsLimitRow) {
            console.error("❌ 'GPS LIMITs' geofence not found in tc_geofences!");
            process.exit(1);
        }

        const parsed = parseWKT(gpsLimitRow.area);
        const gpsLimitPolygon = toGeolibPolygon(parsed.coordinates);

        if (!gpsLimitPolygon) {
            console.error("❌ Could not parse valid polygon coordinates from 'GPS LIMITs' area:", gpsLimitRow.area);
            process.exit(1);
        }

        console.log(`✅ Loaded Geofence: "${gpsLimitRow.name}" (ID: ${gpsLimitRow.id}) with ${gpsLimitPolygon.length} polygon vertices.`);

        // 2. Fetch device names
        const devRes = await traccarPool.query(`SELECT id, name, uniqueid FROM tc_devices`);
        const deviceMap = {};
        devRes.rows.forEach(d => {
            deviceMap[d.id] = { name: d.name, imei: d.uniqueid };
        });

        // 3. Fetch recent positions from Traccar tc_positions
        const posRes = await traccarPool.query(`
            SELECT id, deviceid, devicetime, latitude, longitude, speed
            FROM tc_positions
            WHERE devicetime >= NOW() - INTERVAL '${Number(hoursBack)} hours'
            ORDER BY devicetime DESC
        `);

        let insideCount = 0;
        let outsideCount = 0;
        const outsideByTruck = {};
        const sampleOutsidePoints = [];

        for (const row of posRes.rows) {
            const lat = Number(row.latitude);
            const lng = Number(row.longitude);
            if (!lat || !lng) continue;

            const inside = isPointInPolygon({ latitude: lat, longitude: lng }, gpsLimitPolygon);
            const devInfo = deviceMap[row.deviceid] || { name: `Device #${row.deviceid}`, imei: 'N/A' };

            if (inside) {
                insideCount++;
            } else {
                outsideCount++;
                if (!outsideByTruck[row.deviceid]) {
                    outsideByTruck[row.deviceid] = {
                        deviceId: row.deviceid,
                        name: devInfo.name,
                        imei: devInfo.imei,
                        outsidePoints: 0,
                        lastOutsideTime: row.devicetime,
                        lastOutsideCoords: `${lat}, ${lng}`
                    };
                }
                outsideByTruck[row.deviceid].outsidePoints++;

                if (sampleOutsidePoints.length < 15) {
                    sampleOutsidePoints.push({
                        truck: devInfo.name,
                        deviceId: row.deviceid,
                        time: new Date(row.devicetime).toISOString(),
                        lat,
                        lng,
                        speed: row.speed
                    });
                }
            }
        }

        console.log("\n📊 SUMMARY:");
        console.log(`   Total Scanned Points : ${posRes.rows.length}`);
        console.log(`   Inside GPS LIMITs    : ${insideCount}`);
        console.log(`   Outside GPS LIMITs   : ${outsideCount}`);

        const truckList = Object.values(outsideByTruck);
        if (truckList.length > 0) {
            console.log("\n🚨 TRUCKS WITH DATA OUTSIDE 'GPS LIMITs':");
            console.table(truckList);

            console.log("\n📍 SAMPLE OUTSIDE GPS POINTS (First 15):");
            console.table(sampleOutsidePoints);
        } else {
            console.log("\n🎉 CLEAN! No GPS points found outside 'GPS LIMITs' in this period.");
        }

        // 4. Also check local trips table start_lat/start_lng against GPS LIMITs
        try {
            const tripsRes = await pool.query(`
                SELECT id, vehicle_id, start_time, end_time, status, start_lat, start_lng
                FROM trips
                WHERE start_lat IS NOT NULL AND start_lng IS NOT NULL
                ORDER BY start_time DESC
                LIMIT 200
            `);

            const outsideTrips = tripsRes.rows.filter(t => {
                const inside = isPointInPolygon(
                    { latitude: Number(t.start_lat), longitude: Number(t.start_lng) },
                    gpsLimitPolygon
                );
                return !inside;
            });

            if (outsideTrips.length > 0) {
                console.log(`\n⚠️ FOUND ${outsideTrips.length} SAVED TRIPS WITH START COORDS OUTSIDE 'GPS LIMITs':`);
                console.table(outsideTrips.slice(0, 15).map(t => ({
                    tripId: t.id,
                    vehicleId: t.vehicle_id,
                    status: t.status,
                    startTime: t.start_time,
                    coords: `${t.start_lat}, ${t.start_lng}`
                })));
            } else {
                console.log("\n✅ All checked trips start inside 'GPS LIMITs'.");
            }
        } catch (dbErr) {
            console.warn("⚠️ Trips check skipped:", dbErr.message);
        }

        process.exit(0);
    } catch (err) {
        console.error("❌ Audit failed:", err.message);
        process.exit(1);
    }
};

// Optional CLI argument: node auditGpsLimits.js 48 (default 24 hours)
const hours = process.argv[2] || 24;
runAudit(hours);