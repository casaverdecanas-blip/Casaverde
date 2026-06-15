// Netlify Function: envío de WhatsApp vía CallMeBot.
// La API key y el teléfono NUNCA están en el cliente: se leen de variables de entorno.
//
// Variables de entorno a configurar en Netlify (Site settings -> Environment variables):
//   CALLMEBOT_PHONE   = 5899696333        (número destino por defecto, el del admin)
//   CALLMEBOT_APIKEY  = 1314434           (api key de CallMeBot de ese número)
//   CALLMEBOT_RECIPIENTS = {"UID_DE_FLOR":{"phone":"...","apikey":"..."}, ...}
//        (opcional, JSON; para notificar a otros usuarios por su uid. Lo completa el admin
//         cuando una persona se da de alta y le pasa su key de forma segura.)
//
// El frontend llama a esta función con POST { text: "...", to: "uid (opcional)" }.

exports.handler = async function (event) {
    var headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: headers, body: JSON.stringify({ ok: false, error: 'Método no permitido' }) };
    }

    try {
        var body = JSON.parse(event.body || '{}');
        var text = (body.text || '').toString().trim();
        if (!text) {
            return { statusCode: 400, headers: headers, body: JSON.stringify({ ok: false, error: 'Falta el texto del mensaje' }) };
        }

        // Destinatario: por defecto el del env; si viene 'to' y hay mapa, se busca ahí.
        var phone = process.env.CALLMEBOT_PHONE;
        var apikey = process.env.CALLMEBOT_APIKEY;

        if (body.to && process.env.CALLMEBOT_RECIPIENTS) {
            try {
                var map = JSON.parse(process.env.CALLMEBOT_RECIPIENTS);
                if (map[body.to] && map[body.to].phone && map[body.to].apikey) {
                    phone = map[body.to].phone;
                    apikey = map[body.to].apikey;
                }
            } catch (e) { /* mapa mal formado: se usa el default */ }
        }

        if (!phone || !apikey) {
            return { statusCode: 500, headers: headers, body: JSON.stringify({ ok: false, error: 'WhatsApp no configurado para ese destinatario' }) };
        }

        // CallMeBot: GET con phone, text (encodeURIComponent) y apikey
        var url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(phone) +
                  '&text=' + encodeURIComponent(text) +
                  '&apikey=' + encodeURIComponent(apikey);

        var resp = await fetch(url);
        var respText = await resp.text();

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ ok: resp.ok, status: resp.status, respuesta: respText.slice(0, 300) })
        };
    } catch (e) {
        return { statusCode: 500, headers: headers, body: JSON.stringify({ ok: false, error: e.message }) };
    }
};
