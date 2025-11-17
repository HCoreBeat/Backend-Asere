const express = require("express");
const fs = require("fs");
const cors = require("cors");
const lockfile = require("proper-lockfile");
const moment = require("moment-timezone");
const fetch = require("node-fetch");
exports.fetch = fetch;

const app = express();
exports.app = app;

// Servir archivos estáticos desde la carpeta public
app.use(express.static('public'));

// Array para almacenar los logs del servidor
const serverLogs = [];

// Variable para almacenar la fecha de inicio del servidor
const serverStartTime = moment().tz("America/Havana");

// Función para añadir logs y mantener un tamaño limitado
function addLog(message) {
    const timestamp = moment().tz("America/Havana").format("YYYY-MM-DD HH:mm:ss");
    serverLogs.push(`[${timestamp}] ${message}`);
    // Mantener solo los últimos 100 logs para evitar sobrecargar la memoria
    if (serverLogs.length > 100) {
        serverLogs.shift(); // Eliminar el log más antiguo
    }
}

// Configuración de CORS
const allowedOrigins = [
    "https://www.asereshops.com",
    "https://hcorebeat.github.io",
    "https://analytics-asere.onrender.com",
    "https://servidor-estadisticas.onrender.com",
    "http://127.0.0.1:5500",
    "http://localhost:10000",
    "http://localhost:5500"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("No permitido por CORS"));
        }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

// Middleware para procesar JSON
app.use(express.json());

// Configuración de rutas y archivos
const path = require('path');
const directoryPath = path.join(__dirname, "data");
const filePath = path.join(directoryPath, "estadistica.json");

// Función para asegurar que el archivo de estadísticas existe
async function ensureStatisticsFile() {
    try {
        // Crear directorio si no existe
        if (!fs.existsSync(directoryPath)) {
            await fs.promises.mkdir(directoryPath, { recursive: true });
            addLog(`Directorio creado: ${directoryPath}`);
        }

        // Crear archivo si no existe
        if (!fs.existsSync(filePath)) {
            await fs.promises.writeFile(filePath, JSON.stringify([], null, 2), 'utf8');
            addLog(`Archivo creado: ${filePath}`);
        }
    } catch (error) {
        addLog(`ERROR: No se pudo crear el archivo de estadísticas: ${error.message}`);
        throw error;
    }
}

// Inicializar archivo de estadísticas al arrancar
ensureStatisticsFile().catch(error => {
    console.error('Error al inicializar archivo de estadísticas:', error);
});


// Función para sanear JSON malformado
function sanitizeJSON(data) {
    try {
        return JSON.parse(data);
    } catch (error) {
        addLog(`WARN: El archivo JSON está malformado. Intentando corregirlo... Error: ${error.message}`);
        const sanitizedData = data
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "")
            .replace(/\\t/g, "")
            .replace(/\\r/g, "");
        try {
            return JSON.parse(sanitizedData);
        } catch (finalError) {
            addLog(`ERROR: No se pudo corregir el JSON malformado: ${finalError.message}`);
            return [];
        }
    }
}

// Middleware para registro de solicitudes
app.use((req, res, next) => {
    addLog(`Solicitud: ${req.method} ${req.path}`);
    next();
});

