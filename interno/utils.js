// ============================================================
//  utils.js — Casa Verde Canas  v4.2
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.2:
//  - [FIX]   toggleNavDrop() — el panel ahora usa position:fixed
//            en lugar de absolute, lo que corrige el problema de
//            clipping cuando el nav tiene overflow:hidden o
//            position:relative. Los paneles se despliegan sobre
//            todo el contenido sin quedar cortados.
//  - [NAV]   NAV_ADMIN_ITEMS actualizado:
//            · Operaciones: agrega tareas-admin.html, pendientes.html
//            · Nuevo grupo "Fiscal": fiscal.html, acceso-contador.html
// ============================================================


// ── FIREBASE ──────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey:     'AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4',
    authDomain: 'casaverdecanas-199.firebaseapp.com',
    projectId:  'casaverdecanas-199'
};
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();


// ── CONSTANTES ────────────────────────────────────────────────────────────────
const ESTADOS_RESERVA = {
    pendiente:        { label: 'Pendiente',        cssClass: 'badge-pendiente'  },
    confirmada:       { label: 'Confirmada',        cssClass: 'badge-confirmada' },
    anulada:          { label: 'Anulada',           cssClass: 'badge-anulada'    },
    finalizada:       { label: 'Finalizada',        cssClass: 'badge-finalizada' },
    airbnb_activa:    { label: 'Airbnb',            cssClass: 'badge-neutral'    },
    airbnb_cancelada: { label: 'Cancelada Airbnb',  cssClass: 'badge-pendiente'  }
};

const ESTADOS_TAREA = {
    pendiente:  { label: 'Pendiente',  cssClass: 'badge-pendiente'  },
    en_curso:   { label: 'En curso',   cssClass: 'badge-en_curso'   },
    finalizada: { label: 'Finalizada', cssClass: 'badge-finalizada' }
};

const PRIORIDADES = {
    alta:  { label: 'Alta',  cssClass: 'badge-alta'  },
    media: { label: 'Media', cssClass: 'badge-media' },
    baja:  { label: 'Baja',  cssClass: 'badge-baja'  }
};

const ESTADOS_BLOQUEANTES = ['confirmada', 'airbnb_activa'];

const CALENDAR_IDS = {
    1: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com',
    2: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com',
    3: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com'
};


// ── BADGES ────────────────────────────────────────────────────────────────────
function badgeEstado(estado) {
    const e = ESTADOS_RESERVA[estado] || ESTADOS_TAREA[estado] || { label: estado, cssClass: 'badge-neutral' };
    return '<span class="badge ' + e.cssClass + '">' + e.label + '</span>';
}

function badgePrioridad(prioridad) {
    const p = PRIORIDADES[prioridad] || { label: prioridad, cssClass: 'badge-neutral' };
    return '<span class="badge ' + p.cssClass + '">' + p.label + '</span>';
}


// ── AUTENTICACION ─────────────────────────────────────────────────────────────
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Firebase no responde (timeout). Verifica tu conexion.'));
        }, 15000);

        auth.onAuthStateChanged(async (user) => {
            clearTimeout(timer);
            if (!user) { window.location.href = 'index.html'; return; }
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (!userDoc.exists) {
                    await auth.signOut();
                    window.location.href = 'index.html';
                    return;
                }
                const userData = userDoc.data();
                if (userData.activo === false) {
                    await auth.signOut();
                    window.location.href = 'index.html';
                    return;
                }
                if (!roles.includes(userData.rol)) {
                    window.location.href = userData.rol === 'user' ? 'tareas.html' : 'index.html';
                    return;
                }
                resolve({ user, userData });
            } catch (e) {
                console.error('verificarAuth:', e);
                reject(e);
            }
        });
    });
}

async function cerrarSesion() {
    await auth.signOut();
    window.location.href = 'index.html';
}


// ── CALCULO DE PRECIO ─────────────────────────────────────────────────────────
function calcularPrecio(cabana, checkIn, checkOut, adultos, ninos) {
    const tarifas       = cabana.tarifas || {};
    const capacidadBase = cabana.capacidad?.base || 2;
    const personasExtra = Math.max(0, (adultos + ninos) - capacidadBase);

    let subtotal = 0, noches = 0;
    let fecha    = new Date(checkIn  + 'T12:00:00');
    const fin    = new Date(checkOut + 'T12:00:00');

    while (fecha < fin) {
        const fechaStr  = fecha.toISOString().split('T')[0];
        const intervalo = (tarifas.intervalos || []).find(
            i => i.desde <= fechaStr && i.hasta >= fechaStr
        );
        subtotal += (intervalo ? intervalo.precioNoche  : (tarifas.precioBase         || 0))
                  + (intervalo ? intervalo.precioExtra  : (tarifas.precioExtraPersona || 0)) * personasExtra;
        fecha.setDate(fecha.getDate() + 1);
        noches++;
    }

    const limpieza = tarifas.precioLimpieza || 0;
    return { noches, subtotal, limpieza, total: subtotal + limpieza };
}


// ── VERIFICAR DISPONIBILIDAD ──────────────────────────────────────────────────
async function verificarDisponibilidadCabana(cabaId, checkIn, checkOut, editandoId) {
    const checkInDate  = new Date(checkIn  + 'T12:00:00');
    const checkOutDate = new Date(checkOut + 'T12:00:00');

    const snap = await db.collection('reservas')
        .where('caba',   '==', cabaId)
        .where('estado', 'in', ESTADOS_BLOQUEANTES)
        .get();

    for (const doc of snap.docs) {
        if (editandoId && doc.id === editandoId) continue;
        const r    = doc.data();
        const rIn  = r.checkIn?.toDate  ? r.checkIn.toDate()  : new Date(r.checkIn);
        const rOut = r.checkOut?.toDate ? r.checkOut.toDate() : new Date(r.checkOut);
        if (checkInDate < rOut && checkOutDate > rIn) {
            return {
                disponible: false,
                conflicto: {
                    id:       doc.id,
                    nombre:   r.nombre  || 'Sin nombre',
                    checkIn:  rIn.toISOString().slice(0, 10),
                    checkOut: rOut.toISOString().slice(0, 10),
                    estado:   r.estado
                }
            };
        }
    }
    return { disponible: true, conflicto: null };
}

function mensajeConflicto(conflicto) {
    const etiqueta = ESTADOS_RESERVA[conflicto.estado]?.label || conflicto.estado;
    const ci  = conflicto.checkIn.split('-').reverse().join('/');
    const co  = conflicto.checkOut.split('-').reverse().join('/');
    return 'Fechas no disponibles -- ya existe una reserva ('
        + etiqueta + ') del ' + ci + ' al ' + co
        + ' para ' + (conflicto.nombre !== 'Sin nombre' ? conflicto.nombre : 'otro huesped') + '.';
}


