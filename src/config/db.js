// const { Pool } = require('pg');

// // Is pool ka use hum data likhne aur dashboard ke liye karenge
// const pool = new Pool({
// host: process.env.DB_HOST || 'localhost', // ya VPS IP agar remote connect karna hai    user: 'traccar',
//     password: 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
//     database: 'truck_monitoring',
//     port: 5432,
// });

// // Traccar ka original database (sirf reading ke liye)
// const traccarPool = new Pool({
// host: process.env.DB_HOST || 'localhost', // ya VPS IP agar remote connect karna hai    user: 'traccar',
//     password: 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
//     database: 'traccar',
//     port: 5432,
// });

// // Server run hote hi Tables banane aur default admin save karne ka function
// const initializeAdmin = async () => {
//     try {
        
//         // 1. Admins table create karein agar database me nahi hai
//         await pool.query(`
//             CREATE TABLE IF NOT EXISTS admins (
//                 id SERIAL PRIMARY KEY,
//                 name VARCHAR(100),
//                 email VARCHAR(100) UNIQUE NOT NULL,
//                 password VARCHAR(255) NOT NULL,
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         // 2. Users table create karein agar database me nahi hai (Naya add kiya gaya hai)
//         await pool.query(`
//             CREATE TABLE IF NOT EXISTS users (
//                 id SERIAL PRIMARY KEY,
//                 name VARCHAR(100) NOT NULL,
//                 email VARCHAR(150) UNIQUE NOT NULL,
//                 password VARCHAR(255) NOT NULL,
//                 role VARCHAR(50) DEFAULT 'user',
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         // 3. Check karein ki default admin pehle se database me hai ya nahi
//         const checkAdmin = await pool.query('SELECT * FROM admins WHERE email = $1', ['admin@trucktrak.com']);
//         console.log('checkAdmincheckAdmincheckAdmin', checkAdmin);
        
//         if (checkAdmin.rows.length === 0) {
//             // 4. Agar nahi hai, toh automatic insert kar do
//             await pool.query(
//                 'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)',
//                 ['Super Admin', 'admin@trucktrak.com', 'admin123']
//             );
//             console.log('✅ Default Admin account automatically created in database!');
//         } else {
//             console.log('ℹ️ Admin account already exists in database.');
//         }

//         console.log('✅ Users table checked/created successfully!');
//     } catch (err) {
//         console.error('❌ Error initializing tables:', err);
//     }
// };

// // Jaise hi server start hoga aur db file require hogi, ye function chal padega
// initializeAdmin();

// module.exports = { pool, traccarPool };

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || '200.141.13.127',
    user: process.env.DB_USER || 'traccar',
    password: process.env.DB_PASSWORD || 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
    database: process.env.DB_NAME_APP || 'traccar',
    port: process.env.DB_PORT || 5433,
});

const traccarPool = new Pool({
    host: process.env.DB_HOST || '200.141.13.127',
    user: process.env.DB_USER || 'traccar',
    password: process.env.DB_PASSWORD || 'Ob6bkmqbpQa4aARnrIIUEovVsBBFLHDr',
    database: process.env.DB_NAME_TRACCAR || 'traccar',
    port: process.env.DB_PORT || 5433,
});

const initializeDatabase = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'user', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS vehicles (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, traccar_id INT UNIQUE, type VARCHAR(50) DEFAULT 'truck', imei VARCHAR(100), status VARCHAR(50) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';`);

        await pool.query(`CREATE TABLE IF NOT EXISTS vehicle_status (id SERIAL PRIMARY KEY, vehicle_id INT, current_state VARCHAR(100), latitude NUMERIC, longitude NUMERIC, speed NUMERIC, ignition BOOLEAN, odometer NUMERIC, last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await pool.query(`ALTER TABLE vehicle_status ADD COLUMN IF NOT EXISTS latitude NUMERIC;`);
        await pool.query(`ALTER TABLE vehicle_status ADD COLUMN IF NOT EXISTS longitude NUMERIC;`);
        await pool.query(`ALTER TABLE vehicle_status ADD COLUMN IF NOT EXISTS speed NUMERIC;`);

        await pool.query(`CREATE TABLE IF NOT EXISTS trips (id SERIAL PRIMARY KEY, vehicle_id INT, status VARCHAR(50) DEFAULT 'ongoing', start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, end_time TIMESTAMP);`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS geofences (id SERIAL PRIMARY KEY, name VARCHAR(100), type VARCHAR(50), latitude NUMERIC, longitude NUMERIC, radius NUMERIC, area TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS event_logs (id SERIAL PRIMARY KEY, vehicle_id INT, event_type VARCHAR(100), details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await pool.query(`ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS vehicle_id INT;`);
        await pool.query(`ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS details TEXT;`);

        const checkAdmin = await pool.query('SELECT * FROM admins WHERE email = $1', ['admin@trucktrak.com']);
        if (checkAdmin.rows.length === 0) {
            await pool.query(
                'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)',
                ['Super Admin', 'admin@trucktrak.com', 'admin123']
            );
            console.log('✅ Default Admin account created successfully!');
        }

        console.log('✅ Local database connection & tables verified successfully!');
    } catch (err) {
        console.error('❌ Database initialization error:', err);
    }
};

initializeDatabase();

module.exports = { pool, traccarPool };