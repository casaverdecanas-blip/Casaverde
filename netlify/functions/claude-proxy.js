// netlify/functions/claude-proxy.js
// v4 — CORS habilitado para llamadas cross-domain (.com.br → .netlify.app)

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event, context) {

    // Preflight CORS — el browser envía OPTIONS antes del POST real
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'Método no permitido.' })
        };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'GEMINI_API_KEY no configurada en Netlify.' })
        };
    }

    try {
        const incoming = JSON.parse(event.body);
        const message  = incoming.messages?.[0];

        if (!message) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS },
                body: JSON.stringify({ error: 'No se recibieron mensajes.' })
            };
        }

        const parts   = [];
        const content = message.content;

        if (typeof content === 'string') {
            parts.push({ text: content });

        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (part.type === 'text') {
                    parts.push({ text: part.text });

                } else if (part.type === 'document' && part.source?.type === 'base64') {
                    parts.push({
                        inlineData: {
                            mimeType: part.source.media_type || 'application/pdf',
                            data:     part.source.data
                        }
                    });

                } else if (part.type === 'image' && part.source?.type === 'base64') {
                    parts.push({
                        inlineData: {
                            mimeType: part.source.media_type || 'image/jpeg',
                            data:     part.source.data
                        }
                    });
                }
            }
        }

        if (parts.length === 0) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS },
                body: JSON.stringify({ error: 'No se pudieron extraer partes del mensaje.' })
            };
        }

        const geminiBody = {
            contents: [{ parts }],
            generationConfig: {
                temperature:     0,
                maxOutputTokens: 1500
            }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(geminiBody)
        });

        const googleData = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: { 'Content-Type': 'application/json', ...CORS },
                body: JSON.stringify({
                    error:   'Error de Gemini: ' + (googleData.error?.message || response.status),
                    details: googleData
                })
            };
        }

        const textoRespuesta = googleData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!textoRespuesta) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', ...CORS },
                body: JSON.stringify({ error: 'Gemini devolvió respuesta vacía.', details: googleData })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                id:      'gemini-' + Date.now(),
                type:    'message',
                role:    'assistant',
                model:   'gemini-1.5-flash',
                content: [{ type: 'text', text: textoRespuesta }]
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'Error interno: ' + error.message })
        };
    }
};
