// db.js
const path = require('path');
// Busca el archivo .env en la carpeta raíz (un nivel arriba de config)
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

// Usamos la variable DATABASE_URL del archivo .env
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    // ¡ESTO ES CRUCIAL PARA SUPABASE!
    ssl: {
        rejectUnauthorized: false, // Permite la conexión SSL sin certificado manual
    },
});

// Probamos la conexión
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error conectando a Supabase:', err.stack);
    }
    console.log('✅ Conectado exitosamente a Supabase (Nube)');
    release();
});

module.exports = pool;