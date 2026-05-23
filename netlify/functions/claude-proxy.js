// netlify/functions/claude-proxy.js
//
// Proxy v3: traduce el formato Anthropic (con PDF base64) al formato Gemini 1.5 Flash.
// Procesa documentos PDF reales, no solo texto.
//
// Variable de entorno requerida en Netlify:
//   GEMINI_API_KEY → Settings → Environment variables

exports.handler = async function(event, context) {

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Método no permitido.' })
        };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'GEMINI_API_KEY no configurada en Netlify.' })
        };
    }

    try {
        const incoming = JSON.parse(event.body);

        // ── EXTRAER PARTES DEL MENSAJE ────────────────────────
        // El front-end manda:
        // messages[0].content = [
        //   { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: '...' } },
        //   { type: 'text', text: 'prompt...' }
        // ]

        const message = incoming.messages?.[0];
        if (!message) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No se recibieron mensajes.' })
            };
        }

        const parts = [];
        const content = message.content;

        if (typeof content === 'string') {
            parts.push({ text: content });

        } else if (Array.isArray(content)) {
            for (const part of content) {

                if (part.type === 'text') {
                    // Texto plano → pasa directo
                    parts.push({ text: part.text });

                } else if (part.type === 'document' && part.source?.type === 'base64') {
                    // PDF → formato inlineData que Gemini requiere
                    parts.push({
                        inlineData: {
                            mimeType: part.source.media_type || 'application/pdf',
                            data:     part.source.data  // base64 puro, sin prefijo data:...
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No se pudieron extraer partes del mensaje.' })
            };
        }

        // ── BODY PARA GEMINI ──────────────────────────────────
        const geminiBody = {
            contents: [{ parts }],
            generationConfig: {
                temperature:     0,     // Sin creatividad — extracción exacta de datos
                maxOutputTokens: 1500
            }
        };

        // ── LLAMAR A GEMINI 1.5 FLASH ─────────────────────────
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(geminiBody)
        });

        const googleData = await response.json();

        if (!response.ok) {
            console.error('Gemini error:', JSON.stringify(googleData));
            return {
                statusCode: response.status,
                headers: {
                    'Content-Type':                'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error:   'Error de Gemini: ' + (googleData.error?.message || response.status),
                    details: googleData
                })
            };
        }

        // ── EXTRAER TEXTO DE GEMINI ───────────────────────────
        const textoRespuesta = googleData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!textoRespuesta) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type':                'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error:   'Gemini devolvió respuesta vacía.',
                    details: googleData
                })
            };
        }

        // ── RESPUESTA EN FORMATO ANTHROPIC ────────────────────
        // El front-end espera data.content[0].text — lo simulamos
        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                id:      'gemini-' + Date.now(),
                type:    'message',
                role:    'assistant',
                model:   'gemini-1.5-flash',
                content: [{ type: 'text', text: textoRespuesta }]
            })
        };

    } catch (error) {
        console.error('claude-proxy error:', error);
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
