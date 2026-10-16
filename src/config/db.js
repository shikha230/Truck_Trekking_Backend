const { Pool } = require('pg');

// Is pool ka use hum data likhne aur dashboard ke liye karenge
const pool = new Pool({
    host: '200.141.13.127',
    user: 'traccar',
    password: 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
    database: 'truck_monitoring',
    port: 5432,
});

// Traccar ka original database (sirf reading ke liye)
const traccarPool = new Pool({
    host: '200.141.13.127',
    user: 'traccar',
    password: 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
    database: 'traccar',
    port: 5432,
});

// Server run hote hi Tables banane aur default admin save karne ka function
const initializeAdmin = async () => {
    try {
        
        // 1. Admins table create karein agar database me nahi hai
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Users table create karein agar database me nahi hai (Naya add kiya gaya hai)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Check karein ki default admin pehle se database me hai ya nahi
        const checkAdmin = await pool.query('SELECT * FROM admins WHERE email = $1', ['admin@trucktrak.com']);
        console.log('checkAdmincheckAdmincheckAdmin', checkAdmin);
        
        if (checkAdmin.rows.length === 0) {
            // 4. Agar nahi hai, toh automatic insert kar do
            await pool.query(
                'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)',
                ['Super Admin', 'admin@trucktrak.com', 'admin123']
            );
            console.log('✅ Default Admin account automatically created in database!');
        } else {
            console.log('ℹ️ Admin account already exists in database.');
        }

        console.log('✅ Users table checked/created successfully!');
    } catch (err) {
        console.error('❌ Error initializing tables:', err);
    }
};

// Jaise hi server start hoga aur db file require hogi, ye function chal padega
initializeAdmin();

module.exports = { pool, traccarPool };