// ── SINCRONIZAR DISPONIBILIDAD PUBLICA ───────────────────────────────────────
async function sincronizarDisponibilidad(reservaId, reservaData) {
    try {
        const estado     = reservaData.estado || 'pendiente';
        const bloqueante = ESTADOS_BLOQUEANTES.includes(estado);
        const libre      = ['anulada', 'finalizada', 'airbnb_cancelada', 'pendiente'].includes(estado);
        if (libre) { await db.collection('disponibilidad').doc(reservaId).delete(); return; }
        if (bloqueante) {
            await db.collection('disponibilidad').doc(reservaId).set({
                caba:          reservaData.caba,
                checkIn:       reservaData.checkIn,
                checkOut:      reservaData.checkOut,
                estado,
                bloqueante:    true,
                origen:        reservaData.origen || 'directa',
                actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch(e) { console.warn('sincronizarDisponibilidad:', e.message); }
}


// ── SINCRONIZAR AIRBNB DESDE GOOGLE CALENDAR ─────────────────────────────────
async function sincronizarDesdeGCal(googleApiKey, cabanasCache) {
    const hoy     = new Date();
    const enUnAno = new Date(hoy);
    enUnAno.setFullYear(enUnAno.getFullYear() + 1);

    async function leerGCal(calId, cabaId) {
        if (!calId || !calId.includes('@')) return [];
        const url = 'https://www.googleapis.com/calendar/v3/calendars/'
            + encodeURIComponent(calId) + '/events'
            + '?key=' + googleApiKey
            + '&timeMin=' + hoy.toISOString()
            + '&timeMax=' + enUnAno.toISOString()
            + '&singleEvents=true&orderBy=startTime&maxResults=250';
        try {
            const res  = await fetch(url);
            if (!res.ok) { console.warn('GCal cabana ' + cabaId + ': HTTP ' + res.status); return []; }
            const data = await res.json();
            return (data.items || [])
                .filter(ev => ev.status !== 'cancelled')
                .filter(ev => {
                    const t = (ev.summary || '').toLowerCase();
                    return !t.includes('not available') && !t.includes('no disponible')
                        && !t.includes('indisponivel')  && !t.includes('unavailable');
                })
                .map(ev => ({
                    googleId: ev.id,
                    titulo:   ev.summary || 'Airbnb',
                    inicio:   ev.start.date || ev.start.dateTime?.split('T')[0],
                    fin:      ev.end.date   || ev.end.dateTime?.split('T')[0],
                    cabaId
                }));
        } catch(e) { console.warn('GCal cabana ' + cabaId + ':', e.message); return []; }
    }

    const cabanasConCal = (cabanasCache || []).filter(
        c => c.google_calendar_id && c.google_calendar_id.includes('@')
    );
    if (!cabanasConCal.length) {
        return { creadas: 0, omitidas: 0, canceladas: 0, error: 'Sin cabanas con Calendar ID configurado' };
    }

    const resultados   = await Promise.all(cabanasConCal.map(c => leerGCal(c.google_calendar_id, c.id)));
    const todosEventos = resultados.flat();

    const existSnap       = await db.collection('reservas').where('origen', '==', 'airbnb').get();
    const reservasAirbnb  = existSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const googleIdsActivos    = new Set(todosEventos.map(e => e.googleId));
    const googleIdsExistentes = new Set(reservasAirbnb.map(d => d.airbnb_google_id).filter(Boolean));

    let canceladas = 0;
    for (const res of reservasAirbnb) {
        if (!res.airbnb_google_id) continue;
        if (['airbnb_cancelada', 'anulada', 'finalizada'].includes(res.estado)) continue;
        if (!googleIdsActivos.has(res.airbnb_google_id)) {
            await db.collection('reservas').doc(res.id).update({
                estado:           'airbnb_cancelada',
                canceladaEn:      firebase.firestore.FieldValue.serverTimestamp(),
                notasCancelacion: 'Ya no figura en Google Calendar/Airbnb'
            });
            await sincronizarDisponibilidad(res.id, { estado: 'airbnb_cancelada' });
            canceladas++;
        }
    }

    let creadas = 0, omitidas = 0;
    const batch = db.batch();
    let enBatch = 0;
    const nuevasReservas = [];

    for (const ev of todosEventos) {
        if (googleIdsExistentes.has(ev.googleId)) { omitidas++; continue; }
        const ref = db.collection('reservas').doc();
        const reservaData = {
            airbnb_google_id: ev.googleId,
            origen:           'airbnb',
            estado:           'airbnb_activa',
            checkIn:  firebase.firestore.Timestamp.fromDate(new Date(ev.inicio + 'T12:00:00')),
            checkOut: firebase.firestore.Timestamp.fromDate(new Date(ev.fin    + 'T12:00:00')),
            caba:     ev.cabaId,
            nombre:   'Reserva Airbnb -- completar',
            email: '', telefono: '', adultos: 2, ninos: 0, huespedes: 2,
            totalBRL: 0,
            notas:    'Importado de Airbnb via Google Calendar. Titulo: ' + ev.titulo,
            creadoEn:  firebase.firestore.FieldValue.serverTimestamp(),
            creadoPor: 'sistema'
        };
        batch.set(ref, reservaData);
        nuevasReservas.push({ id: ref.id, data: reservaData });
        creadas++;
        enBatch++;
        if (enBatch >= 490) { await batch.commit(); enBatch = 0; }
    }
    if (enBatch > 0) await batch.commit();

    for (const r of nuevasReservas) {
        await sincronizarDisponibilidad(r.id, r.data);
    }

    return { creadas, omitidas, canceladas };
}


// ── CREAR TAREA DE LIMPIEZA ───────────────────────────────────────────────────
async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut?.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    let nombreCabana = 'Cabana ' + reservaData.caba;
    try {
        const cabSnap = await db.collection('cabanas').doc(String(reservaData.caba)).get();
        if (cabSnap.exists) {
            const cab = cabSnap.data();
            nombreCabana = cab.nombre?.es || cab.nombre?.pt || ('Cabana ' + reservaData.caba);
        }
    } catch(e) { /* fallback */ }

    let proximoHuesped = null;
    try {
        const proxSnap = await db.collection('reservas').where('caba', '==', reservaData.caba).get();
        const proxima = proxSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => {
                if (!['confirmada', 'pendiente'].includes(r.estado)) return false;
                if (r.id === reservaId) return false;
                const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
                return ci >= checkOut;
            })
            .sort((a, b) => {
                const ca = a.checkIn?.toDate ? a.checkIn.toDate() : new Date(a.checkIn);
                const cb = b.checkIn?.toDate ? b.checkIn.toDate() : new Date(b.checkIn);
                return ca - cb;
            })[0];

        if (proxima) {
            const ci = proxima.checkIn?.toDate ? proxima.checkIn.toDate() : new Date(proxima.checkIn);
            proximoHuesped = {
                nombre:         proxima.nombre         || '--',
                checkIn:        ci,
                horaLlegada:    proxima.horaLlegada    || '',
                huespedes:      proxima.huespedes || ((proxima.adultos || 0) + (proxima.ninos || 0)),
                mascotas:       proxima.mascotas        || 'no',
                niniosPequenos: proxima.niniosPequenos  || 'no',
                notas:          proxima.notas           || ''
            };
        }
    } catch(e) { console.warn('proxima reserva:', e); }

    const alertasEntrada = [];
    if (proximoHuesped?.mascotas === 'si')       alertasEntrada.push('MASCOTAS');
    if (proximoHuesped?.niniosPequenos === 'si') alertasEntrada.push('NINOS PEQUENOS');

    const alertasSalida = [];
    if (reservaData.mascotas === 'si')       alertasSalida.push('MASCOTAS');
    if (reservaData.niniosPequenos === 'si') alertasSalida.push('NINOS PEQUENOS');

    const lineas = [];

    if (proximoHuesped) {
        lineas.push('ENTRADA');
        lineas.push('   Cabana: ' + nombreCabana);
        lineas.push('   Huesped: ' + proximoHuesped.nombre);
        lineas.push('   Personas: ' + proximoHuesped.huespedes);
        lineas.push('   Llega: ' + proximoHuesped.checkIn.toLocaleDateString('es-AR')
            + (proximoHuesped.horaLlegada ? ' a las ' + proximoHuesped.horaLlegada + 'hs' : ' -- hora no confirmada'));
        if (proximoHuesped.notas) lineas.push('   Notas: ' + proximoHuesped.notas);
        if (alertasEntrada.length) lineas.push('ATENCION: ' + alertasEntrada.join(' / '));
    } else {
        lineas.push('ENTRADA');
        lineas.push('   Cabana: ' + nombreCabana);
        lineas.push('   Sin reserva siguiente registrada -- limpiar y dejar lista');
    }

    lineas.push('');
    lineas.push('SALIDA (huesped anterior)');
    lineas.push('   ' + (reservaData.nombre || '--')
        + ' / ' + (reservaData.huespedes || ((reservaData.adultos||0) + (reservaData.ninos||0))) + ' personas');
    lineas.push('   Sale: ' + checkOut.toLocaleDateString('es-AR')
        + (reservaData.horaSalida ? ' a las ' + reservaData.horaSalida + 'hs' : ''));
    if (reservaData.notas) lineas.push('   Notas salida: ' + reservaData.notas);
    if (alertasSalida.length) lineas.push('SALIDA con: ' + alertasSalida.join(' / '));

    lineas.push('');
    lineas.push('Monto limpieza: R$ ' + (reservaData.costoLimpiezaBRL || 0));

    await db.collection('tareas').add({
        nombre:      'Limpiar ' + nombreCabana + ' -- ' + (reservaData.nombre || 'sin nombre'),
        descripcion: lineas.join('\n'),
        tipo:        'limpieza',
        prioridad:   'alta',
        estado:      'pendiente',
        fechaInicio: checkOut.toISOString().split('T')[0],
        recurrencia: 0,
        monto:       reservaData.costoLimpiezaBRL || 0,
        activa:      true,
        reservaId,
        cabana:      reservaData.caba,
        sesionesActivas: [],
        creadoEn:    firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor:   creadoPor || null
    });
}


// ── LOGICA DE TAREAS — SUBCOLECCION ──────────────────────────────────────────
async function iniciarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');
    const todasSnap = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const yaAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (yaAbierta) throw new Error('Ya tenes una sesion activa en esta tarea');
    const ahora = firebase.firestore.Timestamp.now();
    await sesionesRef.add({ uid: currentUser.uid, nombre: currentUser.nombre || currentUser.email, inicio: ahora, fin: null, tareaId });
    const sesActuales = (tarea.sesionesActivas || []);
    sesActuales.push({ uid: currentUser.uid, nombre: currentUser.nombre || currentUser.email, inicio: ahora });
    await tareaRef.update({ estado: 'en_curso', sesionesActivas: sesActuales });
}

async function pausarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    if (tareaDoc.data().estado === 'finalizada') throw new Error('La tarea ya fue finalizada');
    const todasSnap  = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (!sesAbierta) throw new Error('No tenes una sesion activa en esta tarea');
    const ahora = firebase.firestore.Timestamp.now();
    await sesAbierta.ref.update({ fin: ahora });
    const todasSnap2     = await sesionesRef.get();
    const quedanAbiertas = todasSnap2.docs.some(d => d.data().fin === null);
    const sesActuales    = (tareaDoc.data().sesionesActivas || []).filter(s => s.uid !== currentUser.uid);
    await tareaRef.update({ estado: quedanAbiertas ? 'en_curso' : 'pendiente', sesionesActivas: sesActuales });
}

