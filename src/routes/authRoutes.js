const express = require('express');
const router = express.Router();
const { adminLogin, forgotPassword, resetPasswordWithOTP, changePassword, loginUser } = require('../controllers/authController');

// POST /api/admin/login
router.post('/login', adminLogin);
router.post('/forgot-password', forgotPassword);
router.post('/login-user', loginUser);
// OTP verify karke naya password set karne ke liye
router.post('/reset-password-otp', resetPasswordWithOTP);
router.post('/change-password', changePassword);
module.exports = router;