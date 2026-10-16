const express = require('express');
const router = express.Router();
const { getLiveVehicles, getAllVehicles, registerVehicle, updateVehicle, deleteVehicle } = require('../controllers/vehicleController');

router.get('/live', getLiveVehicles); // For Map
router.get('/all', getAllVehicles);   // For Vehicle List Page
router.post('/add', registerVehicle); // <--- Naya POST route add kiya
router.post('/add', registerVehicle);
router.put('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);
module.exports = router;