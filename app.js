const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('./config/db');

const app = express();

// --- CONFIGURACIONES ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- SESIÓN SEGURA EN BASE DE DATOS ---
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session' // Asegúrate de haber creado esta tabla en Supabase
    }),
    secret: process.env.SESSION_SECRET || 'secreto_tuc_nicaragua',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 días
}));

// Middleware para pasar el usuario a todas las vistas
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario || null;
    next();
});

// --- RUTAS DE AUTENTICACIÓN ---

// Registro
app.get('/registro', (req, res) => res.render('registro'));

app.post('/registro', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await pool.query(
            'INSERT INTO usuarios (nombre_completo, email, password_hash) VALUES ($1, $2, $3)',
            [nombre, email, hash]
        );
        res.redirect('/login');
    } catch (error) {
        console.error(error);
        res.render('registro', { error: 'Error: El correo ya existe o datos inválidos.' });
    }
});

// Login
app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (resultado.rows.length > 0) {
            const user = resultado.rows[0];
            const valida = await bcrypt.compare(password, user.password_hash); // Comparar hash
            
            if (valida) {
                req.session.usuario = { id: user.usuario_id, nombre: user.nombre_completo };
                return res.redirect('/');
            }
        }
        res.render('login', { error: 'Credenciales incorrectas' });
    } catch (error) {
        console.error(error);
        res.send("Error de servidor");
    }
});

// Cerrar Sesión
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// --- RUTAS DEL MAPA ---

app.get('/', async (req, res) => {
    try {
        // 1. Cargar todas las rutas
        const listadoRutas = await pool.query('SELECT codigo_ruta, nombre_comercial FROM rutas ORDER BY codigo_ruta ASC');
        
        // 2. Cargar favoritos SOLO si hay usuario logueado
        let misFavoritos = [];
        if (req.session.usuario) {
            const favs = await pool.query(
                'SELECT codigo_ruta FROM rutas_favoritas WHERE usuario_id = $1',
                [req.session.usuario.id]
            );
            // Convertimos a un array simple: ['104', '110']
            misFavoritos = favs.rows.map(row => row.codigo_ruta);
        }

        res.render('index', { 
            rutasDisponibles: listadoRutas.rows,
            misFavoritos: misFavoritos 
        });

    } catch (error) {
        console.error(error);
        res.send("Error: " + error.message);
    }
});

app.get('/api/ruta/:codigo', async (req, res) => {
    const codigoRuta = req.params.codigo;
    try {
        const consulta = `
            SELECT 'ruta' as tipo, r.codigo_ruta as nombre, r.color_hex as color, v.sentido, ST_AsGeoJSON(v.trazado_geo) as geojson
            FROM rutas r JOIN variantes_ruta v ON r.ruta_id = v.ruta_id WHERE r.codigo_ruta = $1
            UNION ALL
            SELECT 'parada' as tipo, p.nombre, '#000000' as color, v.sentido, ST_AsGeoJSON(p.ubicacion) as geojson
            FROM paradas p 
            JOIN parada_por_variante pv ON p.parada_id = pv.parada_id
            JOIN variantes_ruta v ON pv.variante_id = v.variante_id
            JOIN rutas r ON v.ruta_id = r.ruta_id
            WHERE r.codigo_ruta = $1
        `;
        
        const respuesta = await pool.query(consulta, [codigoRuta]);
        const features = respuesta.rows.map(fila => ({
            type: "Feature",
            properties: { 
                tipo: fila.tipo,
                nombre: fila.nombre, 
                color: fila.color,
                sentido: fila.sentido
            },
            geometry: JSON.parse(fila.geojson)
        }));

        res.json({ type: "FeatureCollection", features: features });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno" });
    }
});
// API: Guardar o Quitar Favorito (Toggle)
app.post('/api/favorito', async (req, res) => {
    if (!req.session.usuario) return res.status(401).json({error: "No logueado"});
    
    const { codigo_ruta } = req.body;
    const usuario_id = req.session.usuario.id;

    try {
        // 1. Verificamos si ya existe
        const existe = await pool.query(
            "SELECT * FROM rutas_favoritas WHERE usuario_id = $1 AND codigo_ruta = $2",
            [usuario_id, codigo_ruta]
        );

        if (existe.rows.length > 0) {
            // SI EXISTE -> LO BORRAMOS (Quitar de favoritos)
            await pool.query(
                "DELETE FROM rutas_favoritas WHERE usuario_id = $1 AND codigo_ruta = $2",
                [usuario_id, codigo_ruta]
            );
            res.json({ estado: "eliminado" });
        } else {
            // NO EXISTE -> LO GUARDAMOS (Agregar a favoritos)
            await pool.query(
                "INSERT INTO rutas_favoritas (usuario_id, codigo_ruta) VALUES ($1, $2)",
                [usuario_id, codigo_ruta]
            );
            res.json({ estado: "agregado" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Error servidor"});
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});