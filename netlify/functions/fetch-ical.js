// netlify/functions/fetch-ical.js
// Función serverless con caché para reducir consumo de créditos

const CACHE_DURATION = 3600; // 1 hora en segundos

exports.handler = async (event) => {
    // 1. Obtener URL del parámetro
    const url = event.queryStringParameters?.url;
    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }

    // 2. Verificar caché en el navegador (If-None-Match)
    const ifNoneMatch = event.headers['if-none-match'];
    
    try {
        // 3. Hacer fetch a Airbnb
        const response = await fetch(url);
        
        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Airbnb returned ${response.status}` })
            };
        }
        
        const icalText = await response.text();
        
        // 4. Generar ETag (hash simple del contenido)
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(icalText).digest('hex');
        const etag = `"${hash}"`;
        
        // 5. Si el cliente ya tiene la versión actual, devolver 304
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
        
        // 6. Devolver el contenido con cabeceras de caché
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