// ============================================================
//  utils.js — Casa Verde Canas  v4.0
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.0:
//  - [NUEVO]   verificarDisponibilidadCabana() — detecta solapamiento
//              de fechas antes de crear/editar reservas y presupuestos
//  - [FIX]     sincronizarDisponibilidad() — ahora excluye pendiente
//              como estado bloqueante (solo confirmada + airbnb_activa)
//  - [MEJORA]  urgenciaTarea() — semáforo más granular: verde para
//              "en_curso" aunque tenga días de atraso
//  - [LIMPIEZA] Comentarios unificados en español
// ============================================================


// ── FIREBASE ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey:     'AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4',
    authDomain: 'casaverdecanas-199.firebaseapp.com',
    projectId:  'casaverdecanas-199'
};
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();


// ── CONSTANTES ───────────────────────────────────────────────
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

// Estados que bloquean disponibilidad en el calendario público
// NOTA: "pendiente" ya NO bloquea — solo las confirmadas reales
const ESTADOS_BLOQUEANTES = ['confirmada', 'airbnb_activa'];

const CALENDAR_IDS = {
    1: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com',
    2: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com',
    3: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com'
};


// ── BADGES ───────────────────────────────────────────────────
function badgeEstado(estado) {
    const e = ESTADOS_RESERVA[estado] || ESTADOS_TAREA[estado] || { label: estado, cssClass: 'badge-neutral' };
    return '<span class="badge ' + e.cssClass + '">' + e.label + '</span>';
}

function badgePrioridad(prioridad) {
    const p = PRIORIDADES[prioridad] || { label: prioridad, cssClass: 'badge-neutral' };
    return '<span class="badge ' + p.cssClass + '">' + p.label + '</span>';
}