async function finalizarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');
    const ahora     = firebase.firestore.Timestamp.now();
    const ahoraDate = ahora.toDate();
    const sesSnap   = await sesionesRef.get();
    let sesiones    = sesSnap.docs.map(d => ({ _ref: d.ref, ...d.data() }));
    // Si quien finaliza nunca cronometró, agregar sesión de 0h para que quede como responsable
    if (!sesiones.some(s => s.uid === currentUser.uid)) {
        const ref = await sesionesRef.add({
            uid: currentUser.uid, nombre: currentUser.nombre || currentUser.email,
            inicio: ahora, fin: ahora, tareaId, sinCronometro: true
        });
        sesiones.push({ _ref: ref, uid: currentUser.uid,
            nombre: currentUser.nombre || currentUser.email,
            inicio: ahora, fin: ahora, sinCronometro: true });
    }
    const b1 = db.batch();
    for (const s of sesiones) { if (s.fin === null) { b1.update(s._ref, { fin: ahora }); s.fin = ahora; } }
    await b1.commit();
    const horasPor  = {};
    const nombrePor = {};
    for (const s of sesiones) {
        const ini = s.inicio?.toDate ? s.inicio.toDate() : new Date(s.inicio);
        const fin = s.fin?.toDate    ? s.fin.toDate()    : new Date(s.fin);
        const hrs = Math.max(0, (fin - ini) / 3600000);
        horasPor[s.uid]  = (horasPor[s.uid]  || 0) + hrs;
        nombrePor[s.uid] = s.nombre;
    }
    const totalHoras    = Object.values(horasPor).reduce((a, b) => a + b, 0);
    const monto         = tarea.monto || 0;
    const colaboradores = Object.entries(horasPor).map(([uid, horas]) => ({
        uid, nombre: nombrePor[uid], horas: parseFloat(horas.toFixed(2)),
        montoRecibido: monto > 0 && totalHoras > 0 ? parseFloat(((horas / totalHoras) * monto).toFixed(2)) : 0
    }));
    const b2      = db.batch();
    const histRef = db.collection('historial_tareas').doc();
    b2.set(histRef, {
        tareaId, nombre: tarea.nombre, descripcion: tarea.descripcion || '', tipo: tarea.tipo || 'general',
        prioridad: tarea.prioridad || 'media', fechaInicio: tarea.fechaInicio || null,
        fechaFin: ahoraDate.toISOString().split('T')[0], monto, totalHoras: parseFloat(totalHoras.toFixed(2)),
        colaboradores, reservaId: tarea.reservaId || null, cabana: tarea.cabana || null,
        recurrencia: tarea.recurrencia || 0,
        finalizadoPor: currentUser.uid,
        finalizadoNombre: currentUser.nombre || currentUser.email,
        finalizadoEn: ahora, creadoEn: tarea.creadoEn || null
    });
    if (monto > 0) {
        for (const col of colaboradores) {
            if (col.montoRecibido <= 0) continue;
            const hRef = db.collection('honorarios').doc();
            b2.set(hRef, {
                colaboradorId: col.uid, colaboradorNombre: col.nombre, tareaId, historialId: histRef.id,
                reservaId: tarea.reservaId || null, monto: col.montoRecibido, moneda: 'BRL',
                concepto: 'Tarea: ' + tarea.nombre + ' -- ' + ahoraDate.toLocaleDateString('es-AR'),
                horas: col.horas, estado: 'pendiente', fechaPago: null, pagadoPor: null, creadoEn: ahora
            });
        }
    }
    const recurrencia = tarea.recurrencia || 0;
    if (recurrencia === 0) { b2.delete(tareaRef); }
    else {
        const nuevaFecha = new Date(ahoraDate);
        nuevaFecha.setDate(nuevaFecha.getDate() + recurrencia);
        b2.update(tareaRef, { estado: 'pendiente', sesionesActivas: [], fechaInicio: nuevaFecha.toISOString().split('T')[0], ultimaVez: ahora });
    }
    await b2.commit();
    if (recurrencia > 0) {
        const b3 = db.batch();
        for (const s of sesiones) b3.delete(s._ref);
        await b3.commit();
    }
    return colaboradores;
}


// ── HISTORIAL DE CUMPLIMIENTOS DE TAREA ──────────────────────────────────────
async function getHistorialTareas(tareaId) {
    try {
        const snap = await db.collection('historial_tareas')
            .where('tareaId', '==', tareaId).orderBy('finalizadoEn', 'desc').get();
        const registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (registros.length === 0) return { totalVeces: 0, ultimaVez: null, porUsuario: [], resumen: { totalHoras: 0, totalMonto: 0, colaboradoresUnicos: 0 } };
        const porUid = {};
        let totalHoras = 0, totalMonto = 0;
        const colaboradoresUnicos = new Set();
        for (const reg of registros) {
            for (const col of (reg.colaboradores || [])) {
                colaboradoresUnicos.add(col.uid);
                if (!porUid[col.uid]) porUid[col.uid] = { nombre: col.nombre, veces: 0, horasTotal: 0, montoTotal: 0, ultimaVez: null };
                porUid[col.uid].veces      += 1;
                porUid[col.uid].horasTotal += col.horas || 0;
                porUid[col.uid].montoTotal += col.montoRecibido || 0;
                const fe = reg.finalizadoEn?.toDate ? reg.finalizadoEn.toDate() : new Date(reg.finalizadoEn);
                if (!porUid[col.uid].ultimaVez || fe > porUid[col.uid].ultimaVez) porUid[col.uid].ultimaVez = fe;
            }
            totalHoras += reg.totalHoras || 0;
            totalMonto += reg.monto || 0;
        }
        return {
            totalVeces: registros.length,
            ultimaVez: registros[0]?.finalizadoEn?.toDate ? registros[0].finalizadoEn.toDate() : null,
            porUsuario: Object.values(porUid).sort((a, b) => b.veces - a.veces),
            resumen: { totalHoras: parseFloat(totalHoras.toFixed(2)), totalMonto: parseFloat(totalMonto.toFixed(2)), colaboradoresUnicos: colaboradoresUnicos.size }
        };
    } catch (e) {
        console.warn('getHistorialTareas:', e.message);
        return { totalVeces: 0, ultimaVez: null, porUsuario: [], resumen: { totalHoras: 0, totalMonto: 0, colaboradoresUnicos: 0 } };
    }
}


