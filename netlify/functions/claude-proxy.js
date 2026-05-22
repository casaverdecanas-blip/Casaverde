// netlify/functions/claude-proxy.js
//
// Proxy inteligente v2: Recibe el formato de Anthropic desde informes-airbnb.html,
// lo traduce al formato de Google Gemini 1.5 Flash en el servidor, y procesa gratis.

exports.handler = async function(event, context) {

    // Solo aceptar POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Método no permitido. Usar POST.' })
        };
    }

    // Verificar la API key de Gemini configurada en GitHub/Netlify
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'GEMINI_API_KEY no configurada en el servidor.' })
        };
    }

    try {
        const incomingBody = JSON.parse(event.body);
        
        // --- TRADUCCIÓN DE FORMATO: De Anthropic a Gemini ---
        // Extraemos el texto que venía en el formato de Claude
        let userPrompt = "Procesar información de formulario."; // Texto por defecto
        
        if (incomingBody.messages && incomingBody.messages.length > 0) {
            userPrompt = incomingBody.messages[0].content;
        } else if (incomingBody.prompt) {
            userPrompt = incomingBody.prompt;
        }

        // Estructuramos el cuerpo exacto que Gemini 1.5 Flash necesita
        const geminiRequestBody = {
            contents: [
                {
                    parts: [
                        { text: userPrompt }
                    ]
                }
            ]
        };

        // URL oficial de Google AI Studio para el modelo gratuito Gemini 1.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        // Llamada a la API de Google
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequestBody)
        });

        const googleData = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify(googleData)
            };
        }

        // --- TRADUCCIÓN DE RESPUESTA: De Gemini a lo que espera el Front-End ---
        // Tu HTML original espera encontrar la respuesta en data.content[0].text
        // Adaptamos la respuesta de Google para que simule ser Claude y la web no rompa
        const textoRespuestaGemini = googleData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const fakeClaudeResponse = {
            id: "gemini-converted-" + Date.now(),
            type: "message",
            role: "assistant",
            model: "gemini-1.5-flash",
            content: [
                {
                    type: "text",
                    text: textoRespuestaGemini
                }
            ]
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(fakeClaudeResponse)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Error interno en la conversión a Gemini: ' + error.message })
        };
    }
};
