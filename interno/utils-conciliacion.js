// ══════════════════════════════════════════════════════════════════════════════
// MOTOR DE AUTO-CONCILIACIÓN BANCARIA
// Agregar este bloque completo al final de utils.js, ANTES de window.CVC = {
// Luego agregar las 4 funciones al objeto window.CVC (ver abajo)
// ══════════════════════════════════════════════════════════════════════════════

const _CONCIL_DEFAULTS = {
    palabrasClaveAirbnb: ['AIRBNB', 'AIR BNB', 'AIRBNB PAYMENTS', 'Airbnb'],
    toleranciaMontoPctA: 0.005,
    toleranciaMontoPctB: 0.02,
    toleranciaFechaDiasA: 3,
    toleranciaFechaDiasB: 7,
};

let _configConciliacion = null;

async function cargarConfigConciliacion() {
    if (_configConciliacion) return _configConciliacion;
    try {
        const snap = await db.collection('config').doc('conciliacion').get();
        _configConciliacion = snap.exists
            ? { ..._CONCIL_DEFAULTS, ...snap.data() }
            : { ..._CONCIL_DEFAULTS };
    } catch (e) {
        _configConciliacion = { ..._CONCIL_DEFAULTS };
    }
    return _configConciliacion;
}

function _toDateStr(v) {
    if (!v) return null;
    if (typeof v === 'string') return v.slice(0, 10);
    if (v.toDate) return v.toDate().toISOString().slice(0, 10);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return null;
}

function _diasDiferencia(fechaA, fechaB) {
    if (!fechaA || !fechaB) return 999;
    return Math.abs(Math.round((new Date(fechaA) - new Date(fechaB)) / 86400000));
}

function _esAirbnb(descripcion, palabrasClave) {
    const desc = (descripcion || '').toUpperCase();
    return palabrasClave.some(p => desc.includes(p.toUpperCase()));
}

function _descripcionContiene(descripcion, texto) {
    if (!texto || texto.length < 3) return false;
    const desc  = (descripcion || '').toUpperCase();
    const token = texto.toUpperCase().trim();
    if (token.length >= 5 && desc.includes(token)) return true;
    return token.split(/\s+/).some(p => p.length >= 4 && desc.includes(p));
}

function matchMovimientoBancario(movBanco, registros, config) {
    const cfg = config || _CONCIL_DEFAULTS;
    const { palabrasClaveAirbnb, toleranciaMontoPctA, toleranciaMontoPctB,
            toleranciaFechaDiasA, toleranciaFechaDiasB } = cfg;

    const fechaBanco    = movBanco.fecha;
    const montoBanco    = Math.abs(movBanco.monto);
    const esCreditoBanco = movBanco.monto >= 0;

    let mejorMatch    = null;
    let mejorNivel    = 'C';
    let mejorConfianza = 0;
    let mejorRazon    = 'Sin coincidencia en el sistema';

    for (const reg of registros) {
        const fechaReg    = _toDateStr(reg.fecha || reg.creadoEn);
        const montoReg    = Math.abs(reg.monto || reg.total_neto || 0);
        if (!montoReg) continue;

        const esCreditoReg = reg._coleccion === 'pagos' || reg._coleccion === 'informes_airbnb';
        if (esCreditoBanco !== esCreditoReg) continue;

        const difMonto = montoReg > 0 ? Math.abs(montoBanco - montoReg) / montoReg : 1;
        const difDias  = _diasDiferencia(fechaBanco, fechaReg);
        const nombreRef = reg.clienteNombre || reg.proveedor || reg.anfitrion || '';
        const origenOk  = _esAirbnb(movBanco.descripcion, palabrasClaveAirbnb) ||
                          _descripcionContiene(movBanco.descripcion, nombreRef);

        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasA && origenOk) {
            const confianza = 1.0 - (difMonto * 10) - (difDias * 0.02);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'A'; mejorConfianza = confianza;
                mejorRazon = `Monto ±${(difMonto*100).toFixed(2)}% · Fecha ±${difDias}d · Origen reconocido`;
            }
            continue;
        }
        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasB) {
            const confianza = 0.8 - (difDias * 0.03);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = confianza;
                mejorRazon = `Monto exacto · Fecha ±${difDias}d (fuera ventana A)`;
            }
        } else if (difMonto <= toleranciaMontoPctB && difDias <= toleranciaFechaDiasB && origenOk) {
            const confianza = 0.65 - (difMonto * 5) - (difDias * 0.02);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = confianza;
                mejorRazon = `Monto ±${(difMonto*100).toFixed(2)}% · Fecha ±${difDias}d · Origen reconocido`;
            }
        }
    }

    return {
        nivel:     mejorNivel,
        confianza: Math.max(0, Math.min(1, mejorConfianza)),
        registro:  mejorMatch,
        coleccion: mejorMatch?._coleccion || null,
        razon:     mejorRazon,
    };
}

async function conciliarContraRegistros(movimientos, cuentaId) {
    const config = await cargarConfigConciliacion();
    const fechas = movimientos.map(m => m.fecha).filter(Boolean).sort();
    if (!fechas.length) return movimientos;

    const desde = new Date(fechas[0]);
    const hasta = new Date(fechas[fechas.length - 1]);
    desde.setDate(desde.getDate() - 8);
    hasta.setDate(hasta.getDate() + 8);
    const desdeFmt = desde.toISOString().slice(0, 10);
    const hastaFmt = hasta.toISOString().slice(0, 10);

    const [pagosSnap, gastosSnap, informesSnap] = await Promise.all([
        db.collection('pagos').where('fecha', '>=', desdeFmt).where('fecha', '<=', hastaFmt).get(),
        db.collection('gastos').where('fecha', '>=', desdeFmt).where('fecha', '<=', hastaFmt).get(),
        db.collection('informes_airbnb').where('fecha', '>=', desdeFmt).where('fecha', '<=', hastaFmt).get()
            .catch(() => ({ docs: [] })),
    ]);

    const registros = [
        ...pagosSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'pagos' })),
        ...gastosSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'gastos' })),
        ...informesSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'informes_airbnb' })),
    ];

    return movimientos.map(mov => {
        if (mov.estado === 'duplicado') {
            return { ...mov, matchResultado: { nivel: 'DUP', confianza: 1, registro: null, razon: 'Duplicado exacto ya importado' } };
        }
        return { ...mov, matchResultado: matchMovimientoBancario(mov, registros, config) };
    });
}

async function guardarConciliacion(movimientoId, matchResultado, confirmadoPor) {
    const { nivel, registro, coleccion, razon, confianza } = matchResultado;
    if (!movimientoId || nivel === 'C' || nivel === 'DUP') return;
    await db.collection('movimientos').doc(movimientoId).update({
        conciliado:          true,
        conciliadoNivel:     nivel,
        conciliadoConId:     registro?._id || null,
        conciliadoConCol:    coleccion || null,
        conciliadoRazon:     razon,
        conciliadoConfianza: confianza,
        conciliadoEn:        firebase.firestore.FieldValue.serverTimestamp(),
        conciliadoPor:       nivel === 'A' ? 'auto' : (confirmadoPor || 'manual'),
    });
}

// ── AGREGAR AL OBJETO window.CVC = { ...existente..., ────────
//    matchMovimientoBancario,
//    conciliarContraRegistros,
//    guardarConciliacion,
//    cargarConfigConciliacion,
// };