// ── URGENCIA DE TAREA ─────────────────────────────────────────────────────────
function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };
    if (tarea.estado === 'en_curso') return { color: 'verde', label: 'En curso' };
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio     = new Date(tarea.fechaInicio + 'T00:00:00');
    const diasAtraso = Math.floor((hoy - inicio) / 86400000);
    if (diasAtraso < 0)   return { color: 'gris',     label: 'Proximamente'       };
    if (diasAtraso === 0) return { color: 'verde',    label: 'Hoy'                };
    const ciclo = tarea.recurrencia > 0 ? tarea.recurrencia : 3;
    if (diasAtraso > ciclo || diasAtraso > 10) return { color: 'rojo', label: diasAtraso + 'd de atraso' };
    return { color: 'amarillo', label: diasAtraso + 'd de atraso' };
}


// ── HELPERS DE FORMATO ────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

function formatFecha(timestamp) {
    if (!timestamp) return '--';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('es-AR');
}

function formatFechaHora(timestamp) {
    if (!timestamp) return '--';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleString('es-AR');
}

function formatHoras(horas) {
    if (!horas || horas <= 0) return '0m';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'm';
}

const COLORES_CABANAS = ['#FF9800', '#3498db', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c'];
function colorCabana(index) { return COLORES_CABANAS[index % COLORES_CABANAS.length]; }


// ── HELPERS DE UI ─────────────────────────────────────────────────────────────
function showLoading(container, mensaje) {
    mensaje = mensaje || 'Cargando...';
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-loading"><div class="spinner"></div><span>' + escapeHtml(mensaje) + '</span></div>';
}

function showEmpty(container, titulo, descripcion, icono) {
    titulo = titulo || 'Sin datos'; descripcion = descripcion || ''; icono = icono || 'inbox';
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-empty"><span class="material-icons">' + escapeHtml(icono) + '</span>'
        + '<div class="state-empty__title">' + escapeHtml(titulo) + '</div>'
        + (descripcion ? '<div class="state-empty__desc">' + escapeHtml(descripcion) + '</div>' : '')
        + '</div>';
}

function showError(container, titulo, descripcion, onRetry) {
    titulo = titulo || 'Ocurrio un error'; descripcion = descripcion || '';
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const retryId = onRetry ? 'retry-' + Date.now() : null;
    el.innerHTML = '<div class="state-error"><span class="material-icons">error_outline</span>'
        + '<div class="state-error__title">' + escapeHtml(titulo) + '</div>'
        + (descripcion ? '<div class="state-error__desc">' + escapeHtml(descripcion) + '</div>' : '')
        + (retryId ? '<button class="btn btn-secondary" id="' + retryId + '"><span class="material-icons">refresh</span> Reintentar</button>' : '')
        + '</div>';
    if (retryId) document.getElementById(retryId).addEventListener('click', onRetry);
}

function showToast(mensaje, tipo) {
    tipo = tipo || 'success';
    const iconos = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    let wrap = document.getElementById('cvc-toasts');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'cvc-toasts';
        wrap.className = 'toast-container';
        document.body.appendChild(wrap);
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.innerHTML = '<span class="material-icons">' + (iconos[tipo] || 'info') + '</span><span>' + escapeHtml(mensaje) + '</span>';
    wrap.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3300);
}


// ── NAV CENTRALIZADA v4.2 ─────────────────────────────────────────────────────
const NAV_ADMIN_ITEMS = [
    { href: 'dashboard.html',    icon: 'dashboard',      label: 'Dashboard'  },
    { href: 'calendario.html',   icon: 'calendar_month', label: 'Calendario' },
    {
        group: 'Reservas', icon: 'event',
        items: [
            { href: 'reservas.html',     icon: 'event',         label: 'Reservas'     },
            { href: 'presupuestos.html', icon: 'request_quote', label: 'Presupuestos' },
            { href: 'clientes.html',     icon: 'people',        label: 'Clientes'     },
        ]
    },
    {
        group: 'Finanzas', icon: 'payments',
        items: [
            { href: 'panel-financiero.html', icon: 'monitoring',      label: 'Panel financiero'   },
            { sep: true },
            { href: 'pagos.html',            icon: 'payments',        label: 'Ingresos / Egresos' },
            { href: 'informes-airbnb.html',  icon: 'summarize',       label: 'Informes Airbnb'    },
            { sep: true },
            { href: 'cuentas.html',          icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',      icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'herramientas-btg.html', icon: 'compare_arrows',  label: 'BTG / Conciliacion' },
            { href: 'categorias.html',       icon: 'label',           label: 'Categorias'         },
        ]
    },
    {
        group: 'Operaciones', icon: 'checklist',
        items: [
            { href: 'tareas.html',       icon: 'checklist',       label: 'Tareas'        },
            { href: 'tareas-admin.html', icon: 'manage_search',   label: 'Admin tareas'  },
            { sep: true },
            { href: 'pendientes.html',   icon: 'pending_actions', label: 'Pendientes'    },
        ]
    },
    {
        group: 'Fiscal', icon: 'receipt',
        items: [
            { href: 'fiscal.html',          icon: 'calculate', label: 'Panel fiscal'    },
            { href: 'acceso-contador.html', icon: 'vpn_key',   label: 'Acceso contador' },
        ]
    },
    {
        group: 'Config.', icon: 'settings',
        items: [
            { href: 'cabanas-admin.html',  icon: 'cottage',         label: 'Cabanas'  },
            { href: 'usuarios.html',       icon: 'manage_accounts', label: 'Usuarios' },
            { sep: true },
            { href: 'manual-sistema.html', icon: 'menu_book',       label: 'Manual'   },
        ]
    }
];

const NAV_USER_ITEMS = [
    { href: 'tareas.html',         icon: 'checklist', label: 'Tareas'     },
    { href: 'pagos.html',          icon: 'payments',  label: 'Mis cobros' },
    { href: 'manual-sistema.html', icon: 'menu_book', label: 'Manual'     }
];

function renderNav(paginaActiva, rol) {
    rol = rol || 'admin';
    const el = document.getElementById('appNav') || document.querySelector('.admin-nav');
    if (!el) return;
    const items = rol === 'admin' ? NAV_ADMIN_ITEMS : NAV_USER_ITEMS;
    el.innerHTML = items.map(function(item, gi) {
        if (item.href) {
            const activo = item.href === paginaActiva;
            return '<a href="' + item.href + '" class="nav-item' + (activo ? ' active' : '') + '">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
        }
        if (item.group) {
            const grupoId     = 'navdrop-' + gi;
            const tieneActivo = (item.items || []).some(function(sub) {
                return sub.href && (sub.href === paginaActiva || sub.href.replace('.html', '') === paginaActiva);
            });
            const panelItems = (item.items || []).map(function(sub) {
                if (sub.sep) return '<div class="nav-dropdown__sep"></div>';
                const esActivo = sub.href === paginaActiva || sub.href.replace('.html', '') === paginaActiva;
                return '<a href="' + sub.href + '" class="nav-dropdown__item' + (esActivo ? ' active' : '') + '">'
                    + '<span class="material-icons">' + sub.icon + '</span> ' + sub.label + '</a>';
            }).join('');
            return '<div class="nav-dropdown' + (tieneActivo ? ' has-active' : '') + '" id="' + grupoId + '">'
                + '<button class="nav-dropdown__trigger" onclick="toggleNavDrop(event,\'' + grupoId + '\')">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.group
                + '<span class="material-icons nav-arrow">expand_more</span>'
                + '</button>'
                + '<div class="nav-dropdown__panel">' + panelItems + '</div>'
                + '</div>';
        }
        return '';
    }).join('');
    document.removeEventListener('click', _cerrarDropdowns);
    document.addEventListener('click', _cerrarDropdowns);
}

// ── FIX v4.2: position:fixed para que el panel no quede cortado ───────────────
function toggleNavDrop(e, id) {
    e.stopPropagation();
    const dropEl = document.getElementById(id);
    if (!dropEl) return;
    const estaAbierto = dropEl.classList.contains('open');
    // Cerrar todos
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.cssText = ''; }
    });
    if (estaAbierto) return;
    const trigger = dropEl.querySelector('.nav-dropdown__trigger');
    const panel   = dropEl.querySelector('.nav-dropdown__panel');
    const rect    = trigger.getBoundingClientRect();
    // Fixed: coordenadas relativas al viewport
    panel.style.position = 'fixed';
    panel.style.top      = (rect.bottom + 4) + 'px';
    panel.style.left     = rect.left + 'px';
    panel.style.right    = 'auto';
    panel.style.zIndex   = '9999';
    dropEl.classList.add('open');
    // Corrección si se sale por la derecha
    requestAnimationFrame(function() {
        const pr = panel.getBoundingClientRect();
        if (pr.right > window.innerWidth - 8) {
            panel.style.left  = 'auto';
            panel.style.right = '8px';
        }
    });
}

