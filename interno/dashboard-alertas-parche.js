// ============================================================
//  PARCHE: dashboard.html — sistema de alertas unificado
//  Reemplaza la funcion cargarAlertas() existente por esta.
//  Copia este bloque <script> y pega en dashboard.html,
//  reemplazando la funcion cargarAlertas() preexistente.
// ============================================================

async function cargarAlertas() {
    const contenedor = document.getElementById('alertasContainer') || document.getElementById('seccionAlertas');
    if (!contenedor) return;

    const alertas = [];
    const hoy     = new Date();

    // ── 1. TAREAS EN URGENCIA (rojo) ─────────────────────────────────────────
    try {
        const snapTareas = await CVC.db.collection('tareas')
            .where('estado', 'in', ['pendiente', 'en_curso'])
            .get();

        snapTareas.docs.forEach(function(doc) {
            const t = doc.data();
            const u = CVC.urgenciaTarea(t);
            if (u.color === 'rojo') {
                alertas.push({
                    tipo:    'error',
                    icono:   'warning',
                    titulo:  'Tarea urgente: ' + (t.nombre || 'sin nombre'),
                    detalle: u.label + (t.tipo ? ' · ' + t.tipo : ''),
                    link:    t.tipo === 'limpieza' ? 'tareas.html' : 'tareas-admin.html'
                });
            }
        });
    } catch(e) { console.warn('alertas-tareas:', e.message); }

    // ── 2. TOKENS CONTADOR ────────────────────────────────────────────────────
    try {
        const snapTok = await CVC.db.collection('config').doc('tokens_contador').get();
        if (snapTok.exists) {
            const data = snapTok.data();
            Object.entries(data).forEach(function([id, t]) {
                if (t.activo === false) return;
                const vence    = t.vence?.toDate ? t.vence.toDate() : new Date(t.vence || 0);
                const diasRest = Math.ceil((vence - hoy) / 86400000);

                if (diasRest < 0) {
                    // Vencido hace menos de 7 dias — recordar revocar
                    const diasPasados = Math.abs(diasRest);
                    if (diasPasados <= 7) {
                        alertas.push({
                            tipo:    'info',
                            icono:   'vpn_key',
                            titulo:  'Acceso contador vencido',
                            detalle: (t.label || id) + ' — vencio hace ' + diasPasados + 'd. Considerar revocar.',
                            link:    'acceso-contador.html'
                        });
                    }
                } else if (diasRest <= 2) {
                    // Proximo a vencer
                    alertas.push({
                        tipo:    'warning',
                        icono:   'vpn_key',
                        titulo:  'Acceso contador proxima a vencer',
                        detalle: (t.label || id) + ' — vence en ' + diasRest + (diasRest === 1 ? ' dia' : ' dias') + '.',
                        link:    'acceso-contador.html'
                    });
                }
            });
        }
    } catch(e) { console.warn('alertas-tokens:', e.message); }

    // ── 3. ALERTAS FISCALES ───────────────────────────────────────────────────
    try {
        const snapFisc = await CVC.db.collection('config').doc('fiscal_registros').get();
        const mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');

        if (snapFisc.exists) {
            const registros = snapFisc.data().registros || [];

            // Pagos pendientes vencidos
            registros.forEach(function(r) {
                if (r.pago) return;
                if (!r.vencimento) return;
                const partes = (r.vencimento + '').split('/');
                let fechaVenc;
                if (partes.length === 3) {
                    // dd/mm/yyyy
                    fechaVenc = new Date(partes[2], partes[1] - 1, partes[0]);
                } else {
                    fechaVenc = new Date(r.vencimento);
                }
                if (fechaVenc < hoy) {
                    alertas.push({
                        tipo:    'error',
                        icono:   'receipt_long',
                        titulo:  'Obligacion fiscal vencida: ' + (r.tipo || 'DARF/Carne-Leao'),
                        detalle: 'Competencia ' + (r.competencia || '--') + ' — R$ ' + (r.valor || 0) + ' — vencio ' + (r.vencimento || '--'),
                        link:    'fiscal.html'
                    });
                } else {
                    // Proxima a vencer en <= 5 dias
                    const diasHasta = Math.ceil((fechaVenc - hoy) / 86400000);
                    if (diasHasta <= 5) {
                        alertas.push({
                            tipo:    'warning',
                            icono:   'receipt_long',
                            titulo:  'Obligacion fiscal proxima a vencer',
                            detalle: (r.tipo || 'DARF/Carne-Leao') + ' — vence en ' + diasHasta + 'd · R$ ' + (r.valor || 0),
                            link:    'fiscal.html'
                        });
                    }
                }
            });

            // Sin registro del mes actual
            const tieneActual = registros.some(function(r) {
                return (r.competencia || '').startsWith(mesActual);
            });
            if (!tieneActual && hoy.getDate() > 10) {
                alertas.push({
                    tipo:    'info',
                    icono:   'event_note',
                    titulo:  'Fiscal: sin registro del mes',
                    detalle: 'No hay ninguna entrada fiscal para ' + mesActual + '. Revisar si corresponde.',
                    link:    'fiscal.html'
                });
            }
        }
    } catch(e) { console.warn('alertas-fiscal:', e.message); }

    // ── RENDER ────────────────────────────────────────────────────────────────
    if (alertas.length === 0) {
        contenedor.innerHTML = '<div class="state-empty" style="padding:24px 0">'
            + '<span class="material-icons">check_circle</span>'
            + '<div class="state-empty__title">Sin alertas pendientes</div>'
            + '</div>';
        return;
    }

    // Orden: error > warning > info
    const orden = { error: 0, warning: 1, info: 2 };
    alertas.sort(function(a, b) { return (orden[a.tipo] || 9) - (orden[b.tipo] || 9); });

    const colores = {
        error:   { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626' },
        warning: { bg: '#fffbeb', border: '#fcd34d', icon: '#d97706' },
        info:    { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb' }
    };

    contenedor.innerHTML = alertas.map(function(a) {
        const c = colores[a.tipo] || colores.info;
        return '<div style="background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start">'
            + '<span class="material-icons" style="color:' + c.icon + ';font-size:20px;flex-shrink:0;margin-top:1px">' + (a.icono || 'info') + '</span>'
            + '<div style="flex:1">'
            + '<div style="font-weight:600;font-size:.9rem">' + CVC.escapeHtml(a.titulo) + '</div>'
            + (a.detalle ? '<div style="font-size:.82rem;color:#6b7280;margin-top:2px">' + CVC.escapeHtml(a.detalle) + '</div>' : '')
            + '</div>'
            + (a.link ? '<a href="' + a.link + '" style="font-size:.8rem;color:#2563eb;font-weight:600;white-space:nowrap;align-self:center">Ver &rarr;</a>' : '')
            + '</div>';
    }).join('');
}

// Llamar al cargar la pagina (ya existia en dashboard.html, reemplazar o invocar desde DOMContentLoaded)
// cargarAlertas();

// ── NOTA DE INSTALACION ───────────────────────────────────────────────────────
// 1. En dashboard.html, buscar la funcion cargarAlertas() existente y reemplazarla
//    por el contenido de este archivo (sin los comentarios de instalacion).
// 2. Asegurarse de que el contenedor tenga id="alertasContainer" o "seccionAlertas".
// 3. La funcion se llama desde el DOMContentLoaded existente — no hace falta
//    agregar una llamada nueva si ya estaba.
