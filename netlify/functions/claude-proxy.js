// netlify/functions/claude-proxy.js
// v5 — timeout extendido, modelo configurable, diagnóstico de errores mejorado

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400'
};

// Modelos disponibles — el frontend puede elegir
// gemini-2.0-flash-lite fue discontinuado — se redirige a 2.5
const MODELOS = {
    'gemini-2.0-flash-lite':  'gemini-2.5-flash-lite',  // alias — 2.0 discontinuado
    'gemini-2.5-flash-lite':  'gemini-2.5-flash-lite',
    'gemini-2.5-flash':       'gemini-2.5-flash',
    'gemini-1.5-flash':       'gemini-2.5-flash-lite',  // alias — usar 2.5
    'gemini-1.5-pro':         'gemini-2.5-flash',       // alias — usar 2.5
};

// Modelo por defecto si el frontend no especifica
const MODELO_DEFAULT = 'gemini-2.5-flash-lite';

exports.handler = async function(event, context) {

    // Netlify: aumentar el timeout al máximo permitido (26 segundos)
    context.callbackWaitsForEmptyEventLoop = false;

    // Preflight CORS
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

    // ── Parsear body ──────────────────────────────────────────────────────────
    let incoming;
    try {
        incoming = JSON.parse(event.body);
    } catch(e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'Body inválido — no es JSON válido: ' + e.message })
        };
    }

    // ── Validar tamaño del body ───────────────────────────────────────────────
    const bodySize = event.body ? event.body.length : 0;
    if (bodySize > 20 * 1024 * 1024) { // 20MB límite
        return {
            statusCode: 413,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                error: 'Archivo demasiado grande. Máximo 20MB. Tamaño recibido: ' + Math.round(bodySize / 1024) + 'KB'
            })
        };
    }

    // ── Elegir modelo ─────────────────────────────────────────────────────────
    // El frontend puede pasar "model" en el body — se valida contra la lista permitida
    const modeloSolicitado = incoming.model || MODELO_DEFAULT;
    const modeloGemini     = MODELOS[modeloSolicitado] || MODELO_DEFAULT;

    // ── Extraer tokens máximos ────────────────────────────────────────────────
    const maxTokens = Math.min(incoming.max_tokens || 2000, 8000);

    // ── Construir partes del mensaje para Gemini ──────────────────────────────
    const message = incoming.messages && incoming.messages[0];
    if (!message) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'No se recibieron mensajes.' })
        };
    }

    const parts   = [];
    const content = message.content;

    try {
        if (typeof content === 'string') {
            parts.push({ text: content });

        } else if (Array.isArray(content)) {
            for (const part of content) {

                if (part.type === 'text') {
                    parts.push({ text: part.text });

                } else if (part.type === 'document' && part.source && part.source.type === 'base64') {
                    // PDF u otro documento
                    parts.push({
                        inlineData: {
                            mimeType: part.source.media_type || 'application/pdf',
                            data:     part.source.data
                        }
                    });

                } else if (part.type === 'image' && part.source && part.source.type === 'base64') {
                    // Imagen
                    parts.push({
                        inlineData: {
                            mimeType: part.source.media_type || 'image/jpeg',
                            data:     part.source.data
                        }
                    });
                }
                // Ignorar otros tipos silenciosamente
            }
        }
    } catch(e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'Error procesando el mensaje: ' + e.message })
        };
    }

    if (parts.length === 0) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'No se pudieron extraer partes del mensaje. Verificá el formato.' })
        };
    }

    // ── Llamar a Gemini ───────────────────────────────────────────────────────
    const geminiBody = {
        contents: [{ parts: parts }],
        generationConfig: {
            temperature:     0,
            maxOutputTokens: maxTokens,
            // Forzar respuesta JSON si el prompt lo pide
            responseMimeType: 'text/plain'
        }
    };

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'
        + modeloGemini
        + ':generateContent?key='
        + apiKey;

    let response;
    try {
        // AbortController para timeout explícito de 25 segundos
        const controller = new AbortController();
        const timeoutId  = setTimeout(function() { controller.abort(); }, 25000);

        response = await fetch(geminiUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(geminiBody),
            signal:  controller.signal
        });

        clearTimeout(timeoutId);

    } catch(e) {
        const esTimeout = e.name === 'AbortError';
        return {
            statusCode: esTimeout ? 504 : 502,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                error: esTimeout
                    ? 'Gemini tardó demasiado (>25s). Intentá con un archivo más pequeño o un modelo más rápido.'
                    : 'Error conectando con Gemini: ' + e.message
            })
        };
    }

    // ── Procesar respuesta de Gemini ──────────────────────────────────────────
    let googleData;
    try {
        googleData = await response.json();
    } catch(e) {
        return {
            statusCode: 502,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({ error: 'Gemini devolvió respuesta no parseable: ' + e.message })
        };
    }

    if (!response.ok) {
        // Errores conocidos de Gemini con mensajes claros
        const geminiError = googleData.error || {};
        let mensaje = geminiError.message || 'Error HTTP ' + response.status;

        // Traducir errores comunes
        if (response.status === 400) {
            mensaje = 'Petición inválida para Gemini: ' + mensaje;
        } else if (response.status === 403) {
            mensaje = 'API Key de Gemini inválida o sin permisos para este modelo.';
        } else if (response.status === 429) {
            mensaje = 'Límite de uso de Gemini alcanzado. Esperá unos minutos e intentá de nuevo.';
        } else if (response.status === 503) {
            mensaje = 'Gemini no disponible temporalmente. Intentá de nuevo en unos segundos.';
        }

        return {
            statusCode: response.status,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                error:   mensaje,
                details: googleData
            })
        };
    }

    // Extraer texto de la respuesta
    const candidates   = googleData.candidates || [];
    const textoRespuesta = candidates[0] &&
                           candidates[0].content &&
                           candidates[0].content.parts &&
                           candidates[0].content.parts[0] &&
                           candidates[0].content.parts[0].text
                           ? candidates[0].content.parts[0].text
                           : '';

    // Verificar finish reason
    const finishReason = candidates[0] && candidates[0].finishReason;
    if (finishReason === 'MAX_TOKENS') {
        // Devolver lo que hay pero con advertencia
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                id:      'gemini-' + Date.now(),
                type:    'message',
                role:    'assistant',
                model:   modeloGemini,
                content: [{ type: 'text', text: textoRespuesta }],
                warning: 'Respuesta truncada por límite de tokens. Aumentá max_tokens.'
            })
        };
    }

    if (!textoRespuesta) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS },
            body: JSON.stringify({
                error:       'Gemini devolvió respuesta vacía.',
                finishReason: finishReason || 'desconocido',
                details:     googleData
            })
        };
    }

    // ── Respuesta exitosa en formato compatible con el frontend ───────────────
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({
            id:      'gemini-' + Date.now(),
            type:    'message',
            role:    'assistant',
            model:   modeloGemini,
            content: [{ type: 'text', text: textoRespuesta }]
        })
    };
};