function _cerrarDropdowns() {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.cssText = ''; }
    });
}

window.toggleNavDrop    = toggleNavDrop;
window._cerrarDropdowns = _cerrarDropdowns;


// ── BTG: categorías automáticas ───────────────────────────────────────────────
const BTG_CATEGORIAS = [
    { palabras: ['airbnb', 'air bnb'],                   cat: 'Airbnb',             etiqueta: 'Liquidación Airbnb'   },
    { palabras: ['celesc', 'energia', 'energía'],         cat: 'Luz (Celesc)',       etiqueta: ''                     },
    { palabras: ['casan', 'agua', 'saneamento'],          cat: 'Agua (Casan)',       etiqueta: ''                     },
    { palabras: ['internet', 'claro', 'vivo', 'tim'],     cat: 'Internet',           etiqueta: ''                     },
    { palabras: ['gas', 'ultragaz', 'liquigas'],          cat: 'Gas',                etiqueta: ''                     },
    { palabras: ['iptu'],                                  cat: 'IPTU',               etiqueta: ''                     },
    { palabras: ['limpeza', 'limpieza', 'faxina'],        cat: 'Honorarios limpieza',etiqueta: ''                     },
    { palabras: ['supermercado', 'mercado', 'atacadao', 'bistek', 'angeloni'], cat: 'Insumos limpieza', etiqueta: '' },
    { palabras: ['farmacia', 'farmácia', 'drogaria'],     cat: 'Amenities / baño',   etiqueta: ''                     },
    { palabras: ['construção', 'construcao', 'leroy', 'telhanorte', 'materiais'], cat: 'Materiales', etiqueta: ''    },
    { palabras: ['pix enviado', 'ted', 'transferencia', 'transf'], cat: 'Entre cuentas propias', etiqueta: 'Verificar destino' },
];

function inferirCategoria(descripcion) {
    if (!descripcion) return { cat: null, etiqueta: '' };
    const desc = descripcion.toLowerCase();
    for (const regla of BTG_CATEGORIAS) {
        if (regla.palabras.some(p => desc.includes(p))) {
            return { cat: regla.cat, etiqueta: regla.etiqueta };
        }
    }
    return { cat: null, etiqueta: '' };
}

function fingerprintMovimiento(fecha, monto, descripcion) {
    const montoStr = Math.abs(monto || 0).toFixed(2);
    const descStr  = (descripcion || '').slice(0, 20).toLowerCase().replace(/\s+/g, '');
    return fecha + '|' + montoStr + '|' + descStr;
}

async function conciliarMovimientos(movimientos, cuentaId) {
    const fechas = [...new Set(movimientos.map(m => m.fecha))].filter(Boolean);
    if (!fechas.length) return movimientos.map(m => ({ ...m, estado: 'nuevo' }));
    const CHUNK = 30;
    const existentes = [];
    for (let i = 0; i < fechas.length; i += CHUNK) {
        const lote = fechas.slice(i, i + CHUNK);
        const snap = await db.collection('movimientos')
            .where('cuentaId', '==', cuentaId)
            .where('fecha',    'in',  lote)
            .get();
        snap.docs.forEach(d => existentes.push({ id: d.id, ...d.data() }));
    }
    return movimientos.map(m => {
        const fp = fingerprintMovimiento(m.fecha, m.monto, m.descripcion);
        const dupExacto = existentes.find(e =>
            e.fecha === m.fecha &&
            Math.abs(e.monto - m.monto) < 0.01 &&
            (e.descripcion || '').slice(0,20).toLowerCase().replace(/\s+/g,'') === (m.descripcion || '').slice(0,20).toLowerCase().replace(/\s+/g,'')
        );
        const posibleDup = !dupExacto && existentes.find(e =>
            e.fecha === m.fecha && Math.abs(e.monto - m.monto) < 0.01
        );
        return { ...m, fingerprint: fp, estado: dupExacto ? 'duplicado' : posibleDup ? 'posible_duplicado' : 'nuevo' };
    });
}

async function importarMovimientosConfirmados(movimientos, opciones) {
    const { cuentaId, moneda, importadoPor } = opciones;
    const CHUNK = 400;
    let importados = 0, saltados = 0;
    for (let i = 0; i < movimientos.length; i += CHUNK) {
        const batch = db.batch();
        movimientos.slice(i, i + CHUNK).forEach(m => {
            if (m.estado === 'duplicado') { saltados++; return; }
            const ref = db.collection('movimientos').doc();
            batch.set(ref, {
                cuentaId, moneda,
                fecha: m.fecha, descripcion: m.descripcion, monto: m.monto,
                tipo: m.tipo || (m.monto >= 0 ? 'credito' : 'debito'),
                saldoPost: m.saldoPost || null,
                categoriaId: null, etiqueta: '', reservaId: null, tareaId: null, pixId: '',
                conciliado: false, conciliadoNivel: null, conciliadoConId: null, conciliadoConCol: null,
                importadoEn:  firebase.firestore.FieldValue.serverTimestamp(),
                importadoPor
            });
            importados++;
        });
        await batch.commit();
    }
    return { importados, saltados };
}



// ── VERIFICAR TAREA — no era necesaria ───────────────────────────────────────
//
// Registra que la tarea fue revisada y no necesitaba realizarse.
// Crea entrada en historial_tareas con tipo 'verificada' y monto 0.
// La tarea vuelve a pendiente con la fecha de inicio actualizada al día siguiente
// (para que no aparezca inmediatamente como urgente de nuevo).

async function verificarTarea(tareaId, currentUser, nota) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const ahora = firebase.firestore.Timestamp.now();

    // Guardar en historial con tipo 'verificada'
    await db.collection('historial_tareas').add({
        tareaId,
        nombre:        tarea.nombre || '',
        tipo:          tarea.tipo   || '',
        tipoRegistro:  'verificada',
        nota:          nota || 'No era necesaria',
        colaboradores: [{
            uid:    currentUser.uid,
            nombre: currentUser.nombre || currentUser.email,
            horas:  0,
            monto:  0,
            esVerificador: true
        }],
        totalHoras:     0,
        totalMonto:     0,
        moneda:        'BRL',
        finalizadoEn:  ahora,
        finalizadoNombre: currentUser.nombre || currentUser.email,
        finalizadoPor: currentUser.uid
    });

    // Avanzar la fecha de inicio al día siguiente del ciclo
    // para que no aparezca inmediatamente como urgente
    const hoy          = new Date(); hoy.setHours(0,0,0,0);
    const ciclo        = tarea.recurrencia > 0 ? tarea.recurrencia : 7;
    const nuevaFecha   = new Date(hoy);
    nuevaFecha.setDate(nuevaFecha.getDate() + ciclo);
    const nuevaFechaStr = nuevaFecha.toISOString().split('T')[0];

    await tareaRef.update({
        estado:          'pendiente',
        sesionesActivas: [],
        fechaInicio:     nuevaFechaStr,
        ultimaVerificacion: ahora,
        ultimoVerificador:  currentUser.uid
    });
}

