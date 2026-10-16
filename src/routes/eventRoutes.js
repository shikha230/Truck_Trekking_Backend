const express = require('express');
const router = express.Router();
const { getRecentEvents } = require('../controllers/eventController');

router.get('/', getRecentEvents); // '/recent' ko hata kar sirf '/' kar dein
module.exports = router;