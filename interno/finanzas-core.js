// ═══════════════════════════════════════════════════════════════════════════
//  FINANZAS-CORE.JS · v1.0 (sistema v4.35, Fase 1 de la reforma financiera)
//  Casa Verde Canas
//
//  EL LIBRO ÚNICO DEL DINERO.
//  Traduce las colecciones financieras a un solo lenguaje de "eventos":
//  todo lo que entra o sale tiene fecha, sentido, monto con su moneda y
//  equivalente en R$, cuenta, contraparte y vínculo.
//
//  CRITERIO ESTRUCTURAL (decisión Mauro, jul-2026):
//  → EL FLUJO DEFINE LOS SALDOS: saldo de cuenta = saldo inicial + suma de
//    los eventos (pagos, gastos, honorarios pagados, retiros) de esa cuenta.
//  → EL EXTRACTO VERIFICA: los 'movimientos' BTG NUNCA se suman al flujo
//    (ya están representados por los pagos/gastos que nacen de su
//    clasificación); sirven para conciliar y detectar faltantes.
//
//  Se carga después de utils.js:
//    <script src="utils.js"></script>
//    <script src="finanzas-core.js"></script>
//  Expone window.FIN. Solo LECTURA — no escribe en la base.
// ═══════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    var SIMBOLO = { BRL: 'R$', USD: 'US$', UYU: '$U', ARS: '$', EUR: '€' };

    function fmtMon(n, moneda) {
        return (SIMBOLO[moneda] || moneda || 'R$') + ' '
            + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }
    function fmtBRL(n) { return fmtMon(n, 'BRL'); }

    // ── Aporte de un evento al flujo en R$ ───────────────────────────────────
    // BRL → su monto · otra moneda CON equivalente guardado → montoBRL ·
    // sin equivalente → null (no se inventa una cotización: queda pendiente)
    function aporteBRL(monto, moneda, montoBRL) {
        if (moneda === 'BRL' || !moneda) return Number(monto) || 0;
        if (typeof montoBRL === 'number' && !isNaN(montoBRL)) return montoBRL;
        return null;
    }

    // ── Fechas: acepta Timestamp de Firestore o string 'YYYY-MM-DD' ─────────
    function fechaDe(v) {
        if (!v) return null;
        if (v.toDate) return v.toDate();
        if (typeof v === 'string') {
            var d = new Date(v.length === 10 ? v + 'T12:00:00' : v);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }
    function fechaStrDe(v) {
        var d = fechaDe(v);
        return d ? d.toISOString().slice(0, 10) : '';
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  NORMALIZADORES — cada colección al lenguaje común
    //  Evento: { id, origen, refId, fecha, fechaStr, tipo(ingreso|egreso),
    //            monto, moneda, montoBRL, cuentaId, cuentaNombre,
    //            contraparte, concepto, categoria, destino, circuito,
    //            vinculo, flags }
    // ═════════════════════════════════════════════════════════════════════════

    function normalizarPago(id, p) {
        var moneda = p.moneda || 'BRL';
        return {
            id: 'pago-' + id, origen: 'pago', refId: id,
            fecha: fechaDe(p.creadoEn), fechaStr: fechaStrDe(p.creadoEn),
            tipo: 'ingreso',
            monto: Number(p.monto) || 0, moneda: moneda,
            montoBRL: aporteBRL(p.monto, moneda, p.montoBRL),
            cuentaId: p.cuentaDestinoId || null,
            cuentaNombre: p.cuentaDestinoNombre || null,
            contraparte: p.clienteNombre || '',
            concepto: p.concepto || p.tipo || 'Ingreso',
            categoria: p.tipo || null, destino: null, circuito: null,
            vinculo: p.reservaId ? { tipo: 'reserva', id: p.reservaId } : null,
            flags: {
                sinCuenta:     !p.cuentaDestinoId,
                sinCotizacion: moneda !== 'BRL' && !(typeof p.montoBRL === 'number' && !isNaN(p.montoBRL)),
                sinDestino: false, sinCategoria: false, pendientePago: false
            }
        };
    }

    function normalizarGasto(id, g) {
        var moneda = g.moneda || 'BRL';
        // Regla de clasificación completa (misma que clasificación masiva):
        var sinClasif = !g.categoria || !g.destino || !g.circuito;
        return {
            id: 'gasto-' + id, origen: 'gasto', refId: id,
            fecha: fechaDe(g.fecha || g.creadoEn), fechaStr: fechaStrDe(g.fecha || g.creadoEn),
            tipo: 'egreso',
            monto: Number(g.monto) || 0, moneda: moneda,
            montoBRL: aporteBRL(g.monto, moneda, g.montoBRL),
            cuentaId: g.cuentaOrigenId || null,
            cuentaNombre: g.cuentaOrigenNom || null,
            contraparte: g.proveedor || '',
            concepto: g.concepto || 'Gasto',
            categoria: g.categoria || null,
            destino: g.destino || null,
            circuito: g.circuito || null,
            vinculo: g.reservaId ? { tipo: 'reserva', id: g.reservaId } : null,
            flags: {
                sinCuenta:     !g.cuentaOrigenId && g.metodo !== 'fondos_propios',
                sinCotizacion: moneda !== 'BRL' && !(typeof g.montoBRL === 'number' && !isNaN(g.montoBRL)),
                sinDestino:    sinClasif,
                sinCategoria:  !g.categoria,
                pendientePago: false,
                reembolsoPendiente: !!g.reembolso
            }
        };
    }

    // Honorarios y reembolsos: son egresos SOLO cuando están pagados.
    // Pendientes = deuda a pagar → van a la bandeja, no al flujo.
    function normalizarHonorario(id, h) {
        var moneda = h.moneda || 'BRL';
        var pagado = h.estado === 'pagado';
        return {
            id: 'honorario-' + id, origen: 'honorario', refId: id,
            fecha: fechaDe(h.pagadoEn || h.creadoEn), fechaStr: fechaStrDe(h.pagadoEn || h.creadoEn),
            tipo: 'egreso',
            monto: Number(h.monto) || 0, moneda: moneda,
            montoBRL: aporteBRL(h.monto, moneda, h.montoBRL),
            cuentaId: h.cuentaOrigenId || null,
            cuentaNombre: h.cuentaOrigenNom || null,
            contraparte: h.nombre || '',
            concepto: (h.tipo === 'reembolso' ? 'Reembolso: ' : 'Honorarios: ') + (h.concepto || ''),
            categoria: h.tipo || 'honorario', destino: null, circuito: null,
            vinculo: h.actividadId ? { tipo: 'actividad', id: h.actividadId } : null,
            enFlujo: pagado,   // ← los pendientes NO suman al flujo
            flags: {
                sinCuenta: pagado && !h.cuentaOrigenId,
                sinCotizacion: false, sinDestino: false, sinCategoria: false,
                pendientePago: !pagado
            }
        };
    }

    function normalizarRetiro(id, r) {
        var moneda = r.moneda || 'BRL';
        return {
            id: 'retiro-' + id, origen: 'retiro', refId: id,
            fecha: fechaDe(r.fecha || r.creadoEn), fechaStr: fechaStrDe(r.fecha || r.creadoEn),
            tipo: 'egreso',
            monto: Number(r.monto) || 0, moneda: moneda,
            montoBRL: aporteBRL(r.monto, moneda, r.montoBRL),
            cuentaId: r.cuentaId || r.cuentaOrigenId || null,
            cuentaNombre: r.cuentaNombre || r.cuentaOrigenNom || null,
            contraparte: r.nombre || r.socio || '',
            concepto: 'Retiro' + (r.concepto ? ': ' + r.concepto : ''),
            categoria: 'retiro', destino: null, circuito: null,
            vinculo: null,
            flags: { sinCuenta: !(r.cuentaId || r.cuentaOrigenId), sinCotizacion: false,
                     sinDestino: false, sinCategoria: false, pendientePago: false }
        };
    }

    // Movimientos del extracto: NO son eventos de flujo — son el verificador.
    function normalizarMovimiento(id, m) {
        return {
            id: 'mov-' + id, refId: id,
            fecha: fechaDe(m.fecha), fechaStr: fechaStrDe(m.fecha),
            tipo: m.tipo === 'credito' ? 'ingreso' : 'egreso',
            monto: Math.abs(Number(m.monto) || 0), moneda: 'BRL',
            cuentaId: m.cuentaId || null,
            descripcion: m.descripcion || '', etiqueta: m.etiqueta || '',
            clasificado: !!m.categoriaId
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  CARGA — lee todo y devuelve el libro unificado
    // ═════════════════════════════════════════════════════════════════════════

    async function cargarTodo() {
        var db = CVC.db;
        var res = await Promise.all([
            db.collection('pagos').get(),
            db.collection('gastos').get(),
            db.collection('honorarios').get(),
            db.collection('retiros').get(),
            db.collection('movimientos').get(),
            db.collection('cuentas').get(),
            db.collection('categorias').get(),
            db.collection('destinos').get()
        ]);

        var eventos = [];
        res[0].docs.forEach(function(d) { eventos.push(normalizarPago(d.id, d.data())); });
        res[1].docs.forEach(function(d) { eventos.push(normalizarGasto(d.id, d.data())); });
        res[2].docs.forEach(function(d) { eventos.push(normalizarHonorario(d.id, d.data())); });
        res[3].docs.forEach(function(d) { eventos.push(normalizarRetiro(d.id, d.data())); });

        var movimientos = res[4].docs.map(function(d) { return normalizarMovimiento(d.id, d.data()); });

        var cuentas = res[5].docs
            .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .sort(function(a, b) { return (a.orden || 99) - (b.orden || 99); });

        var categorias = res[6].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        var destinos   = res[7].docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });

        // Orden cronológico descendente (lo más nuevo primero)
        eventos.sort(function(a, b) {
            return (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0);
        });

        return {
            eventos: eventos,
            movimientos: movimientos,
            cuentas: cuentas,
            categorias: categorias,
            destinos: destinos,
            pendientes: detectarPendientes(eventos, movimientos)
        };
    }

    // ── Solo los eventos que cuentan para saldos y totales ──────────────────
    function enFlujo(ev) {
        return ev.enFlujo !== false;   // honorarios pendientes quedan fuera
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  FILTROS Y TOTALES
    // ═════════════════════════════════════════════════════════════════════════

    // filtros: { mes:'YYYY-MM', cuentaId, tipo:'ingreso'|'egreso', moneda,
    //            origen, destino, texto }
    function filtrar(eventos, f) {
        f = f || {};
        var txt = (f.texto || '').toLowerCase();
        return eventos.filter(function(ev) {
            if (!enFlujo(ev)) return false;
            if (f.mes      && ev.fechaStr.slice(0, 7) !== f.mes)  return false;
            if (f.cuentaId && ev.cuentaId !== f.cuentaId)          return false;
            if (f.tipo     && ev.tipo !== f.tipo)                  return false;
            if (f.moneda   && ev.moneda !== f.moneda)              return false;
            if (f.origen   && ev.origen !== f.origen)              return false;
            if (f.destino  && ev.destino !== f.destino)            return false;
            if (txt) {
                var blob = (ev.contraparte + ' ' + ev.concepto + ' '
                    + (ev.categoria || '') + ' ' + (ev.cuentaNombre || '')).toLowerCase();
                if (blob.indexOf(txt) === -1) return false;
            }
            return true;
        });
    }

    function totales(eventos) {
        var t = { ingresosBRL: 0, egresosBRL: 0, balanceBRL: 0,
                  sinEquivalente: 0, porMoneda: {} };
        eventos.forEach(function(ev) {
            if (!enFlujo(ev)) return;
            var m = ev.moneda || 'BRL';
            if (!t.porMoneda[m]) t.porMoneda[m] = { ingresos: 0, egresos: 0 };
            t.porMoneda[m][ev.tipo === 'ingreso' ? 'ingresos' : 'egresos'] += ev.monto;

            if (ev.montoBRL === null) { t.sinEquivalente++; return; }
            if (ev.tipo === 'ingreso') t.ingresosBRL += ev.montoBRL;
            else                       t.egresosBRL  += ev.montoBRL;
        });
        t.ingresosBRL = Math.round(t.ingresosBRL * 100) / 100;
        t.egresosBRL  = Math.round(t.egresosBRL * 100) / 100;
        t.balanceBRL  = Math.round((t.ingresosBRL - t.egresosBRL) * 100) / 100;
        return t;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SALDOS — el flujo define
    //  Saldo en la MONEDA de la cuenta: los eventos de esa cuenta suman por su
    //  monto original si coincide la moneda; si un evento en otra moneda cayó
    //  en la cuenta, se usa el equivalente que corresponda y se marca.
    // ═════════════════════════════════════════════════════════════════════════

    function saldoCuenta(cuenta, eventos) {
        var monedaCta = cuenta.moneda || 'BRL';
        var saldo = Number(cuenta.saldoInicial) || 0;
        var eventosCta = 0, monedaCruzada = 0;

        eventos.forEach(function(ev) {
            if (!enFlujo(ev) || ev.cuentaId !== cuenta.id) return;
            eventosCta++;
            var aporte;
            if (ev.moneda === monedaCta) {
                aporte = ev.monto;
            } else if (monedaCta === 'BRL' && ev.montoBRL !== null) {
                aporte = ev.montoBRL;
            } else {
                // Moneda del evento ≠ moneda de la cuenta y sin conversión directa:
                // no se inventa — se marca para revisar.
                monedaCruzada++;
                return;
            }
            saldo += ev.tipo === 'ingreso' ? aporte : -aporte;
        });

        return {
            saldo: Math.round(saldo * 100) / 100,
            moneda: monedaCta,
            eventos: eventosCta,
            monedaCruzada: monedaCruzada
        };
    }

    function saldosTodos(cuentas, eventos) {
        var out = {};
        cuentas.forEach(function(c) { out[c.id] = saldoCuenta(c, eventos); });
        return out;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  VERIFICACIÓN CONTRA EL EXTRACTO (movimientos BTG)
    //  El extracto no suma: controla. Por cuenta con extracto, compara el
    //  neto del extracto contra el neto del flujo BRL de esa cuenta.
    // ═════════════════════════════════════════════════════════════════════════

    function verificacionExtracto(cuenta, eventos, movimientos) {
        var movsCta = movimientos.filter(function(m) { return m.cuentaId === cuenta.id; });
        if (!movsCta.length) return null;   // cuenta sin extracto (Prex, Midinero…)

        var netoExtracto = 0, sinClasificar = 0;
        movsCta.forEach(function(m) {
            netoExtracto += m.tipo === 'ingreso' ? m.monto : -m.monto;
            if (!m.clasificado) sinClasificar++;
        });

        var netoFlujo = 0;
        eventos.forEach(function(ev) {
            if (!enFlujo(ev) || ev.cuentaId !== cuenta.id) return;
            var a = ev.montoBRL;
            if (a === null) return;
            netoFlujo += ev.tipo === 'ingreso' ? a : -a;
        });

        return {
            movimientos: movsCta.length,
            sinClasificar: sinClasificar,
            netoExtracto: Math.round(netoExtracto * 100) / 100,
            netoFlujo: Math.round(netoFlujo * 100) / 100,
            diferencia: Math.round((netoExtracto - netoFlujo) * 100) / 100
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  BANDEJA DE PENDIENTES — todo lo sin resolver, en un solo lugar
    // ═════════════════════════════════════════════════════════════════════════

    function detectarPendientes(eventos, movimientos) {
        var p = {
            sinCuenta: [],          // plata sin cuenta asignada
            sinCotizacion: [],      // moneda extranjera sin equivalente R$
            gastosSinClasificar: [],// gasto sin categoría/destino/circuito
            movsSinClasificar: [],  // extracto sin traducir a flujo
            aPagar: []              // honorarios y reembolsos pendientes
        };
        eventos.forEach(function(ev) {
            if (ev.flags.pendientePago)                    { p.aPagar.push(ev); return; }
            if (ev.flags.sinCuenta)                        p.sinCuenta.push(ev);
            if (ev.flags.sinCotizacion)                    p.sinCotizacion.push(ev);
            if (ev.origen === 'gasto' && ev.flags.sinDestino) p.gastosSinClasificar.push(ev);
        });
        movimientos.forEach(function(m) {
            if (!m.clasificado) p.movsSinClasificar.push(m);
        });
        p.total = p.sinCuenta.length + p.sinCotizacion.length
                + p.gastosSinClasificar.length + p.movsSinClasificar.length
                + p.aPagar.length;
        return p;
    }

    // ═════════════════════════════════════════════════════════════════════════
    window.FIN = {
        version: '1.0',
        SIMBOLO: SIMBOLO,
        fmtMon: fmtMon,
        fmtBRL: fmtBRL,
        aporteBRL: aporteBRL,
        fechaDe: fechaDe,
        fechaStrDe: fechaStrDe,
        cargarTodo: cargarTodo,
        filtrar: filtrar,
        totales: totales,
        saldoCuenta: saldoCuenta,
        saldosTodos: saldosTodos,
        verificacionExtracto: verificacionExtracto,
        detectarPendientes: detectarPendientes,
        enFlujo: enFlujo
    };
})();