// Ruta para guardar estadísticas
app.post("/guardar-estadistica", async (req, res) => {
    let release; // Declare release outside try to ensure it's accessible in finally
    try {
        const nuevaEstadistica = req.body;
        addLog(`Recibida nueva estadística: ${JSON.stringify(nuevaEstadistica)}`);

        if (!nuevaEstadistica.ip || !nuevaEstadistica.pais || !nuevaEstadistica.origen) {
            addLog("ERROR: Faltan campos obligatorios en la estadística.");
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        release = await lockfile.lock(filePath); // Assign release here
        addLog(`Archivo bloqueado: ${filePath}`);

        fs.readFile(filePath, "utf8", (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    fs.writeFileSync(filePath, JSON.stringify([]));
                    data = '[]';
                    addLog(`Archivo no encontrado, inicializando: ${filePath}`);
                } else {
                    addLog(`ERROR: Error leyendo el archivo: ${err.message}`);
                    if (release) release(); // Ensure unlock on error
                    return res.status(500).json({ error: "Error leyendo el archivo" });
                }
            }

            const estadisticas = data ? sanitizeJSON(data) : [];
            const usuarioExistente = estadisticas.find(est => est.ip === nuevaEstadistica.ip);

            const fechaHoraCuba = moment().tz("America/Havana").format("YYYY-MM-DD HH:mm:ss");

            estadisticas.push({
                ip: nuevaEstadistica.ip,
                pais: nuevaEstadistica.pais,
                fecha_hora_entrada: fechaHoraCuba,
                origen: nuevaEstadistica.origen,
                afiliado: nuevaEstadistica.afiliado || "Ninguno",
                duracion_sesion_segundos: nuevaEstadistica.duracion_sesion_segundos || 0,
                tiempo_carga_pagina_ms: nuevaEstadistica.tiempo_carga_pagina_ms || 0,
                nombre_comprador: nuevaEstadistica.nombre_comprador || "N/A",
                telefono_comprador: nuevaEstadistica.telefono_comprador || "N/A",
                correo_comprador: nuevaEstadistica.correo_comprador || "N/A",
                direccion_envio: nuevaEstadistica.direccion_envio || "N/A",
                compras: nuevaEstadistica.compras || [],
                precio_compra_total: nuevaEstadistica.precio_compra_total || 0,
                navegador: nuevaEstadistica.navegador || "Desconocido",
                sistema_operativo: nuevaEstadistica.sistema_operativo || "Desconocido",
                tipo_usuario: usuarioExistente ? "Recurrente" : "Único",
                tiempo_promedio_pagina: nuevaEstadistica.tiempo_promedio_pagina || 0,
                fuente_trafico: nuevaEstadistica.fuente_trafico || "Desconocido",
            });

            fs.writeFile(filePath, JSON.stringify(estadisticas, null, 2), (err) => {
                if (err) {
                    addLog(`ERROR: Error guardando el archivo: ${err.message}`);
                    if (release) release(); // Ensure unlock on error
                    return res.status(500).json({ error: "Error guardando el archivo" });
                }
                addLog("Estadística guardada correctamente.");
                if (release) release(); // Unlock on success
                res.json({ message: "Estadística guardada correctamente" });
            });
        });
    } catch (error) {
        addLog(`ERROR: Error en /guardar-estadistica: ${error.message}`);
        if (release) release(); // Ensure unlock on error
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// Ruta para obtener estadísticas
app.get("/obtener-estadisticas", async (req, res) => {
    let release; // Declare release outside try
    try {
        addLog("Solicitud para obtener estadísticas.");
        release = await lockfile.lock(filePath); // Assign release here
        addLog(`Archivo bloqueado para lectura: ${filePath}`);

        fs.readFile(filePath, "utf8", (err, data) => {
            if (err && err.code !== "ENOENT") {
                addLog(`ERROR: Error leyendo el archivo de estadísticas: ${err.message}`);
                if (release) release(); // Ensure unlock on error
                return res.status(500).json({ error: "Error leyendo el archivo" });
            }

            const estadisticas = data ? sanitizeJSON(data) : [];
            addLog(`Estadísticas enviadas: ${estadisticas.length} registros.`);
            if (release) release(); // Unlock on success
            res.json(estadisticas);
        });
    } catch (error) {
        addLog(`ERROR: Error en /obtener-estadisticas: ${error.message}`);
        if (release) release(); // Ensure unlock on error
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ** IMPORTANTE: REEMPLAZA ESTA URL CON LA URL DE TU APLICACIÓN WEB DE APPS SCRIPT **
// Esta es la URL que obtuviste al publicar tu script de Google Apps Script como Web App.
const GOOGLE_APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxXxXxXxXxXxXxXxXxXxXxXxXxXxXx/exec";

// Ruta POST para recibir los datos del pedido desde el frontend
app.post('/send-pedido', async (req, res) => {
    console.log('📦 Recibida solicitud de pedido desde el frontend.');
    const orderData = req.body; // Los datos del pedido vienen en el cuerpo de la solicitud

    if (!orderData) {
        console.error('Error: Datos de pedido vacíos.');
        return res.status(400).json({ success: false, message: 'Datos de pedido no proporcionados.' });
    }

    try {
        // Enviar los datos del pedido a la aplicación web de Google Apps Script
        console.log('Enviando datos a Google Apps Script...');
        const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData), // Envía los datos del pedido como JSON
        });

        let gasResponseText = await response.text(); // Consume the body once as text
        let gasResponse;

        try {
            gasResponse = JSON.parse(gasResponseText); // Try to parse the text as JSON
        } catch (jsonParseError) {
            console.warn('La respuesta de Google Apps Script no fue JSON o es inválida:', gasResponseText);
            gasResponse = { status: "error", message: "Respuesta de Apps Script no JSON", rawResponse: gasResponseText };
        }

        console.log('Respuesta de Google Apps Script:', gasResponse);

        // Ejecutar la función local para actualizar la comparación
        try {
            await compareLocalAndRemoteData();
            console.log('Comparación de pedidos actualizada tras nuevo pedido.');
        } catch (updateError) {
            console.error('Error al actualizar comparación tras pedido:', updateError);
        }

        // Comprobar si la solicitud a Apps Script fue exitosa
        if (response.ok && gasResponse.status === "success") {
            res.status(200).json({
                success: true,
                message: 'Pedido enviado a Google Apps Script correctamente.',
                gasResponse: gasResponse
            });
        } else {
            console.error('Error al enviar a Google Apps Script:', response.status, gasResponse);
            res.status(response.status || 500).json({ // Use response.status or default to 500
                success: false,
                message: `Error al enviar el pedido a Google Apps Script: ${gasResponse.message || response.statusText || 'Error desconocido'}`,
                gasResponse: gasResponse
            });
        }

    } catch (error) {
        console.error('❌ Error en el backend al procesar el pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al procesar el pedido.',
            error: error.message
        });
    }
});

// Nueva ruta API para obtener el estado del servidor
app.get("/api/server-status", (req, res) => {
    addLog("Solicitud de estado del servidor recibida");
    res.json({
        status: "running",
        startTime: serverStartTime.toISOString(),
        logs: serverLogs
    });
});

// Modificar la función para guardar automáticamente en comparison.json
async function compareLocalAndRemoteData() {
    const remoteUrl = "https://raw.githubusercontent.com/HCoreBeat/Analytics-Asere/refs/heads/main/Json/estadistica.json";
    const comparisonFilePath = path.join(directoryPath, "comparison.json");
    let newOrders = [];
    let release;

    try {
        // Leer datos locales
        const localData = JSON.parse(await fs.promises.readFile(filePath, "utf8"));

        // Obtener datos remotos
        const response = await fetch(remoteUrl);
        if (!response.ok) {
            throw new Error(`Error al obtener datos remotos: ${response.statusText}`);
        }
        const remoteData = await response.json();

        // Filtrar pedidos nuevos
        newOrders = localData.filter(localItem => {
            const isOrder = Array.isArray(localItem.compras) && localItem.compras.length > 0;
            if (!isOrder) return false;

            return !remoteData.some(remoteItem => (
                Array.isArray(remoteItem.compras) && remoteItem.compras.length > 0 &&
                remoteItem.ip === localItem.ip &&
                remoteItem.fecha_hora_entrada === localItem.fecha_hora_entrada
            ));
        });

        addLog(`Pedidos nuevos encontrados: ${newOrders.length}`);

        // Guardar los nuevos pedidos en comparison.json
        release = await lockfile.lock(comparisonFilePath);
        addLog(`Archivo comparison.json bloqueado para escritura: ${comparisonFilePath}`);

        await fs.promises.writeFile(
            comparisonFilePath,
            JSON.stringify(newOrders, null, 2),
            "utf8"
        );
        addLog(`Datos de comparación guardados en: ${comparisonFilePath}`);

        return newOrders;
    } catch (error) {
        addLog(`ERROR: No se pudo comparar datos locales y remotos: ${error.message}`);
        throw error;
    } finally {
        if (release) release(); // Liberar el bloqueo del archivo
    }
}

// Ruta para actualizar la comparación de datos y guardar en comparison.json
app.post("/api/update-comparison", async (req, res) => {
    const comparisonFilePath = path.join(directoryPath, "comparison.json");
    let release;

    try {
        const newOrders = await compareLocalAndRemoteData();

        // Bloquear el archivo comparison.json
        release = await lockfile.lock(comparisonFilePath);
        addLog(`Archivo bloqueado para escritura: ${comparisonFilePath}`);

        // Guardar los nuevos pedidos en comparison.json
        await fs.promises.writeFile(
            comparisonFilePath,
            JSON.stringify(newOrders, null, 2),
            "utf8"
        );
        addLog(`Datos de comparación guardados en: ${comparisonFilePath}`);

        // Responder con los nuevos pedidos
        res.json({ success: true, newOrders });
    } catch (error) {
        addLog(`ERROR: No se pudo actualizar la comparación: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (release) release(); // Liberar el bloqueo del archivo
    }
});

// Nueva ruta para limpiar estadísticas usando promesas
app.post("/api/clear-statistics", async (req, res) => {
    try {
        addLog("Solicitud para limpiar estadísticas recibida");

        // Asegurar que el directorio existe
        if (!fs.existsSync(directoryPath)) {
            addLog("Directorio no encontrado. Creando directorio...");
            await fs.promises.mkdir(directoryPath, { recursive: true });
            addLog(`Directorio creado: ${directoryPath}`);
        }

        // Intentar borrar el archivo si existe
        if (fs.existsSync(filePath)) {
            addLog("Archivo de estadísticas encontrado. Eliminando archivo...");
            await fs.promises.unlink(filePath);
            addLog("Archivo de estadísticas eliminado");
        } else {
            addLog("Archivo de estadísticas no encontrado. Se creará uno nuevo.");
        }

        // Crear nuevo archivo con array vacío
        addLog("Creando nuevo archivo de estadísticas...");
        await fs.promises.writeFile(filePath, "[]", { 
            encoding: 'utf8',
            mode: 0o666 // Permisos de lectura y escritura para todos
        });
        addLog("Nuevo archivo de estadísticas creado correctamente");

        // Comparar datos locales y remotos después de limpiar estadísticas
        const newOrders = await compareLocalAndRemoteData();

        res.json({ 
            success: true, 
            message: "Estadísticas limpiadas correctamente", 
            newOrders 
        });

    } catch (error) {
        const errorMessage = `Error al limpiar estadísticas: ${error.message}`;
        addLog(`ERROR: ${errorMessage}`);
        console.error(errorMessage);
        res.status(500).json({ 
            success: false, 
            error: errorMessage 
        });
    }
});

// Ruta para obtener los datos actuales de comparison.json
app.get("/api/get-comparison", async (req, res) => {
    const comparisonFilePath = path.join(directoryPath, "comparison.json");

    try {
        // Leer los datos de comparison.json
        const data = await fs.promises.readFile(comparisonFilePath, "utf8");
        const comparisonData = JSON.parse(data);

        res.json({ success: true, comparisonData });
    } catch (error) {
        addLog(`ERROR: No se pudo leer comparison.json: ${error.message}`);
        res.status(500).json({ success: false, error: "Error al obtener los datos de comparación" });
    }
});

// Endpoint para obtener los pedidos nuevos desde comparison.json
app.get('/api/new-orders', async (req, res) => {
    const comparisonFilePath = path.join(directoryPath, "comparison.json");
    try {
        if (!fs.existsSync(comparisonFilePath)) {
            return res.json({ success: true, newOrders: [] });
        }
        const data = await fs.promises.readFile(comparisonFilePath, 'utf8');
        const newOrders = JSON.parse(data);
        res.json({ success: true, newOrders });
    } catch (error) {
        console.error('Error al leer comparison.json:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Modificar la ruta principal para verificar pedidos nuevos al cargar la página
app.get("/", async (req, res) => {
    addLog("Página principal solicitada");

    try {
        // Verificar si hay pedidos nuevos
        const newOrders = await compareLocalAndRemoteData();

        // Si hay nuevos pedidos, guardar estadísticas y mostrar el botón
        if (newOrders.length > 0) {
            addLog(`Se encontraron ${newOrders.length} nuevos pedidos al cargar la página.`);

            // Guardar estadísticas de los nuevos pedidos
            const estadisticas = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
            newOrders.forEach(order => {
                estadisticas.push(order);
            });
            await fs.promises.writeFile(filePath, JSON.stringify(estadisticas, null, 2), "utf8");
            addLog("Estadísticas de nuevos pedidos guardadas correctamente.");
        }

        // Enviar el archivo HTML con información sobre nuevos pedidos
        res.sendFile(__dirname + '/public/index.html', {
            headers: {
                'X-New-Orders': newOrders.length > 0 ? 'true' : 'false'
            }
        });
    } catch (error) {
        addLog(`ERROR: No se pudo verificar pedidos nuevos al cargar la página: ${error.message}`);
        res.status(500).send("Error interno del servidor");
    }
});

// Manejo de errores
app.use((err, req, res, next) => {
    addLog(`ERROR GLOBAL: ${err.message}`);
    console.error("Error global:", err);
    res.status(500).json({ error: "Error interno del servidor" });
});

// Puerto de escucha
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    addLog(`Servidor corriendo en el puerto ${PORT}`);
    addLog(`Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});

// Verificar nuevos pedidos cada 30 segundos
setInterval(async () => {
    try {
        const newOrders = await compareLocalAndRemoteData();

        if (newOrders.length > 0) {
            addLog(`Se encontraron ${newOrders.length} nuevos pedidos en la verificación periódica.`);
        } else {
            addLog("No se encontraron nuevos pedidos en la verificación periódica.");
        }
    } catch (error) {
        addLog(`ERROR: Error en la verificación periódica de nuevos pedidos: ${error.message}`);
    }
}, 30000); // 30 segundos
