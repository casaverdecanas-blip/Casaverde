// netlify/functions/fetch-ical.js

const CACHE_DURATION = 3600; // 1 hora en segundos
const SECRET_TOKEN = 'CasaVerde2026SecureToken'; // ← MISMO TOKEN QUE EN calendario-interno.html

exports.handler = async (event) => {
    // Verificar token
    const token = event.queryStringParameters?.key || event.queryStringParameters?.token;
    
    if (token !== SECRET_TOKEN) {
        console.warn(`🔒 Acceso denegado - Token inválido. IP: ${event.headers['client-ip'] || 'desconocida'}`);
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Unauthorized. Token inválido o faltante.' })
        };
    }
    
    const url = event.queryStringParameters?.url;
    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }
    
    // Validar que la URL sea de Airbnb (seguridad adicional)
    if (!url.includes('airbnb.com')) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'URL no permitida' })
        };
    }
    
    const ifNoneMatch = event.headers['if-none-match'];
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Airbnb returned ${response.status}` })
            };
        }
        
        const icalText = await response.text();
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
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};