// ── AUTENTICACIÓN ─────────────────────────────────────────────
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise((resolve, reject) => {
        // Timeout de seguridad: si Firebase no responde en 15s, rechazar
        const timer = setTimeout(() => {
            reject(new Error('Firebase no responde (timeout). Verificá tu conexión.'));
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


// ── CÁLCULO DE PRECIO ────────────────────────────────────────
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


// ── VERIFICAR DISPONIBILIDAD — sin solapamiento ───────────────
//
//  Consulta Firestore y verifica que no haya reservas confirmadas
//  (o airbnb_activa) para la misma cabaña en el rango solicitado.
//
//  @param cabaId       {number}  ID de cabaña (1, 2, 3...)
//  @param checkIn      {string}  Fecha 'YYYY-MM-DD'
//  @param checkOut     {string}  Fecha 'YYYY-MM-DD'
//  @param editandoId   {string?} ID de la reserva en edición (se excluye)
//  @returns {Promise<{disponible: boolean, conflicto: object|null}>}
//
async function verificarDisponibilidadCabana(cabaId, checkIn, checkOut, editandoId) {
    const checkInDate  = new Date(checkIn  + 'T12:00:00');
    const checkOutDate = new Date(checkOut + 'T12:00:00');

    // Solo buscamos estados que realmente bloquean
    const snap = await db.collection('reservas')
        .where('caba',   '==', cabaId)
        .where('estado', 'in', ESTADOS_BLOQUEANTES)
        .get();

    for (const doc of snap.docs) {
        // Saltar la propia reserva si estamos editando
        if (editandoId && doc.id === editandoId) continue;

        const r    = doc.data();
        const rIn  = r.checkIn?.toDate  ? r.checkIn.toDate()  : new Date(r.checkIn);
        const rOut = r.checkOut?.toDate ? r.checkOut.toDate() : new Date(r.checkOut);

        // Hay solapamiento si: nuevaEntrada < existenteSalida Y nuevaSalida > existenteEntrada
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

// Texto de error amigable para mostrar al usuario cuando hay conflicto
function mensajeConflicto(conflicto) {
    const etiqueta = ESTADOS_RESERVA[conflicto.estado]?.label || conflicto.estado;
    const ci  = conflicto.checkIn.split('-').reverse().join('/');
    const co  = conflicto.checkOut.split('-').reverse().join('/');
    return '⚠️ Fechas no disponibles — ya existe una reserva ('
        + etiqueta + ') del ' + ci + ' al ' + co
        + ' para ' + (conflicto.nombre !== 'Sin nombre' ? conflicto.nombre : 'otro huésped') + '.';
}


// ── SINCRONIZAR DISPONIBILIDAD PÚBLICA ───────────────────────
//
//  Actualiza la colección `disponibilidad` que lee el sitio público.
//  Solo bloquean las reservas CONFIRMADAS y AIRBNB_ACTIVA.
//  Pendientes ya no bloquean el calendario público.
//
async function sincronizarDisponibilidad(reservaId, reservaData) {
    try {
        const estado     = reservaData.estado || 'pendiente';
        const bloqueante = ESTADOS_BLOQUEANTES.includes(estado);
        const libre      = ['anulada', 'finalizada', 'airbnb_cancelada', 'pendiente'].includes(estado);

        if (libre) {
            await db.collection('disponibilidad').doc(reservaId).delete();
            return;
        }

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
    } catch(e) {
        console.warn('sincronizarDisponibilidad:', e.message);
    }
}


// ── CREAR TAREA DE LIMPIEZA ──────────────────────────────────
async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut?.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    // Nombre de la cabaña
    let nombreCabana = 'Cabana ' + reservaData.caba;
    try {
        const cabSnap = await db.collection('cabanas').doc(String(reservaData.caba)).get();
        if (cabSnap.exists) {
            const cab = cabSnap.data();
            nombreCabana = cab.nombre?.es || cab.nombre?.pt || ('Cabana ' + reservaData.caba);
        }
    } catch(e) { /* usar fallback */ }

    // Buscar próximo huésped que entra en esa cabaña después del checkout
    let proximoHuesped = null;
    try {
        const proxSnap = await db.collection('reservas')
            .where('caba', '==', reservaData.caba).get();

        const proxima = proxSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => {
                if (!['confirmada', 'pendiente'].includes(r.estado)) return false;
                if (r.id === reservaId) return false; // no la misma reserva
                const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
                return ci >= checkOut; // entra en o después del checkout
            })
            .sort((a, b) => {
                const ca = a.checkIn?.toDate ? a.checkIn.toDate() : new Date(a.checkIn);
                const cb = b.checkIn?.toDate ? b.checkIn.toDate() : new Date(b.checkIn);
                return ca - cb;
            })[0];

        if (proxima) {
            const ci = proxima.checkIn?.toDate ? proxima.checkIn.toDate() : new Date(proxima.checkIn);
            proximoHuesped = {
                nombre:         proxima.nombre         || '—',
                checkIn:        ci,
                horaLlegada:    proxima.horaLlegada    || '',
                huespedes:      proxima.huespedes || ((proxima.adultos || 0) + (proxima.ninos || 0)),
                mascotas:       proxima.mascotas        || 'no',
                niniosPequenos: proxima.niniosPequenos  || 'no',
                notas:          proxima.notas           || ''
            };
        }
    } catch(e) {
        console.warn('proxima reserva:', e);
    }

    // Alertas de atención
    const alertasEntrada = [];
    if (proximoHuesped?.mascotas === 'si')       alertasEntrada.push('🐾 MASCOTAS');
    if (proximoHuesped?.niniosPequenos === 'si') alertasEntrada.push('👶 NIÑOS PEQUEÑOS');

    // Alertas del huésped que sale
    const alertasSalida = [];
    if (reservaData.mascotas === 'si')       alertasSalida.push('🐾 MASCOTAS');
    if (reservaData.niniosPequenos === 'si') alertasSalida.push('👶 NIÑOS PEQUEÑOS');

    // Armar descripción estructurada
    const lineas = [];

    // 1. Quién ENTRA
    if (proximoHuesped) {
        lineas.push('🚪 ENTRADA');
        lineas.push('   Cabaña: ' + nombreCabana);
        lineas.push('   Huésped: ' + proximoHuesped.nombre);
        lineas.push('   Personas: ' + proximoHuesped.huespedes);
        lineas.push('   Llega: ' + proximoHuesped.checkIn.toLocaleDateString('es-AR')
            + (proximoHuesped.horaLlegada ? ' a las ' + proximoHuesped.horaLlegada + 'hs' : ' — hora no confirmada'));
        if (proximoHuesped.notas) lineas.push('   Notas: ' + proximoHuesped.notas);
        if (alertasEntrada.length) {
            lineas.push('');
            lineas.push('⚠️ ATENCIÓN: ' + alertasEntrada.join(' · '));
        }
    } else {
        lineas.push('🚪 ENTRADA');
        lineas.push('   Cabaña: ' + nombreCabana);
        lineas.push('   Sin reserva siguiente registrada — limpiar y dejar lista');
    }

    lineas.push('');

    // 2. Quién SALE (referencia de tiempo)
    lineas.push('🔑 SALIDA (huésped anterior)');
    lineas.push('   ' + (reservaData.nombre || '—')
        + ' · ' + (reservaData.huespedes || ((reservaData.adultos||0) + (reservaData.ninos||0))) + ' personas');
    lineas.push('   Sale: ' + checkOut.toLocaleDateString('es-AR')
        + (reservaData.horaSalida ? ' a las ' + reservaData.horaSalida + 'hs' : ''));
    if (reservaData.notas) lineas.push('   Notas salida: ' + reservaData.notas);
    if (alertasSalida.length) {
        lineas.push('');
        lineas.push('⚠️ SALIDA con: ' + alertasSalida.join(' · '));
    }

    lineas.push('');
    lineas.push('💰 Monto limpieza: R$ ' + (reservaData.costoLimpiezaBRL || 0));

    await db.collection('tareas').add({
        nombre:      'Limpiar ' + nombreCabana + ' — ' + (reservaData.nombre || 'sin nombre'),
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


// ── LÓGICA DE TAREAS — SUBCOLECCIÓN ──────────────────────────
//
//  Sesiones en: tareas/{tareaId}/sesiones/{sesionId}
//  { uid, nombre, inicio: Timestamp, fin: Timestamp|null, tareaId }
//
//  Doc raíz mantiene sesionesActivas[] (solo abiertas) para cards.
//
//  ESTADOS: pendiente | en_curso | finalizada

async function iniciarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');

    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    // Verificar sesión activa del usuario (filtrar en cliente para evitar índice compuesto)
    const todasSnap = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const yaAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (yaAbierta) throw new Error('Ya tenés una sesión activa en esta tarea');

    const ahora = firebase.firestore.Timestamp.now();
    await sesionesRef.add({
        uid:    currentUser.uid,
        nombre: currentUser.nombre || currentUser.email,
        inicio: ahora,
        fin:    null,
        tareaId
    });

    const sesActuales = (tarea.sesionesActivas || []);
    sesActuales.push({ uid: currentUser.uid, nombre: currentUser.nombre || currentUser.email, inicio: ahora });
    await tareaRef.update({ estado: 'en_curso', sesionesActivas: sesActuales });
}

async function pausarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');

    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    if (tareaDoc.data().estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const todasSnap = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (!sesAbierta) throw new Error('No tenés una sesión activa en esta tarea');

    const ahora = firebase.firestore.Timestamp.now();
    await sesAbierta.ref.update({ fin: ahora });

    // Verificar si quedan sesiones abiertas de otros usuarios
    const todasSnap2   = await sesionesRef.get();
    const quedanAbiertas = todasSnap2.docs.some(d => d.data().fin === null);
    const sesActuales    = (tareaDoc.data().sesionesActivas || []).filter(s => s.uid !== currentUser.uid);
    await tareaRef.update({
        estado:          quedanAbiertas ? 'en_curso' : 'pendiente',
        sesionesActivas: sesActuales
    });
}

async function finalizarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');

    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const ahora     = firebase.firestore.Timestamp.now();
    const ahoraDate = ahora.toDate();

    // Leer sesiones de subcolección
    const sesSnap = await sesionesRef.get();
    let sesiones  = sesSnap.docs.map(d => ({ _ref: d.ref, ...d.data() }));

    // Si quien finaliza no participó, registrar presencia mínima
    if (!sesiones.some(s => s.uid === currentUser.uid)) {
        const ref = await sesionesRef.add({
            uid:    currentUser.uid,
            nombre: currentUser.nombre || currentUser.email,
            inicio: ahora,
            fin:    ahora,
            tareaId
        });
        sesiones.push({ _ref: ref, uid: currentUser.uid,
            nombre: currentUser.nombre || currentUser.email, inicio: ahora, fin: ahora });
    }

    // Cerrar todas las sesiones abiertas
    const b1 = db.batch();
    for (const s of sesiones) {
        if (s.fin === null) { b1.update(s._ref, { fin: ahora }); s.fin = ahora; }
    }
    await b1.commit();

    // Calcular horas por usuario
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
        uid,
        nombre:        nombrePor[uid],
        horas:         parseFloat(horas.toFixed(2)),
        montoRecibido: monto > 0 && totalHoras > 0
            ? parseFloat(((horas / totalHoras) * monto).toFixed(2))
            : 0
    }));

    // Batch final
    const b2      = db.batch();
    const histRef = db.collection('historial_tareas').doc();

    // 1. Historial
    b2.set(histRef, {
        tareaId,
        nombre:        tarea.nombre,
        descripcion:   tarea.descripcion   || '',
        tipo:          tarea.tipo          || 'general',
        prioridad:     tarea.prioridad     || 'media',
        fechaInicio:   tarea.fechaInicio   || null,
        fechaFin:      ahoraDate.toISOString().split('T')[0],
        monto,
        totalHoras:    parseFloat(totalHoras.toFixed(2)),
        colaboradores,
        reservaId:     tarea.reservaId     || null,
        cabana:        tarea.cabana        || null,
        recurrencia:   tarea.recurrencia   || 0,
        finalizadoPor: currentUser.uid,
        finalizadoEn:  ahora,
        creadoEn:      tarea.creadoEn      || null
    });

    // 2. Honorarios — uno por colaborador con monto > 0
    if (monto > 0) {
        for (const col of colaboradores) {
            if (col.montoRecibido <= 0) continue;
            const hRef = db.collection('honorarios').doc();
            b2.set(hRef, {
                colaboradorId:     col.uid,
                colaboradorNombre: col.nombre,
                tareaId,
                historialId:       histRef.id,
                reservaId:         tarea.reservaId || null,
                monto:             col.montoRecibido,
                moneda:            'BRL',
                concepto:          'Tarea: ' + tarea.nombre + ' — ' + ahoraDate.toLocaleDateString('es-AR'),
                horas:             col.horas,
                estado:            'pendiente',
                fechaPago:         null,
                pagadoPor:         null,
                creadoEn:          ahora
            });
        }
    }

    // 3. Recurrencia: resetear o eliminar la tarea
    const recurrencia = tarea.recurrencia || 0;
    if (recurrencia === 0) {
        b2.delete(tareaRef);
    } else {
        const nuevaFecha = new Date(ahoraDate);
        nuevaFecha.setDate(nuevaFecha.getDate() + recurrencia);
        b2.update(tareaRef, {
            estado:          'pendiente',
            sesionesActivas: [],
            fechaInicio:     nuevaFecha.toISOString().split('T')[0],
            ultimaVez:       ahora
        });
    }

    await b2.commit();

    // Limpiar sesiones si la tarea sigue viva (recurrente)
    if (recurrencia > 0) {
        const b3 = db.batch();
        for (const s of sesiones) b3.delete(s._ref);
        await b3.commit();
    }

    return colaboradores;
}


// ── HISTORIAL DE CUMPLIMIENTOS DE TAREA ──────────────────────
//
//  Consulta historial_tareas filtrando por tareaId.
//  Retorna datos analíticos para evaluar cumplimiento y si la tarea
//  necesita modificación.
//
//  @param tareaId {string} ID de la tarea
//  @returns {Promise<{
//     totalVeces: number,
//     ultimaVez: Date|null,
//     porUsuario: [{nombre, veces, ultimaVez, horasTotal, montoTotal}, ...],
//     resumen: {totalHoras, totalMonto, colaboradoresUnicos}
//  }>}
//
async function getHistorialTareas(tareaId) {
    try {
        const snap = await db.collection('historial_tareas')
            .where('tareaId', '==', tareaId)
            .orderBy('finalizadoEn', 'desc')
            .get();

        const registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (registros.length === 0) {
            return {
                totalVeces: 0,
                ultimaVez: null,
                porUsuario: [],
                resumen: {
                    totalHoras: 0,
                    totalMonto: 0,
                    colaboradoresUnicos: 0
                }
            };
        }

        // Agrupar por colaborador
        const porUid = {};
        let totalHoras = 0;
        let totalMonto = 0;
        const colaboradoresUnicos = new Set();

        for (const reg of registros) {
            const colaboradores = reg.colaboradores || [];
            for (const col of colaboradores) {
                colaboradoresUnicos.add(col.uid);
                if (!porUid[col.uid]) {
                    porUid[col.uid] = {
                        nombre: col.nombre,
                        veces: 0,
                        horasTotal: 0,
                        montoTotal: 0,
                        ultimaVez: null
                    };
                }
                porUid[col.uid].veces += 1;
                porUid[col.uid].horasTotal += col.horas || 0;
                porUid[col.uid].montoTotal += col.montoRecibido || 0;
                
                // Actualizar última vez
                const finalizadoEn = reg.finalizadoEn?.toDate 
                    ? reg.finalizadoEn.toDate() 
                    : new Date(reg.finalizadoEn);
                if (!porUid[col.uid].ultimaVez || finalizadoEn > porUid[col.uid].ultimaVez) {
                    porUid[col.uid].ultimaVez = finalizadoEn;
                }
            }
            totalHoras += reg.totalHoras || 0;
            totalMonto += reg.monto || 0;
        }

        // Convertir a array y ordenar por veces (descendente)
        const porUsuarioArray = Object.values(porUid)
            .sort((a, b) => b.veces - a.veces);

        // Última finalización global
        const ultimaVez = registros[0]?.finalizadoEn?.toDate 
            ? registros[0].finalizadoEn.toDate() 
            : null;

        return {
            totalVeces: registros.length,
            ultimaVez,
            porUsuario: porUsuarioArray,
            resumen: {
                totalHoras: parseFloat(totalHoras.toFixed(2)),
                totalMonto: parseFloat(totalMonto.toFixed(2)),
                colaboradoresUnicos: colaboradoresUnicos.size
            }
        };
    } catch (e) {
        console.warn('getHistorialTareas:', e.message);
        return {
            totalVeces: 0,
            ultimaVez: null,
            porUsuario: [],
            resumen: {
                totalHoras: 0,
                totalMonto: 0,
                colaboradoresUnicos: 0
            }
        };
    }
}


// ── URGENCIA DE TAREA ────────────────────────────────────────
//
//  ⚫ Gris    — fecha futura (todavía no llegó)
//  🟢 Verde   — hoy, o tarea en_curso aunque tenga atraso
//  🟡 Amarillo — atraso dentro del primer ciclo de recurrencia
//  🔴 Rojo    — superó el ciclo o más de 10 días sin fecha
//
function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };

    // Las tareas en curso siempre son verdes — alguien está trabajando
    if (tarea.estado === 'en_curso') return { color: 'verde', label: 'En curso' };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio     = new Date(tarea.fechaInicio + 'T00:00:00');
    const diasAtraso = Math.floor((hoy - inicio) / 86400000);

    if (diasAtraso < 0)   return { color: 'gris',     label: 'Próximamente'         };
    if (diasAtraso === 0) return { color: 'verde',    label: 'Hoy'                  };

    const ciclo = tarea.recurrencia > 0 ? tarea.recurrencia : 3;
    if (diasAtraso > ciclo || diasAtraso > 10) {
        return { color: 'rojo',     label: diasAtraso + 'd de atraso' };
    }
    return { color: 'amarillo', label: diasAtraso + 'd de atraso' };
}


