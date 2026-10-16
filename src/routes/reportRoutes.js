const express = require('express');
const router = express.Router();
const { getShiftReport } = require('../controllers/reportController');

router.get('/shift', getShiftReport);

module.exports = router;