// ── MOTOR DE AUTO-CONCILIACIÓN ────────────────────────────────────────────────
const _CONCIL_DEFAULTS = {
    palabrasClaveAirbnb:  ['AIRBNB', 'AIR BNB', 'AIRBNB PAYMENTS', 'Airbnb'],
    toleranciaMontoPctA:  0.005,
    toleranciaMontoPctB:  0.02,
    toleranciaFechaDiasA: 3,
    toleranciaFechaDiasB: 7,
};
let _configConciliacion = null;

async function cargarConfigConciliacion() {
    if (_configConciliacion) return _configConciliacion;
    try {
        const snap = await db.collection('config').doc('conciliacion').get();
        _configConciliacion = snap.exists ? { ..._CONCIL_DEFAULTS, ...snap.data() } : { ..._CONCIL_DEFAULTS };
    } catch (e) { _configConciliacion = { ..._CONCIL_DEFAULTS }; }
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
    const montoBanco = Math.abs(movBanco.monto);
    const esCreditoBanco = movBanco.monto >= 0;
    let mejorMatch = null, mejorNivel = 'C', mejorConfianza = 0;
    let mejorRazon = 'Sin coincidencia en el sistema';
    for (const reg of registros) {
        const fechaReg = _toDateStr(reg.fecha || reg.creadoEn);
        const montoReg = Math.abs(reg.monto || reg.total_neto || 0);
        if (!montoReg) continue;
        const esCreditoReg = reg._coleccion === 'pagos' || reg._coleccion === 'informes_airbnb';
        if (esCreditoBanco !== esCreditoReg) continue;
        const difMonto  = montoReg > 0 ? Math.abs(montoBanco - montoReg) / montoReg : 1;
        const difDias   = _diasDiferencia(movBanco.fecha, fechaReg);
        const nombreRef = reg.clienteNombre || reg.proveedor || reg.anfitrion || '';
        const origenOk  = _esAirbnb(movBanco.descripcion, palabrasClaveAirbnb) ||
                          _descripcionContiene(movBanco.descripcion, nombreRef);
        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasA && origenOk) {
            const c = 1.0 - (difMonto * 10) - (difDias * 0.02);
            if (c > mejorConfianza) { mejorMatch = reg; mejorNivel = 'A'; mejorConfianza = c;
                mejorRazon = 'Monto ±' + (difMonto*100).toFixed(2) + '% · Fecha ±' + difDias + 'd · Origen reconocido'; }
            continue;
        }
        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasB) {
            const c = 0.8 - (difDias * 0.03);
            if (c > mejorConfianza) { mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = c;
                mejorRazon = 'Monto exacto · Fecha ±' + difDias + 'd (fuera ventana A)'; }
        } else if (difMonto <= toleranciaMontoPctB && difDias <= toleranciaFechaDiasB && origenOk) {
            const c = 0.65 - (difMonto * 5) - (difDias * 0.02);
            if (c > mejorConfianza) { mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = c;
                mejorRazon = 'Monto ±' + (difMonto*100).toFixed(2) + '% · Fecha ±' + difDias + 'd · Origen reconocido'; }
        }
    }
    return { nivel: mejorNivel, confianza: Math.max(0, Math.min(1, mejorConfianza)),
             registro: mejorMatch, coleccion: mejorMatch?._coleccion || null, razon: mejorRazon };
}

async function conciliarContraRegistros(movimientos, cuentaId) {
    const config = await cargarConfigConciliacion();
    const fechas = movimientos.map(m => m.fecha).filter(Boolean).sort();
    if (!fechas.length) return movimientos;
    const desde = new Date(fechas[0]);
    const hasta = new Date(fechas[fechas.length - 1]);
    desde.setDate(desde.getDate() - 8); hasta.setDate(hasta.getDate() + 8);
    const desdeFmt = desde.toISOString().slice(0, 10);
    const hastaFmt = hasta.toISOString().slice(0, 10);
    const [pagosSnap, gastosSnap, informesSnap] = await Promise.all([
        db.collection('pagos').where('fecha','>=',desdeFmt).where('fecha','<=',hastaFmt).get(),
        db.collection('gastos').where('fecha','>=',desdeFmt).where('fecha','<=',hastaFmt).get(),
        db.collection('informes_airbnb').where('fecha','>=',desdeFmt).where('fecha','<=',hastaFmt).get().catch(()=>({docs:[]})),
    ]);
    const registros = [
        ...pagosSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'pagos' })),
        ...gastosSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'gastos' })),
        ...informesSnap.docs.map(d => ({ ...d.data(), _id: d.id, _coleccion: 'informes_airbnb' })),
    ];
    return movimientos.map(mov => {
        if (mov.estado === 'duplicado')
            return { ...mov, matchResultado: { nivel: 'DUP', confianza: 1, registro: null, razon: 'Duplicado exacto ya importado' } };
        return { ...mov, matchResultado: matchMovimientoBancario(mov, registros, config) };
    });
}

async function guardarConciliacion(movimientoId, matchResultado, confirmadoPor) {
    const { nivel, registro, coleccion, razon, confianza } = matchResultado;
    if (!movimientoId || nivel === 'C' || nivel === 'DUP') return;
    await db.collection('movimientos').doc(movimientoId).update({
        conciliado: true, conciliadoNivel: nivel,
        conciliadoConId: registro?._id || null, conciliadoConCol: coleccion || null,
        conciliadoRazon: razon, conciliadoConfianza: confianza,
        conciliadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        conciliadoPor: nivel === 'A' ? 'auto' : (confirmadoPor || 'manual'),
    });
}

// ── COMPROBANTES — Cloudinary (upload sin firma) ──────────────────────────────
//
// Comprime la imagen en el cliente (max 1200px, calidad 0.75) y la sube
// a Cloudinary via fetch usando un upload preset unsigned.
// Devuelve la URL segura (https) del archivo subido.
//
// Cloud name:  dnwfu8ffn
// Upload preset: preset-comprobantes (Unsigned)
// Carpeta en Cloudinary: comprobantes/{anio}/{mes}
//
// NO requiere firebase-storage.js ni plan Blaze.
// NO requiere API Secret — upload preset unsigned es suficiente.

var _CVC_CLOUDINARY_CLOUD  = 'dnwfu8ffn';
var _CVC_CLOUDINARY_PRESET = 'preset-comprobantes';

async function subirComprobante(file, coleccion, docId) {
    if (!file) return null;

    // Comprimir en canvas antes de subir (max 1200px, calidad 0.75)
    var comprimida = await new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var MAX = 1200;
                var w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else       { w = Math.round(w * MAX / h); h = MAX; }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(resolve, 'image/jpeg', 0.75);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    if (!comprimida) throw new Error('No se pudo comprimir la imagen');

    // Nombre de archivo: coleccion_docId_timestamp.jpg
    var ahora    = new Date();
    var anio     = ahora.getFullYear();
    var mes      = String(ahora.getMonth() + 1).padStart(2, '0');
    var publicId = 'comprobantes/' + anio + '/' + mes + '/' + coleccion + '_' + docId;

    // Subir a Cloudinary via fetch (no requiere SDK)
    var formData = new FormData();
    formData.append('file',         comprimida);
    formData.append('upload_preset', _CVC_CLOUDINARY_PRESET);
    formData.append('public_id',     publicId);
    formData.append('folder',        'comprobantes/' + anio + '/' + mes);

    var response = await fetch(
        'https://api.cloudinary.com/v1_1/' + _CVC_CLOUDINARY_CLOUD + '/image/upload',
        { method: 'POST', body: formData }
    );

    if (!response.ok) {
        var errText = await response.text();
        throw new Error('Cloudinary error ' + response.status + ': ' + errText);
    }

    var result = await response.json();
    return result.secure_url;
}

