// Netlify Function: envío de WhatsApp vía CallMeBot.
// La API key y el teléfono NUNCA están en el cliente: se leen de variables de entorno.
//
// Variables de entorno a configurar en Netlify (Site settings -> Environment variables):
//   CALLMEBOT_PHONE   = <numero destino por defecto, el del admin>
//   CALLMEBOT_APIKEY  = <api key de CallMeBot de ese numero>
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

        // Resolución de destinatario:
        //  - Si viene 'to' (uid): SOLO se manda si ese uid está en CALLMEBOT_RECIPIENTS.
        //    Así un aviso dirigido nunca cae en el número equivocado.
        //  - Si NO viene 'to': se usa el número por defecto del admin (CALLMEBOT_PHONE).
        var phone = '';
        var apikey = '';
        var to = (body.to || '').toString();

        if (to) {
            if (process.env.CALLMEBOT_RECIPIENTS) {
                try {
                    var map = JSON.parse(process.env.CALLMEBOT_RECIPIENTS);
                    if (map[to] && map[to].phone && map[to].apikey) {
                        phone = map[to].phone;
                        apikey = map[to].apikey;
                    }
                } catch (e) { /* mapa mal formado */ }
            }
            if (!phone || !apikey) {
                return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: false, error: 'Ese usuario no tiene WhatsApp configurado (no está en CALLMEBOT_RECIPIENTS).' }) };
            }
        } else {
            phone = process.env.CALLMEBOT_PHONE;
            apikey = process.env.CALLMEBOT_APIKEY;
        }

        if (!phone || !apikey) {
            return { statusCode: 500, headers: headers, body: JSON.stringify({ ok: false, error: 'WhatsApp no configurado (faltan variables de entorno).' }) };
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
