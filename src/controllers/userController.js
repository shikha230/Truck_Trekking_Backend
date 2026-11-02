const { pool } = require('../config/db');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

// 1. Create User
const createUser = async (req, res) => {
    try {
        const { name, email, role, password } = req.body;
        
        // Agar password na ho toh check lagayein
        if (!password) {
            return res.status(400).json({ success: false, error: 'Password is required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (name, email, role, password, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id, name, email, role, is_active, created_at',
            [name, email, role, hashedPassword]
        );

        res.status(201).json({ 
            success: true, 
            message: 'User successfully created!', 
            user: result.rows[0] 
        });
    } catch (err) {
        console.error('Error creating user:', err);
        if (err.code === '23505') {
            return res.status(400).json({ success: false, error: 'Email already exists.' });
        }
        res.status(500).json({ success: false, error: 'Server error while creating user' });
    }
};

// 2. Get Users with Pagination & Search
const getUsersWithPagination = async (req, res) => {
    try {
        let { page = 1, limit = 5, search = '' } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let countQuery = 'SELECT COUNT(*) FROM users';
        let dataQuery = 'SELECT id, name, email, role, is_active, created_at FROM users';
        let queryParams = [];

        if (search && search.trim() !== '') {
            countQuery += ' WHERE name ILIKE $1 OR email ILIKE $1';
            dataQuery += ' WHERE name ILIKE $1 OR email ILIKE $1';
            queryParams.push(`%${search.trim()}%`);
        }

        const countResult = await pool.query(countQuery, queryParams);
        const totalUsers = parseInt(countResult.rows[0].count);

        dataQuery += ` ORDER BY id DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        const usersResult = await pool.query(dataQuery, queryParams);

        res.status(200).json({
            success: true,
            totalUsers,
            totalPages: Math.ceil(totalUsers / limit) || 1,
            currentPage: page,
            users: usersResult.rows
        });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. Send Credentials Email (English Messages & Cleaned App Password)
// 3. Send Credentials Email (English Messages & Cleaned App Password)
const sendCredentialsEmail = async (req, res) => {
    try {
        const { recipientEmail, userEmail, name, password } = req.body;

        // Fallback agar koi purana request format ho
        const targetEmail = recipientEmail || userEmail;
        const displayEmail = userEmail || recipientEmail;

        if (!targetEmail || !name || !password) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.MAIL_USER || "shikhajatav23march@gmail.com",
                pass: process.env.MAIL_PASS || "wedpymeeopbjyfpf",
            },
        });

        const mailOptions = {
            from: process.env.MAIL_USER || "shikhajatav23march@gmail.com",
            to: targetEmail, // Jiss ID par mail deliver karni hai (Popup wali email)
            subject: 'Your Login Credentials - Truck-Trak',
            text: `Hello ${name},\n\nYour account has been successfully created.\nEmail: ${displayEmail}\nPassword: ${password}\n\nYou can now log in to the system.`, // Yahan user ki asli database wali email print hogi
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: 'Email sent successfully!' });
    } catch (err) {
        console.error('Detailed Email Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
// 4. Toggle User Status (Activate / Deactivate)
const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        // Database me status update karein
        const result = await pool.query(
            'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, name, email, is_active',
            [is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const updatedUser = result.rows[0];

        // Nodemailer transporter configure karein
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.MAIL_USER || "shikhajatav23march@gmail.com",
                pass: process.env.MAIL_PASS || "wedpymeeopbjyfpf",
            },
        });

        // Email content status ke hisaab se change hoga
        const statusText = is_active ? 'activated' : 'deactivated';
        const mailOptions = {
            from: process.env.MAIL_USER || "shikhajatav23march@gmail.com",
            to: updatedUser.email,
            subject: `Your Truck-Trak Account has been ${statusText}`,
            text: `Hello ${updatedUser.name},\n\nYour account on Truck-Trak has been successfully ${statusText} by the administrator.\n\n${is_active ? 'You can now log in to your account.' : 'If you have any questions, please contact support.'}\n\nBest regards,\nTruck-Trak Team`,
        };

        // Email send karein
        await transporter.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: `User successfully ${statusText} and email notification sent!`,
            user: updatedUser
        });
    } catch (err) {
        console.error('Error updating user status or sending email:', err);
        res.status(500).json({ success: false, error: 'Server error while updating status' });
    }
};
// 5. Delete User
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'User deleted successfully!' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ success: false, error: 'Server error while deleting user' });
    }
};

module.exports = { 
    createUser, 
    getUsersWithPagination, 
    sendCredentialsEmail, 
    toggleUserStatus, 
    deleteUser 
};