function abrirComprobante(url) {
    if (!url) return;
    var modal = document.getElementById('_comprobanteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = '_comprobanteModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
        modal.innerHTML = '<img id="_comprobanteImg" style="max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,0.5);">';
        modal.addEventListener('click', function() { modal.style.display = 'none'; });
        document.body.appendChild(modal);
    }
    document.getElementById('_comprobanteImg').src = url;
    modal.style.display = 'flex';
}


// ── AYUDA CONTEXTUAL — tooltip por sección del manual ────────────────────────
//
// Uso en cualquier página:
//   CVC.initAyuda()  — llamar una vez después de renderNav()
//
// Cada item del NAV puede tener una propiedad `ayuda` con:
//   { titulo, resumen, seccionManual }
//   seccionManual: id del <h2> o <details> en el manual (para link directo)

// AYUDA_ITEMS — cargado desde Firestore (config/ayuda)
// El objeto se hidrata al primer llamado a mostrarAyuda()
// Puede editarse desde la consola Firebase sin redeploy
//
// Estructura en Firestore:
//   config/ayuda  →  { items: { "pagina.html": { titulo, resumen, detalle } } }
//
// Fallback: textos por defecto para cuando Firestore no responde

var AYUDA_ITEMS = {
    'dashboard.html':        { titulo: 'Dashboard', resumen: 'Resumen general del complejo. Muestra KPIs, alertas, check-ins próximos, pendientes urgentes, tareas atrasadas, reservas sin confirmar y presupuestos sin seña. Cada tarjeta es clickeable y lleva a la sección correspondiente.' },
    'calendario.html':       { titulo: 'Calendario', resumen: 'Vista mensual de todas las reservas por cabaña. Los bloques de color indican ocupación. Tocá un día para ver el detalle o crear una reserva.' },
    'reservas.html':         { titulo: 'Reservas', resumen: 'Gestión completa de reservas directas y de Airbnb. Podés confirmar, editar fechas, registrar pagos y crear tareas de limpieza asociadas. Las reservas pendientes requieren confirmación manual.' },
    'presupuestos.html':     { titulo: 'Presupuestos', resumen: 'Creá y enviá presupuestos a potenciales huéspedes. El sistema calcula el precio automáticamente según tarifas y temporada. Podés editar el precio final con el botón ✏️ para aplicar descuentos o precios especiales.' },
    'clientes.html':         { titulo: 'Clientes', resumen: 'Directorio de huéspedes con historial de reservas. Se completa automáticamente al confirmar una reserva.' },
    'panel-financiero.html': { titulo: 'Panel Financiero', resumen: 'Vista consolidada de todas las cuentas con balance por período. Elegí rango de fechas con los atajos (Este mes / Mes anterior / Este año / Todo) y verás ingresos, egresos, retiros y flujo neto por cuenta y por socio. También muestra movimientos sin conciliar y gastos sin comprobante.' },
    'pagos.html':            { titulo: 'Ingresos y Egresos', resumen: 'Registrá cobros a huéspedes (tab Ingresos), gastos con foto de comprobante (tab Egresos), retiros personales (tab Retiros y personal) y honorarios. Los gastos se clasifican por circuito: Fiscal (Casa Verde, va al IRPF), Personal (fondos propios, no declarable) o Mixto (parte fiscal + parte personal con slider).' },
    'informes-airbnb.html':  { titulo: 'Informes Airbnb', resumen: 'Importá los PDFs de liquidación de Airbnb. La IA extrae automáticamente los datos de cada reserva, comisiones y monto neto depositado. Los informes se cruzan con los extractos BTG en la conciliación.' },
    'cuentas.html':          { titulo: 'Cuentas', resumen: 'Administración de cuentas bancarias (BTG Mauro, BTG Flor y otras). Muestra saldo actual y permite actualizar manualmente.' },
    'movimientos.html':      { titulo: 'Movimientos', resumen: 'Extracto completo de movimientos importados desde el banco. Podés categorizar, filtrar y buscar. Los movimientos sin conciliar aparecen destacados.' },
    'herramientas-btg.html': { titulo: 'BTG / Conciliación', resumen: 'Flujo: 1) Importar texto del extracto BTG. 2) Auto-conciliar — el sistema cruza automáticamente contra pagos, gastos, informes Airbnb y retiros registrados. 3) Confirmar sugeridos (Nivel B). 4) Registrar los sin correlativo (Nivel C). Cuando el 100% está explicado, la base fiscal es confiable.' },
    'categorias.html':       { titulo: 'Categorías', resumen: 'Define y edita las categorías de movimientos bancarios. Se usan en la pestaña Categorizar de Herramientas BTG.' },
    'tareas.html':           { titulo: 'Tareas', resumen: 'Tocá una tarea para ver el detalle. Botones: INICIAR (empieza cronómetro, los botones cambian sin salir de la pantalla), PAUSAR, FINALIZAR (calcula horas y genera honorario), OK/NO NECESARIA (registra que revisaste y no hacía falta hacerla, sin honorario). La tarea permanece visible mientras trabajás en ella.' },
    'tareas-admin.html':     { titulo: 'Gestión de Tareas', resumen: 'Vista administrativa: creá tareas, asignales prioridad y fecha, revisá el historial de quién hizo qué. Tocá cualquier fila de tarea para ver su historial completo en la pestaña siguiente. El historial muestra tanto tareas realizadas como verificadas (OK/No necesaria).' },
    'pendientes.html':       { titulo: 'Pendientes', resumen: 'Lista de cosas por hacer sin cronómetro. El semáforo indica urgencia: Rojo=Urgente, Amarillo=Atención, Verde=Normal. El botón ▶ inicia un cronómetro para ese pendiente — el tiempo queda registrado en el historial de tareas junto con las tareas normales.' },
    'fiscal.html':           { titulo: 'Panel Fiscal', resumen: 'Flujo mensual: 1) Verificar ingresos y gastos deducibles del mes. 2) Calcular IRPF estimado. 3) Pagar el DARF en el banco. 4) Registrar el pago en el Calendario fiscal. Solo gastos con circuito Fiscal entran en el cálculo — los personales y retiros están excluidos.' },
    'acceso-contador.html':  { titulo: 'Acceso Contador', resumen: 'Generá un link temporal para que la contadora acceda a los datos fiscales sin usuario. El link vence automáticamente. La contadora ve solo datos fiscales en portugués — sin datos personales ni retiros.' },
    'cabanas-admin.html':    { titulo: 'Cabañas', resumen: 'Configuración de las tres unidades: fotos, descripción en 3 idiomas, amenities, tarifas por temporada y vinculación con Google Calendar de Airbnb.' },
    'usuarios.html':         { titulo: 'Usuarios', resumen: 'Gestión de accesos. Dos roles: Admin (acceso completo) y Colaborador (solo ve sus tareas y cobros). La persona primero crea su cuenta en el login, luego el admin le asigna el rol acá.' },
    'manual-sistema.html':   { titulo: 'Manual del Sistema', resumen: 'Documentación completa. Para actualizar: subí el archivo .md o .html generado por Claude → se convierte y guarda en Firestore automáticamente.' },
};
var _ayudaFirestoreCargada = false;

// Cargar textos actualizados desde Firestore (override sobre los defaults)
async function _cargarAyudaFirestore() {
    if (_ayudaFirestoreCargada) return;
    try {
        var snap = await db.collection('config').doc('ayuda').get();
        if (snap.exists && snap.data().items) {
            var items = snap.data().items;
            // Merge: Firestore override sobre defaults
            Object.keys(items).forEach(function(pagina) {
                AYUDA_ITEMS[pagina] = Object.assign({}, AYUDA_ITEMS[pagina]||{}, items[pagina]);
            });
            _ayudaFirestoreCargada = true;
        }
    } catch(e) {
        // Silencioso — usar defaults del código
    }
}


// Cache del manual para no releer Firestore en cada tooltip
let _manualHtmlCache = null;

