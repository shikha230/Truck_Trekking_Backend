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

const parseWKT = (wktArea) => {
    if (!wktArea) return { coordinates: [], center: null };
    const rawPoints = wktArea.match(/[\d.-]+/g);
    if (!rawPoints || rawPoints.length < 2) return { coordinates: [], center: null };

    const coordinates = [];
    let sumLat = 0, sumLon = 0;

    for (let i = 0; i < rawPoints.length; i += 2) {
        let val1 = parseFloat(rawPoints[i]);
        let val2 = parseFloat(rawPoints[i + 1]);

        if (isNaN(val1) || isNaN(val2)) continue;

        // Auto-detect Latitude (~22) vs Longitude (~82)
        let lat = val1 < val2 ? val1 : val2;
        let lon = val1 < val2 ? val2 : val1;

        coordinates.push([lat, lon]);
        sumLat += lat;
        sumLon += lon;
    }

    const count = coordinates.length;
    const center = count > 0 ? { latitude: sumLat / count, longitude: sumLon / count } : null;

    return { coordinates, center };
};

const getGeofenceCenter = (wktArea) => {
    const { center } = parseWKT(wktArea);
    return center;
};

module.exports = { calculateDistance, parseWKT, getGeofenceCenter };