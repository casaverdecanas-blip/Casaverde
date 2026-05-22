// netlify/functions/claude-proxy.js
//
// Proxy serverless para llamadas a la API de Anthropic.
// El browser no puede llamar a api.anthropic.com directamente (CORS).
// Esta función corre en el servidor de Netlify y hace la llamada por el browser.
//
// Endpoint: /.netlify/functions/claude-proxy
// Método:   POST
// Body:     El mismo body que iría a /v1/messages de Anthropic
//
// La API key se guarda como variable de entorno en Netlify:
// ANTHROPIC_API_KEY → Settings → Environment variables

exports.handler = async function(event, context) {

    // Solo aceptar POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Método no permitido. Usar POST.' })
        };
    }

    // Verificar que la API key esté configurada
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en Netlify.' })
        };
    }

    try {
        const requestBody = JSON.parse(event.body);

        // Llamada a la API de Anthropic desde el servidor
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type':      'application/json',
                'x-api-key':         apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Si Anthropic devolvió error, propagarlo con el mismo status
        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: {
                    'Content-Type':                'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify(data)
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Error interno: ' + error.message })
        };
    }
};
