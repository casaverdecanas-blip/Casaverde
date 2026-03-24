// netlify/functions/fetch-ical.js
// Valida el token de sesión contra Firebase antes de procesar

const CACHE_DURATION = 3600; // 1 hora

const firebaseConfig = {
    apiKey: "AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4",
    authDomain: "casaverdecanas-199.firebaseapp.com",
    databaseURL: "https://casaverdecanas-199-default-rtdb.firebaseio.com",
    projectId: "casaverdecanas-199",
    storageBucket: "casaverdecanas-199.firebasestorage.app",
    messagingSenderId: "417825635316",
    appId: "1:417825635316:web:ff7f4fe52edcab43d8d7a1"
};

const firebase = require('firebase/app');
require('firebase/database');

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Caché de sesiones válidas (5 minutos)
const sessionCache = new Map();

async function isValidSession(sessionToken) {
    if (!sessionToken || !sessionToken.startsWith('sess_')) {
        return false;
    }
    
    // Verificar caché
    if (sessionCache.has(sessionToken)) {
        const cached = sessionCache.get(sessionToken);
        if (cached.expiresAt > Date.now()) {
            return true;
        } else {
            sessionCache.delete(sessionToken);
        }
    }
    
    try {
        const snapshot = await db.ref(`activeSessions/${sessionToken}`).once('value');
        const session = snapshot.val();
        
        if (!session || !session.isValid) {
            return false;
        }
        
        if (Date.now() > session.expiresAt) {
            await db.ref(`activeSessions/${sessionToken}`).remove();
            return false;
        }
        
        // Guardar en caché por 5 minutos
        sessionCache.set(sessionToken, {
            expiresAt: Date.now() + 5 * 60 * 1000
        });
        
        return true;
        
    } catch (error) {
        console.error('Error validando sesión:', error);
        return false;
    }
}

exports.handler = async (event) => {
    // ============================================
    // 1. VERIFICAR TOKEN DE SESIÓN
    // ============================================
    const sessionToken = event.headers['x-session-token'];
    
    const valid = await isValidSession(sessionToken);
    if (!valid) {
        console.warn(`🔒 Acceso denegado - Sesión inválida. IP: ${event.headers['client-ip'] || 'desconocida'}`);
        return {
            statusCode: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: 'Unauthorized. Sesión inválida o expirada.',
                code: 'INVALID_SESSION'
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
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }
    
    // Validar que la URL sea de Airbnb (seguridad adicional)
    if (!url.includes('airbnb.com')) {
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
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
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