async function _getManualHtml() {
    if (_manualHtmlCache) return _manualHtmlCache;
    try {
        const snap = await db.collection('config').doc('manual').get();
        _manualHtmlCache = snap.exists ? (snap.data().contenidoHtml || snap.data().html || '') : '';
    } catch(e) {
        _manualHtmlCache = '';
    }
    return _manualHtmlCache;
}

function _extractSeccion(html, seccionId) {
    if (!html || !seccionId) return null;
    const div = document.createElement('div');
    div.innerHTML = html;
    // Buscar por id o por texto en h2/details/summary
    const byId = div.querySelector('#' + seccionId);
    if (byId) return byId.textContent.slice(0, 400).trim();
    // Buscar en details con summary que contenga el texto
    const details = div.querySelectorAll('details');
    for (const d of details) {
        const s = d.querySelector('summary');
        if (s && s.textContent.toLowerCase().includes(seccionId.toLowerCase())) {
            return d.textContent.slice(0, 400).trim();
        }
    }
    return null;
}

// Crear el modal de ayuda (singleton)
function _getAyudaModal() {
    let modal = document.getElementById('_ayudaModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = '_ayudaModal';
    modal.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:10000',
        'display:none', 'align-items:flex-start', 'justify-content:center',
        'padding:80px 16px 16px', 'background:rgba(0,0,0,0.45)',
        'backdrop-filter:blur(2px)'
    ].join(';');
    modal.innerHTML = [
        '<div id="_ayudaPanel" style="',
            'background:var(--color-surface);',
            'border:1px solid var(--color-border);',
            'border-radius:var(--radius-lg);',
            'box-shadow:0 8px 32px rgba(0,0,0,0.18);',
            'max-width:460px;width:100%;',
            'padding:var(--space-5);',
            'position:relative;',
            'max-height:80vh;overflow-y:auto;',
        '">',
            '<button onclick="CVC.cerrarAyuda()" style="',
                'position:absolute;top:12px;right:12px;',
                'background:none;border:none;cursor:pointer;',
                'color:var(--color-text-muted);padding:4px;',
                'border-radius:var(--radius-sm);',
                'font-size:20px;line-height:1;',
            '">',
                '<span class="material-icons" style="font-size:20px;">close</span>',
            '</button>',
            '<div id="_ayudaTitulo" style="font-size:16px;font-weight:700;margin-bottom:var(--space-3);padding-right:32px;color:var(--color-text-primary);"></div>',
            '<div id="_ayudaResumen" style="font-size:13px;color:var(--color-text-secondary);line-height:1.7;margin-bottom:var(--space-3);"></div>',
            '<div id="_ayudaManual" style="font-size:12px;color:var(--color-text-muted);background:var(--color-surface-2);border-radius:var(--radius-sm);padding:var(--space-3);display:none;margin-bottom:var(--space-3);line-height:1.6;max-height:200px;overflow-y:auto;"></div>',
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
                '<a id="_ayudaLinkManual" href="manual-sistema.html" style="',
                    'font-size:12px;color:var(--color-primary);text-decoration:none;',
                    'display:inline-flex;align-items:center;gap:4px;',
                    'padding:4px 10px;border:1px solid var(--color-primary-light);',
                    'border-radius:var(--radius-sm);background:var(--color-primary-xlight);',
                '">',
                    '<span class="material-icons" style="font-size:14px;">menu_book</span>',
                    'Ver en el manual completo',
                '</a>',
            '</div>',
        '</div>'
    ].join('');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) CVC.cerrarAyuda();
    });
    document.body.appendChild(modal);
    return modal;
}

// Mostrar ayuda para una página específica
async function mostrarAyuda(pagina) {
    // Cargar textos actualizados desde Firestore (primera vez)
    await _cargarAyudaFirestore();

    const info = AYUDA_ITEMS[pagina];
    if (!info) return;

    const modal = _getAyudaModal();
    document.getElementById('_ayudaTitulo').textContent  = info.titulo || pagina;
    document.getElementById('_ayudaResumen').textContent = info.resumen || '';
    document.getElementById('_ayudaManual').style.display = 'none';
    document.getElementById('_ayudaManual').textContent   = '';
    modal.style.display = 'flex';

    // Cargar extracto del manual en background
    if (info.seccion) {
        try {
            const html    = await _getManualHtml();
            const extracto = _extractSeccion(html, info.seccion);
            if (extracto) {
                const el = document.getElementById('_ayudaManual');
                el.textContent   = extracto.replace(/\s+/g, ' ').trim();
                el.style.display = 'block';
            }
        } catch(e) { /* silencioso */ }
    }
}

function cerrarAyuda() {
    const modal = document.getElementById('_ayudaModal');
    if (modal) modal.style.display = 'none';
}

// Agregar botones de ayuda (?) al nav después de renderNav()
function initAyuda(paginaActual) {
    const pagina = paginaActual || window.location.pathname.split('/').pop() || 'dashboard.html';

    // Botón flotante de ayuda para la página actual
    if (AYUDA_ITEMS[pagina]) {
        let fab = document.getElementById('_ayudaFab');
        if (!fab) {
            fab = document.createElement('button');
            fab.id = '_ayudaFab';
            fab.title = 'Ayuda de esta sección';
            fab.style.cssText = [
                'position:fixed', 'bottom:24px', 'right:24px',
                'width:44px', 'height:44px',
                'border-radius:50%',
                'background:var(--color-primary)',
                'color:white', 'border:none', 'cursor:pointer',
                'display:flex', 'align-items:center', 'justify-content:center',
                'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
                'z-index:999', 'font-size:20px',
                'transition:transform .15s, box-shadow .15s',
            ].join(';');
            fab.innerHTML = '<span class="material-icons" style="font-size:20px;">help_outline</span>';
            fab.addEventListener('click', function() { CVC.mostrarAyuda(pagina); });
            fab.addEventListener('mouseenter', function() {
                fab.style.transform = 'scale(1.1)';
                fab.style.boxShadow = '0 6px 20px rgba(0,0,0,0.22)';
            });
            fab.addEventListener('mouseleave', function() {
                fab.style.transform = '';
                fab.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)';
            });
            document.body.appendChild(fab);
        }
    }

    // Agregar puntos (?) en los items del nav dropdown
    setTimeout(function() {
        var links = document.querySelectorAll('.nav-dropdown__item, .nav-link');
        links.forEach(function(link) {
            var href = (link.getAttribute('href') || '').split('/').pop();
            if (!AYUDA_ITEMS[href]) return;
            if (link.querySelector('._nav-help')) return; // ya tiene
            var dot = document.createElement('button');
            dot.className = '_nav-help';
            dot.title = 'Ayuda rápida';
            dot.style.cssText = [
                'width:16px', 'height:16px',
                'border-radius:50%',
                'background:rgba(255,255,255,0.18)',
                'border:1px solid rgba(255,255,255,0.3)',
                'color:rgba(255,255,255,0.75)',
                'font-size:10px', 'font-weight:700',
                'cursor:pointer',
                'display:inline-flex', 'align-items:center', 'justify-content:center',
                'margin-left:auto', 'flex-shrink:0',
                'transition:background .15s',
                'line-height:1',
            ].join(';');
            dot.textContent = '?';
            dot.addEventListener('mouseenter', function() {
                dot.style.background = 'rgba(255,255,255,0.35)';
            });
            dot.addEventListener('mouseleave', function() {
                dot.style.background = 'rgba(255,255,255,0.18)';
            });
            dot.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                CVC.mostrarAyuda(href);
            });
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.appendChild(dot);
        });
    }, 200);
}

// ── EXPORTAR ──────────────────────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS, ESTADOS_BLOQUEANTES,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    verificarDisponibilidadCabana,
    mensajeConflicto,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    sincronizarDesdeGCal,
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    getHistorialTareas,
    BTG_CATEGORIAS, inferirCategoria, fingerprintMovimiento,
    conciliarMovimientos, importarMovimientosConfirmados,
    matchMovimientoBancario, conciliarContraRegistros,
    guardarConciliacion, cargarConfigConciliacion,
    verificarTarea,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast,
    subirComprobante, abrirComprobante,
    mostrarAyuda, cerrarAyuda, initAyuda, AYUDA_ITEMS
};
