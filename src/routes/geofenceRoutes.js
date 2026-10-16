const express = require('express');
const router = express.Router();
const geofenceController = require('../controllers/geofenceController');

// 1. Get all geofences
// Path: GET /api/geofences
router.get('/', geofenceController.getAllGeofences);

// 2. Add new geofence (Jab map par click karke save karenge)
// Path: POST /api/geofences
router.post('/', geofenceController.addGeofence);

// 3. Delete a geofence
// Path: DELETE /api/geofences/:id
router.delete('/:id', geofenceController.deleteGeofence);

module.exports = router;