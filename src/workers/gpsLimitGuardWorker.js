const { isPointInPolygon } = require('geolib');
const { pool, traccarPool } = require('../config/db');
const { parseWKT } = require('../utils/distance');

const toGeolibPolygon = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return null;
    return coordinates.map(coord => ({
        latitude: Array.isArray(coord) ? Number(coord[0]) : Number(coord.latitude),
        longitude: Array.isArray(coord) ? Number(coord[1]) : Number(coord.longitude)
    }));
};

const getGpsLimitPolygon = async () => {
    const geoRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
    const gpsLimitRow = geoRes.rows.find(g =>
        (g.name || '').toLowerCase().includes('gps limit')
    );
    if (!gpsLimitRow || !gpsLimitRow.area) return null;

    const { coordinates } = parseWKT(gpsLimitRow.area);
    return toGeolibPolygon(coordinates);
};

const purgeOutsideGpsData = async (hoursLookback = 168) => {
    try {
        const gpsLimitPolygon = await getGpsLimitPolygon();
        if (!gpsLimitPolygon) {
            console.log("⚠️ 'GPS LIMITs' geofence not found.");
            return { deleted: 0 };
        }

        const posRes = await traccarPool.query(`
            SELECT id, deviceid, devicetime, latitude, longitude
            FROM tc_positions
            WHERE devicetime >= NOW() - INTERVAL '${Number(hoursLookback)} hours'
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
        `);

        const outsideIds = [];
        const affectedDeviceIds = new Set();

        for (const row of posRes.rows) {
            const inside = isPointInPolygon(
                { latitude: Number(row.latitude), longitude: Number(row.longitude) },
                gpsLimitPolygon
            );
            if (!inside) {
                outsideIds.push(row.id);
                affectedDeviceIds.add(row.deviceid);
            }
        }

        if (outsideIds.length > 0) {
            for (const devId of affectedDeviceIds) {
                const lastValidRes = await traccarPool.query(`
                    SELECT id FROM tc_positions
                    WHERE deviceid = $1 AND id != ALL($2::bigint[])
                    ORDER BY devicetime DESC
                    LIMIT 1
                `, [devId, outsideIds]);

                const fallbackPosId = lastValidRes.rows[0]?.id || null;
                await traccarPool.query(
                    `UPDATE tc_devices SET positionid = $1 WHERE id = $2 AND positionid = ANY($3::bigint[])`,
                    [fallbackPosId, devId, outsideIds]
                );
            }

            const delRes = await traccarPool.query(
                `DELETE FROM tc_positions WHERE id = ANY($1::bigint[]) RETURNING id`,
                [outsideIds]
            );

            console.log(`🧹 [GPS LIMIT GUARD] Deleted ${delRes.rowCount} out-of-bounds GPS point(s) for devices: [${[...affectedDeviceIds].join(', ')}]`);
            return { deleted: delRes.rowCount };
        } else {
            console.log(`✅ [GPS LIMIT GUARD] No out-of-bounds points found in last ${hoursLookback}h.`);
            return { deleted: 0 };
        }
    } catch (err) {
        console.error("❌ Error in GPS Limit Guard Worker:", err.message);
        return { deleted: 0, error: err.message };
    }
};

// Agar file ko seedha terminal se run kiya jaye: node src/workers/gpsLimitGuardWorker.js 168
if (require.main === module) {
    const hours = Number(process.argv[2] || 168);
    purgeOutsideGpsData(hours).then(() => process.exit(0));
} else {
    // Jab server/app ke andar require ho: initial cleanup + har 10 sec guard
    purgeOutsideGpsData(720);
    setInterval(() => purgeOutsideGpsData(1), 10000);
}

module.exports = { purgeOutsideGpsData, getGpsLimitPolygon };