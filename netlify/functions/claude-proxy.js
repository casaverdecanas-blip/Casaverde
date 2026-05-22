// netlify/functions/claude-proxy.js
//
// Proxy serverless adaptado para la API gratuita de Google Gemini (Google AI Studio).
// El browser no puede llamar a generativelanguage.googleapis.com directamente (CORS).
// Esta función corre en el servidor de Netlify y hace la llamada por el browser.
//
// Endpoint: /.netlify/functions/claude-proxy
// Método:   POST
// Body:     El mismo formato de mensajes que espera Gemini 1.5 Flash
//
// La API key se guarda como variable de entorno en GitHub/Netlify como: GEMINI_API_KEY

exports.handler = async function(event, context) {

    // Solo aceptar POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Método no permitido. Usar POST.' })
        };
    }

    // Verificar que la API key de Gemini esté configurada
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'GEMINI_API_KEY no configurada en el servidor.' })
        };
    }

    try {
        // Recibimos el cuerpo que envía el formulario
        const requestBody = JSON.parse(event.body);

        // URL oficial de Google AI Studio para el modelo gratuito Gemini 1.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        // Llamada a la API de Google desde el servidor
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Si Google devolvió un error, propagarlo con el mismo status
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

        // Retornar la respuesta exitosa de Gemini al formulario
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
            body: JSON.stringify({ error: 'Error interno en el proxy de Gemini: ' + error.message })
        };
    }
};