// ── HELPERS DE FORMATO ────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

function formatFecha(timestamp) {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('es-AR');
}

function formatFechaHora(timestamp) {
    if (!timestamp) return '—';
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
function colorCabana(index) {
    return COLORES_CABANAS[index % COLORES_CABANAS.length];
}


// ── HELPERS DE UI ────────────────────────────────────────────
function showLoading(container, mensaje) {
    mensaje = mensaje || 'Cargando...';
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-loading"><div class="spinner"></div><span>'
        + escapeHtml(mensaje) + '</span></div>';
}

function showEmpty(container, titulo, descripcion, icono) {
    titulo      = titulo      || 'Sin datos';
    descripcion = descripcion || '';
    icono       = icono       || 'inbox';
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-empty"><span class="material-icons">' + escapeHtml(icono) + '</span>'
        + '<div class="state-empty__title">' + escapeHtml(titulo) + '</div>'
        + (descripcion ? '<div class="state-empty__desc">' + escapeHtml(descripcion) + '</div>' : '')
        + '</div>';
}

function showError(container, titulo, descripcion, onRetry) {
    titulo      = titulo      || 'Ocurrió un error';
    descripcion = descripcion || '';
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
        wrap.id        = 'cvc-toasts';
        wrap.className = 'toast-container';
        document.body.appendChild(wrap);
    }
    const toast     = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.innerHTML = '<span class="material-icons">' + (iconos[tipo] || 'info') + '</span>'
        + '<span>' + escapeHtml(mensaje) + '</span>';
    wrap.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3300);
}


