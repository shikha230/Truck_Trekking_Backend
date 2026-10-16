const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');

// Ye path /api/dashboard/stats ban jayega
router.get('/stats', getDashboardStats); 

module.exports = router;