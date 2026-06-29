// Netlify Function: aviso a los administradores cuando un huésped deja un recuerdo.
// WhatsApp vía CallMeBot + email vía EmailJS, todo del lado servidor.
// Las credenciales y contactos NUNCA están en el cliente: variables de entorno.
//
// Variables de entorno a configurar en Netlify (Site settings -> Environment variables):
//   CALLMEBOT_PHONE      = numero del admin (ya existe para notify-whatsapp)
//   CALLMEBOT_APIKEY     = api key CallMeBot de ese numero (ya existe)
//   ADMIN_EMAIL          = email donde recibir el aviso
//   EMAILJS_PRIVATE_KEY  = private key de EmailJS (para envio server-side / "API calls")
//   RECUERDOS_TOKEN      = el mismo token secreto que va en el QR y en firestore.rules
//
// El frontend (recuerdos.html) llama con POST { nombre, comentario, cabana, token }.
// Si el token no coincide, no se hace nada (evita abuso del endpoint).

var EMAILJS = { serviceId: 'Mailcasaverde', templateId: 'template_txtqg87', publicKey: 'v9IeaS5cXuzPAKCXh' };

exports.handler = async function (event) {
    var headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: headers, body: JSON.stringify({ ok: false, error: 'Método no permitido' }) };
    }

    try {
        var body = JSON.parse(event.body || '{}');
        var token = (body.token || '').toString();

        // Validar token: si no coincide con el del QR, no notificar.
        if (!process.env.RECUERDOS_TOKEN || token !== process.env.RECUERDOS_TOKEN) {
            return { statusCode: 403, headers: headers, body: JSON.stringify({ ok: false, error: 'Token inválido' }) };
        }

        var nombre = (body.nombre || 'Un huésped').toString().slice(0, 80);
        var comentario = (body.comentario || '').toString().slice(0, 600);
        var cabana = (body.cabana || '').toString().slice(0, 80);

        var resumen = comentario.length > 180 ? comentario.slice(0, 180) + '...' : comentario;
        var texto = '🌿 Nuevo recuerdo de huésped' + (cabana ? ' (' + cabana + ')' : '') +
                    '\nDe: ' + nombre +
                    '\n"' + resumen + '"' +
                    '\nRevisalo en el panel para aprobarlo.';

        var resultados = {};

        // ── WhatsApp (CallMeBot) ──
        var phone = process.env.CALLMEBOT_PHONE;
        var apikey = process.env.CALLMEBOT_APIKEY;
        if (phone && apikey) {
            try {
                var waUrl = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(phone) +
                            '&text=' + encodeURIComponent(texto) +
                            '&apikey=' + encodeURIComponent(apikey);
                var waResp = await fetch(waUrl);
                resultados.whatsapp = { ok: waResp.ok, status: waResp.status };
            } catch (e) { resultados.whatsapp = { ok: false, error: e.message }; }
        } else {
            resultados.whatsapp = { ok: false, error: 'CallMeBot no configurado' };
        }

        // ── Email (EmailJS server-side) ──
        var adminEmail = process.env.ADMIN_EMAIL;
        var emailjsPrivate = process.env.EMAILJS_PRIVATE_KEY;
        if (adminEmail && emailjsPrivate) {
            try {
                var htmlMsg = '<p><strong>Nuevo recuerdo de huésped</strong>' + (cabana ? ' — ' + cabana : '') + '</p>' +
                              '<p><strong>De:</strong> ' + nombre + '</p>' +
                              '<p>' + comentario.replace(/</g, '&lt;') + '</p>' +
                              '<p>Entrá al panel (Moderar recuerdos) para aprobarlo o descartarlo.</p>';
                var ejResp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        service_id: EMAILJS.serviceId,
                        template_id: EMAILJS.templateId,
                        user_id: EMAILJS.publicKey,
                        accessToken: emailjsPrivate,
                        template_params: {
                            enviar_a: adminEmail,
                            nombre_remitente: 'Casa Verde Canas',
                            asunto: 'Nuevo recuerdo de huésped' + (cabana ? ' (' + cabana + ')' : ''),
                            mensaje: htmlMsg
                        }
                    })
                });
                resultados.email = { ok: ejResp.ok, status: ejResp.status };
            } catch (e) { resultados.email = { ok: false, error: e.message }; }
        } else {
            resultados.email = { ok: false, error: 'EmailJS server-side no configurado' };
        }

        return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, resultados: resultados }) };
    } catch (e) {
        return { statusCode: 500, headers: headers, body: JSON.stringify({ ok: false, error: e.message }) };
    }
};
