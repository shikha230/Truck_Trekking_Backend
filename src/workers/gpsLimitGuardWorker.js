const { isPointInPolygon } = require('geolib');
const { pool, traccarPool } = require('../config/db');
const { parseWKT } = require('../utils/distance');

let isRunning = false;
let cachedPolygon = {
    polygon: null,
    expiresAt: 0,
};

const toGeolibPolygon = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return null;
    return coordinates.map(coord => ({
        latitude: Array.isArray(coord) ? Number(coord[0]) : Number(coord.latitude),
        longitude: Array.isArray(coord) ? Number(coord[1]) : Number(coord.longitude)
    }));
};

const getGpsLimitPolygon = async () => {
    const now = Date.now();
    if (cachedPolygon.polygon && now < cachedPolygon.expiresAt) {
        return cachedPolygon.polygon;
    }

    const geoRes = await traccarPool.query(`SELECT id, name, area FROM tc_geofences`);
    const gpsLimitRow = geoRes.rows.find(g =>
        (g.name || '').toLowerCase().includes('gps limit')
    );
    if (!gpsLimitRow || !gpsLimitRow.area) return null;

    const { coordinates } = parseWKT(gpsLimitRow.area);
    const poly = toGeolibPolygon(coordinates);

    cachedPolygon = {
        polygon: poly,
        expiresAt: now + 60000, // 60s cache
    };

    return poly;
};

const chunkArray = (arr, size = 500) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

const purgeOutsideGpsData = async (hoursLookback = 24) => {
    if (isRunning) {
        console.log('⏳ [GPS LIMIT GUARD] Previous run still in progress, skipping...');
        return { deleted: 0, skipped: true };
    }

    isRunning = true;
    try {
        const gpsLimitPolygon = await getGpsLimitPolygon();
        if (!gpsLimitPolygon) {
            console.log("⚠️ 'GPS LIMITs' geofence not found.");
            return { deleted: 0 };
        }

        const safeHours = Math.max(1, Number(hoursLookback) || 24);
        const posRes = await traccarPool.query(`
            SELECT id, deviceid, devicetime, latitude, longitude
            FROM tc_positions
            WHERE devicetime >= NOW() - ($1::int * INTERVAL '1 hour')
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            LIMIT 50000
        `, [safeHours]);

        const outsideIds = [];
        const outsideSet = new Set();
        const affectedDeviceIds = new Set();

        for (const row of posRes.rows) {
            const inside = isPointInPolygon(
                { latitude: Number(row.latitude), longitude: Number(row.longitude) },
                gpsLimitPolygon
            );
            if (!inside) {
                outsideIds.push(row.id);
                outsideSet.add(String(row.id));
                affectedDeviceIds.add(row.deviceid);
            }
        }

        if (outsideIds.length > 0) {
            for (const devId of affectedDeviceIds) {
                const lastValidRes = await traccarPool.query(`
                    SELECT id FROM tc_positions
                    WHERE deviceid = $1
                    ORDER BY devicetime DESC
                    LIMIT 20
                `, [devId]);

                const validRow = lastValidRes.rows.find(r => !outsideSet.has(String(r.id)));
                const fallbackPosId = validRow ? validRow.id : null;

                for (const idChunk of chunkArray(outsideIds, 500)) {
                    await traccarPool.query(
                        `UPDATE tc_devices SET positionid = $1 WHERE id = $2 AND positionid = ANY($3::bigint[])`,
                        [fallbackPosId, devId, idChunk]
                    );
                }
            }

            let totalDeleted = 0;
            for (const idChunk of chunkArray(outsideIds, 500)) {
                const delRes = await traccarPool.query(
                    `DELETE FROM tc_positions WHERE id = ANY($1::bigint[]) RETURNING id`,
                    [idChunk]
                );
                totalDeleted += delRes.rowCount || 0;
            }

            console.log(`🧹 [GPS LIMIT GUARD] Deleted ${totalDeleted} out-of-bounds GPS point(s) for devices: [${[...affectedDeviceIds].join(', ')}]`);
            return { deleted: totalDeleted };
        } else {
            console.log(`✅ [GPS LIMIT GUARD] No out-of-bounds points found in last ${safeHours}h.`);
            return { deleted: 0 };
        }
    } catch (err) {
        console.error("❌ Error in GPS Limit Guard Worker:", err.message);
        return { deleted: 0, error: err.message };
    } finally {
        isRunning = false;
    }
};

// Agar file ko seedha terminal se run kiya jaye: node src/workers/gpsLimitGuardWorker.js 24
if (require.main === module) {
    const hours = Number(process.argv[2] || 24);
    purgeOutsideGpsData(hours).then(() => process.exit(0));
} else {
    // Initial light cleanup (24h) + har 60 sec mein guard
    purgeOutsideGpsData(24);
    setInterval(() => purgeOutsideGpsData(2), 60000);
}

module.exports = { purgeOutsideGpsData, getGpsLimitPolygon };