// ── NAV CENTRALIZADA ─────────────────────────────────────────
//
//  Estructura de grupos desplegables.
//  Cada grupo tiene un trigger (label + ícono) y un panel con sus items.
//  Los items directos (sin grupo) se renderizan como links planos.
//
//  Formato:
//  {
//    group: 'Finanzas',          ← label del trigger
//    icon:  'payments',          ← ícono del trigger
//    items: [                    ← items del dropdown
//      { href, icon, label },
//      { sep: true },            ← separador dentro del panel
//    ]
//  }
//  — o —
//  { href, icon, label }         ← item directo (sin dropdown)
//

const NAV_ADMIN_ITEMS = [

    // ── Items directos ────────────────────────────────────────
    { href: 'dashboard.html',    icon: 'dashboard',      label: 'Dashboard'  },
    { href: 'calendario.html',   icon: 'calendar_month', label: 'Calendario' },

    // ── Grupo: Reservas ───────────────────────────────────────
    {
        group: 'Reservas',
        icon:  'event',
        items: [
            { href: 'reservas.html',     icon: 'event',         label: 'Reservas'     },
            { href: 'presupuestos.html', icon: 'request_quote', label: 'Presupuestos' },
            { href: 'clientes.html',     icon: 'people',        label: 'Clientes'     },
        ]
    },

    // ── Grupo: Finanzas ───────────────────────────────────────
    {
        group: 'Finanzas',
        icon:  'payments',
        items: [
            { href: 'pagos.html',            icon: 'payments',        label: 'Ingresos / Egresos' },
            { href: 'informes-airbnb.html',  icon: 'summarize',       label: 'Informes Airbnb'    },
            { sep: true },
            { href: 'cuentas.html',          icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',      icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'categorias.html',       icon: 'label',           label: 'Categorías'         },
        ]
    },

    // ── Grupo: Operaciones ────────────────────────────────────
    {
        group: 'Operaciones',
        icon:  'checklist',
        items: [
            { href: 'tareas.html',    icon: 'checklist',      label: 'Tareas'    },
        ]
    },

    // ── Grupo: Configuración ──────────────────────────────────
    {
        group: 'Config.',
        icon:  'settings',
        items: [
            { href: 'cabanas-admin.html', icon: 'cottage',         label: 'Cabañas'  },
            { href: 'usuarios.html',      icon: 'manage_accounts', label: 'Usuarios' },
            { sep: true },
            { href: 'manual-sistema.html',icon: 'menu_book',       label: 'Manual'   },
        ]
    }
];

const NAV_USER_ITEMS = [
    { href: 'tareas.html',        icon: 'checklist', label: 'Tareas'     },
    { href: 'pagos.html',         icon: 'payments',  label: 'Mis cobros' },
    { href: 'manual-sistema.html',icon: 'menu_book', label: 'Manual'     }
];

// ── renderNav ─────────────────────────────────────────────────
//
//  Construye la barra de navegación con dropdowns.
//  Cierra el dropdown abierto al hacer click fuera (document listener).
//  Marca como activo el grupo que contiene la página actual.
//
function renderNav(paginaActiva, rol) {
    rol = rol || 'admin';
    const el = document.getElementById('appNav') || document.querySelector('.admin-nav');
    if (!el) return;

    const items = rol === 'admin' ? NAV_ADMIN_ITEMS : NAV_USER_ITEMS;

    el.innerHTML = items.map(function(item, gi) {
        // Item directo — link plano
        if (item.href) {
            const activo = item.href === paginaActiva;
            return '<a href="' + item.href + '" class="nav-item' + (activo ? ' active' : '') + '">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
        }

        // Grupo con dropdown
        if (item.group) {
            const grupoId = 'navdrop-' + gi;
            // ¿Algún hijo coincide con la página activa?
            const tieneActivo = (item.items || []).some(function(sub) {
                return sub.href && (
                    sub.href === paginaActiva ||
                    sub.href.replace('.html','') === paginaActiva
                );
            });

            const panelItems = (item.items || []).map(function(sub) {
                if (sub.sep) return '<div class="nav-dropdown__sep"></div>';
                const esActivo = sub.href === paginaActiva
                    || sub.href.replace('.html','') === paginaActiva;
                return '<a href="' + sub.href + '" class="nav-dropdown__item' + (esActivo ? ' active' : '') + '">'
                    + '<span class="material-icons">' + sub.icon + '</span> ' + sub.label + '</a>';
            }).join('');

            return '<div class="nav-dropdown' + (tieneActivo ? ' has-active' : '') + '" id="' + grupoId + '">'
                + '<button class="nav-dropdown__trigger" onclick="toggleNavDrop(event,\'' + grupoId + '\')">'
                + '<span class="material-icons">' + item.icon + '</span> '
                + item.group
                + '<span class="material-icons nav-arrow">expand_more</span>'
                + '</button>'
                + '<div class="nav-dropdown__panel">' + panelItems + '</div>'
                + '</div>';
        }

        return '';
    }).join('');

    // Cerrar al hacer click fuera
    document.removeEventListener('click', _cerrarDropdowns);
    document.addEventListener('click', _cerrarDropdowns);
}

function toggleNavDrop(e, id) {
    e.stopPropagation();

    const dropEl  = document.getElementById(id);
    if (!dropEl) return;

    const estaAbierto = dropEl.classList.contains('open');

    // Cerrar todos los dropdowns abiertos
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.top = ''; p.style.left = ''; }
    });

    if (estaAbierto) return; // ya estaba abierto → solo cerrar

    // Calcular posición del trigger para posicionar el panel con fixed
    // (necesario porque .admin-nav tiene overflow-x:auto que corta absolute)
    const trigger = dropEl.querySelector('.nav-dropdown__trigger');
    const rect    = trigger.getBoundingClientRect();
    const panel   = dropEl.querySelector('.nav-dropdown__panel');

    // Posicionar debajo del trigger
    panel.style.top  = (rect.bottom + 2) + 'px';
    panel.style.left = rect.left + 'px';

    // Ajustar si se sale por la derecha de la pantalla
    dropEl.classList.add('open');
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - 8) {
        panel.style.left = (rect.right - panelRect.width) + 'px';
    }
}

function _cerrarDropdowns() {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.top = ''; p.style.left = ''; }
    });
}

// Exponer globalmente
window.toggleNavDrop = toggleNavDrop;


// ── EXPORTAR ─────────────────────────────────────────────────
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
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    getHistorialTareas,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
