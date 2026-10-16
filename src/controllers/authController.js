const { pool } = require('../config/db');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const bcrypt = require('bcryptjs');
const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = 'SELECT * FROM admins WHERE email = $1';
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const admin = result.rows[0];

    if (password !== admin.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { 
        id: admin.id, 
        name: admin.name, 
        email: admin.email, 
        role: 'admin' 
      }
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
};
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const checkUser = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: 'Admin email not found in database.' });
    }

    // 6 Digit ka random OTP generate karein
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Database me OTP aur expiry save karein (Pehle admins table me columns hone chahiye: otp, otp_expiry)
    await pool.query(
      'UPDATE admins SET otp = $1, otp_expiry = $2 WHERE email = $3',
      [otp, otpExpiry, email]
    );

    // Email message body
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #050A19; color: #ffffff; border-radius: 10px;">
        <h2 style="color: #00A8E8;">Truck-Trak Password Reset</h2>
        <p>A password reset request has been initiated for your admin account.</p>
        <p>Your Secure One-Time Password (OTP) is:</p>
        <h1 style="background: #003566; color: #00A8E8; padding: 10px 20px; display: inline-block; border-radius: 5px; letter-spacing: 5px;">${otp}</h1>
        <p style="font-size: 12px; color: #a0aec0; margin-top: 20px;">This OTP is valid for 10 minutes only. Do not share it with anyone.</p>
      </div>
    `;

    await sendEmail({
      email: email,
      subject: 'Truck-Trak Admin Password Reset OTP',
      message
    });

    res.status(200).json({ success: true, message: 'OTP sent successfully to your email.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ message: 'Error sending email. Check server configuration.' });
  }
};

// 2. Verify OTP & Reset Password
const resetPasswordWithOTP = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const admin = result.rows[0];

    // OTP aur Expiry check karein
    if (admin.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    if (new Date() > new Date(admin.otp_expiry)) {
      return res.status(400).json({ message: 'OTP has expired. Request a new one.' });
    }

    // New password update karein aur OTP clear kar dein
    await pool.query(
      'UPDATE admins SET password = $1, otp = NULL, otp_expiry = NULL WHERE email = $2',
      [newPassword, email]
    );

    res.status(200).json({ success: true, message: 'Password reset successfully!' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
};
const changePassword = async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
    }

    const admin = result.rows[0];

    // Old password verify karein
    if (oldPassword !== admin.password) {
      return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    }

    // New password update karein
    await pool.query('UPDATE admins SET password = $1 WHERE email = $2', [newPassword, email]);

    res.status(200).json({ 
      success: true, 
      message: 'Password changed successfully.' 
    });
  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ success: false, message: 'Server error during password change.' });
  }
};

// User Login API
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT id, name, email, role, password, is_active FROM users WHERE email = $1',
            [email]
        );

        console.log('Query Result Rows:', result.rows);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        // Check if user is active
        if (user.is_active === false) {
            return res.status(403).json({ success: false, error: 'Your account has been deactivated by the administrator.' });
        }

        // --- DIRECT BYPASS FOR TESTING ---
        let isMatch = true; 

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Server error during login' });
    }
};

// Middleware/Helper to check Admin Role for restricted actions
const verifyAdmin = (req, res, next) => {
    // Aap headers ya request body se role check kar sakte hain
    const role = req.headers['role'] || req.body.role;
    if (role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied! Only admins can perform this action.' });
    }
    next();
};

module.exports = { adminLogin,forgotPassword, resetPasswordWithOTP,changePassword ,loginUser, verifyAdmin};