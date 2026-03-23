// netlify/functions/fetch-ical.js
// Con protección por token secreto para evitar bots

const CACHE_DURATION = 3600; // 1 hora en segundos

// ⚠️ IMPORTANTE: CAMBIA ESTE TOKEN POR UNO SEGURO
// Usa una combinación de letras, números y símbolos
// Ejemplo: 'X7k9mP2qR5tW8zL4nB1vC3xJ6yH9'
const SECRET_TOKEN = 'CasaVerde2026SecureToken';

exports.handler = async (event) => {
    // ============================================
    // 1. VERIFICACIÓN DE TOKEN (PROTECCIÓN CONTRA BOTS)
    // ============================================
    const token = event.queryStringParameters?.key || event.queryStringParameters?.token;
    
    if (token !== SECRET_TOKEN) {
        console.warn(`🔒 Acceso denegado - Token inválido o faltante. IP: ${event.headers['client-ip'] || 'desconocida'}`);
        return {
            statusCode: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: 'Unauthorized. Acceso no autorizado.',
                message: 'Se requiere un token válido para acceder a este recurso.'
            })
        };
    }
    
    // ============================================
    // 2. OBTENER URL DEL PARÁMETRO
    // ============================================
    const url = event.queryStringParameters?.url;
    if (!url) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }
    
    // Validar que la URL sea de Airbnb (seguridad adicional)
    if (!url.includes('airbnb.com') && !url.includes('calendar.google.com')) {
        console.warn(`🔒 Intento de acceso a URL no permitida: ${url}`);
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'URL no permitida' })
        };
    }
    
    // ============================================
    // 3. VERIFICAR CACHÉ DEL NAVEGADOR
    // ============================================
    const ifNoneMatch = event.headers['if-none-match'];
    
    try {
        // ============================================
        // 4. HACER FETCH A AIRBNB
        // ============================================
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout 10 segundos
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.error(`Error en fetch: ${response.status} para URL: ${url}`);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Airbnb returned ${response.status}` })
            };
        }
        
        const icalText = await response.text();
        
        // ============================================
        // 5. GENERAR ETAG PARA CACHÉ
        // ============================================
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(icalText).digest('hex');
        const etag = `"${hash}"`;
        
        // Si el cliente ya tiene la versión actual, devolver 304
        if (ifNoneMatch === etag) {
            return {
                statusCode: 304,
                headers: {
                    'Cache-Control': `public, max-age=${CACHE_DURATION}`,
                    'ETag': etag
                },
                body: ''
            };
        }
        
        // ============================================
        // 6. DEVOLVER RESPUESTA CON CACHÉ
        // ============================================
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Cache-Control': `public, max-age=${CACHE_DURATION}`,
                'ETag': etag,
                'Access-Control-Allow-Origin': '*'
            },
            body: icalText
        };
        
    } catch (error) {
        console.error('Error fetching iCal:', error);
        
        // Manejar timeout específicamente
        if (error.name === 'AbortError') {
            return {
                statusCode: 504,
                body: JSON.stringify({ error: 'Timeout al obtener el calendario' })
            };
        }
        
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};