const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// distance.js (ya jahan parseWKT defined hai)
const parseWKT = (wkt) => {
    if (!wkt) return { coordinates: [], center: null };

    try {
        const upperWkt = wkt.trim().toUpperCase();

        // 1. Handle CIRCLE format: CIRCLE (lat lon, radius)
        if (upperWkt.startsWith('CIRCLE')) {
            const matches = wkt.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
            if (matches) {
                const lat = parseFloat(matches[1]);
                const lon = parseFloat(matches[2]);
                const radius = parseFloat(matches[3]);
                
                // Return center and a rough bounding polygon/coordinates if needed
                return {
                    coordinates: [],
                    center: { latitude: lat, longitude: lon },
                    radius: radius,
                    shape: 'circle'
                };
            }
        }

        // 2. Handle POLYGON format: POLYGON ((lat lon, lat lon, ...))
        if (upperWkt.startsWith('POLYGON')) {
            const coordsString = wkt.substring(wkt.indexOf('((') + 2, wkt.lastIndexOf('))'));
            const pairs = coordsString.split(',');
            const coordinates = pairs.map(pair => {
                const [lat, lon] = pair.trim().split(/\s+/).map(Number);
                return [lat, lon];
            });

            // Calculate simple center for polygon
            const total = coordinates.length;
            const sumLat = coordinates.reduce((acc, curr) => acc + curr[0], 0);
            const sumLon = coordinates.reduce((acc, curr) => acc + curr[1], 0);
            const center = total > 0 ? { latitude: sumLat / total, longitude: sumLon / total } : null;

            return { coordinates, center, shape: 'polygon' };
        }

        // 3. Handle LINESTRING format
        if (upperWkt.startsWith('LINESTRING')) {
            const coordsString = wkt.substring(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
            const pairs = coordsString.split(',');
            const coordinates = pairs.map(pair => {
                const [lat, lon] = pair.trim().split(/\s+/).map(Number);
                return [lat, lon];
            });
            const center = coordinates.length > 0 ? { latitude: coordinates[0][0], longitude: coordinates[0][1] } : null;

            return { coordinates, center, shape: 'linestring' };
        }
    } catch (e) {
        console.error("❌ Error parsing WKT:", e.message);
    }

    return { coordinates: [], center: null };
};


const getGeofenceCenter = (wktArea) => {
    const { center } = parseWKT(wktArea);
    return center;
};

module.exports = { calculateDistance, parseWKT, getGeofenceCenter };