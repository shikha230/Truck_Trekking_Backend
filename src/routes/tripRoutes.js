const express = require('express');
const router = express.Router();
const { getRecentTrips, getTruckHistory, getVehiclesList } = require('../controllers/tripController');
const { generateTripsFromHistory } = require('../services/tripGeneratorService'); // <-- Service import karein

router.get('/trip', getRecentTrips);
router.get('/history/:deviceId', getTruckHistory);
router.get('/vehicles-list', getVehiclesList); // New Route
// <-- Naya route yahan add karein taaki history scan ho sake
router.get('/generate/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const result = await generateTripsFromHistory(deviceId);
    res.json(result);
});

module.exports = router;