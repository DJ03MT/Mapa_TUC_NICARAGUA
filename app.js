const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./config/db'); // Importamos tu conexión exitosa

const app = express();

// 1. Configuraciones
app.set('view engine', 'ejs'); // Usar EJS para el HTML
app.set('views', path.join(__dirname, 'views')); // Carpeta de vistas
app.use(express.static(path.join(__dirname, 'public'))); // Carpeta pública (CSS, JS, Img)
app.use(express.urlencoded({ extended: true })); // Para leer datos de formularios
app.use(express.json()); // Para leer JSON

// Configuración de sesión (Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi_secreto',
    resave: false,
    saveUninitialized: false
}));

// 2. Rutas
// A. Página de Inicio
app.get('/', async (req, res) => {
    try {
        // 1. Consultamos la lista de todas las rutas existentes
        // Solo necesitamos el código y el nombre para hacer los botones
        const listadoRutas = await pool.query('SELECT codigo_ruta, nombre_comercial FROM rutas ORDER BY codigo_ruta ASC');
        
        // 2. Le pasamos esa lista a la vista 'index'
        res.render('index', { 
            rutasDisponibles: listadoRutas.rows 
        });

    } catch (error) {
        console.error(error);
        res.send("Error cargando la página: " + error.message);
    }
});
app.get('/api/ruta/:codigo', async (req, res) => {
    const codigoRuta = req.params.codigo;
    
    try {
        const consulta = `
            -- 1. TRAER LOS CAMINOS (Líneas)
            SELECT 
                'ruta' as tipo,
                r.codigo_ruta as nombre,
                r.color_hex as color,
                v.sentido,
                ST_AsGeoJSON(v.trazado_geo) as geojson
            FROM rutas r
            JOIN variantes_ruta v ON r.ruta_id = v.ruta_id
            WHERE r.codigo_ruta = $1

            UNION ALL

            -- 2. TRAER LAS PARADAS (Puntos)
            SELECT 
                'parada' as tipo,
                p.nombre,
                '#000000' as color, -- Color negro para paradas (o el que quieras)
                v.sentido,
                ST_AsGeoJSON(p.ubicacion) as geojson
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
                tipo: fila.tipo,    // 'ruta' o 'parada'
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

// 3. Encender servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});