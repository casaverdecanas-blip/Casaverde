// ============================================================
//  utils.js — Casa Verde Canas  v4.1
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.1 (Mayo 2026):
//  - [DOC]  Agregado schema de colecciones Firestore
//  - [DOC]  Advertencia sobre API Key duplicada
//  - [DOC]  Referencia a firestore.rules versionado en GitHub
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
//
//  ⚠️  ESTA CONFIG EXISTE EN DOS ARCHIVOS:
//       1. utils.js  (este archivo)  — usado por todos los módulos /interno/
//       2. index.html (sitio público) — login embebido en el frontend público
//       3. cabana.html (sitio público) — ficha de cabaña
//       4. admin.html  — editor de contenido web (Realtime DB, independiente)
//
//  Si cambia algún valor, actualizarlo en TODOS los archivos.
//  La seguridad real no depende de ocultar esta clave sino de las
//  Firestore Security Rules → ver /firestore.rules en el repositorio.
//
const FIREBASE_CONFIG = {
    apiKey:     'AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4',
    authDomain: 'casaverdecanas-199.firebaseapp.com',
    projectId:  'casaverdecanas-199'
};
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();


// ── SCHEMA FIRESTORE ─────────────────────────────────────────
//
//  Referencia rápida de colecciones. Para las reglas de acceso
//  ver firestore.rules en la raíz del repositorio.
//
//  reservas/
//    caba(number), estado, checkIn(string YYYY-MM-DD), checkOut,
//    nombre, huespedes(number), adultos, ninos, mascotas(si|no),
//    niniosPequenos(si|no), horaLlegada, horaSalida, notas,
//    origen(directa|airbnb), costoLimpiezaBRL, creadoEn, creadoPor
//
//  tareas/
//    nombre, tipo(limpieza|rutina|general), estado(pendiente|en_curso|finalizada),
//    prioridad(alta|media|baja), monto(BRL), activa(bool),
//    fechaInicio(string YYYY-MM-DD), recurrencia(días, 0=no recurrente),
//    ultimaVez(Timestamp), reservaId?, cabana(number)?,
//    sesionesActivas[], creadoEn(Timestamp), creadoPor
//    └── sesiones/
//          uid, nombre, inicio(Timestamp), fin(Timestamp|null), tareaId
//
//  historial_tareas/   ← snapshot inmutable al finalizar — NO modificar
//    tareaId, nombre, tipo, prioridad, fechaInicio, fechaFin,
//    monto, totalHoras, colaboradores[], reservaId?, cabana?,
//    finalizadoPor, finalizadoEn(Timestamp), creadoEn
//
//  honorarios/
//    colaboradorId, colaboradorNombre, tareaId, historialId,
//    reservaId?, monto(BRL), moneda, concepto, horas,
//    estado(pendiente|pagado), fechaPago?, pagadoPor?, creadoEn
//
//  cuentas/
//    nombre, banco, moneda(BRL|USD|UYU|ARS), pais(BR|UY|AR),
//    tipo(operativa|respaldo|personal), saldoActual, saldoInicial,
//    fiscal(bool), titular?, orden(number), creadoEn
//
//  movimientos/
//    cuentaId, moneda, fecha(string YYYY-MM-DD), descripcion,
//    monto(+ crédito / - débito), tipo(credito|debito),
//    fingerprint?, categoria, etiqueta, categoria_personal,
//    origen(manual|btg_import), importadoPor?, importadoEn?, notas
//
//  pagos/              ← ingresos y egresos manuales del negocio
//  gastos/             ← gastos operativos con comprobante opcional
//  categorias/         ← etiquetas para movimientos y gastos
//
//  cabanas/
//    nombre{es,pt,en}, capacidad{base,max}, tarifas{precioBase,
//    precioExtraPersona, precioLimpieza, intervalos[]}, fotos[]
//
//  clientes/
//    nombre, email, telefono, pais, notas, historial[]
//
//  usuarios/
//    nombre, email, rol(admin|user), activo(bool), creadoEn
//
//  disponibilidad/     ← espejo de reservas bloqueantes → lo lee el sitio público
//    caba, checkIn, checkOut, estado, bloqueante, origen, actualizadoEn
//
//  config/manual       ← contenido HTML editable del manual
//    contenidoHtml, version, actualizadoEn, actualizadoPor
//


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
            { href: 'pagos.html',      icon: 'payments',        label: 'Ingresos / Egresos' },
            { sep: true },
            { href: 'cuentas.html',    icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'categorias.html', icon: 'label',           label: 'Categorías'         },
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


// ── MÓDULO BTG — CATEGORIZACIÓN Y CONCILIACIÓN ───────────────
//
//  Funciones para importar y enriquecer extractos bancarios BTG.
//  Usadas por herramientas-btg.html y depuracion-finanzas.html.
//
//  Flujo:
//    1. parsear texto del extracto (lógica en herramientas-btg.html)
//    2. fingerprintMovimiento()  — genera clave única por movimiento
//    3. conciliarMovimientos()   — detecta nuevos vs duplicados vs Firestore
//    4. importarMovimientosConfirmados() — graba en batch los aprobados
//    5. inferirCategoria()       — sugiere categoría+etiqueta por nombre
//
//  Para agregar nuevas reglas de categorización:
//  editar el array BTG_REGLAS_CAT más abajo.
// ────────────────────────────────────────────────────────────


// ── Categorías personales disponibles ────────────────────────
//
//  Son las opciones que aparecen en el selector de categoría
//  en la pantalla de enriquecimiento. Agregar aquí si se necesita
//  una categoría nueva.
//
const BTG_CATEGORIAS = [
    'negocio',
    'supermercado',
    'alimentacion',
    'transporte',
    'salud',
    'servicios',
    'ocio',
    'suscripcion',
    'transferencia',
    'ingreso',
    'sin_clasificar'
];


// ── Reglas de categorización automática ──────────────────────
//
//  Cada regla tiene:
//    match[]   — fragmentos de texto a buscar en el nombre (lowercase)
//    cat       — categoría asignada (debe estar en BTG_CATEGORIAS)
//    etiqueta  — descripción legible para el administrador
//
//  La primera regla que coincide gana — el orden importa.
//  Para agregar una nueva regla, agregarla al array.
//
const BTG_REGLAS_CAT = [

    // ── Negocio (cabaña) ──────────────────────────────────────
    { match: ['amc materiais','constrular','franzoni','casas da água','casas da agua',
              'chaveiro','construmais','lenz comercio','lenz comércio'],
      cat: 'negocio', etiqueta: 'Materiales / insumos Casa Verde Cañas' },

    // ── Supermercado ─────────────────────────────────────────
    { match: ['mercado dos amigos'],      cat: 'supermercado', etiqueta: 'Supermercado local' },
    { match: ['mundialmix'],              cat: 'supermercado', etiqueta: 'Supermercado' },
    { match: ['sdb comercio','sdb comércio'], cat: 'supermercado', etiqueta: 'Supermercado — compra grande' },
    { match: ['prado supermercado'],      cat: 'supermercado', etiqueta: 'Supermercado' },
    { match: ['bistek supermercados'],    cat: 'supermercado', etiqueta: 'Supermercado' },
    { match: ['havan'],                   cat: 'supermercado', etiqueta: 'Tienda / supermercado' },
    { match: ['desterro comercial'],      cat: 'supermercado', etiqueta: 'Comercio / compras' },
    { match: ['pix marketplace'],         cat: 'supermercado', etiqueta: 'Compra online (Mercado Libre)' },
    { match: ['vuoncard'],                cat: 'supermercado', etiqueta: 'Compra online' },
    { match: ['milium tem'],              cat: 'supermercado', etiqueta: 'Compra varios' },
    { match: ['eugenio raulino','koerich'], cat: 'supermercado', etiqueta: 'Tienda / compra' },
    { match: ['bazarilene'],              cat: 'supermercado', etiqueta: 'Bazar / compra' },
    { match: ['ana cristina henrique'],   cat: 'supermercado', etiqueta: 'Compra particular' },
    { match: ['direto do campo'],         cat: 'supermercado', etiqueta: 'Feria / productos frescos' },

    // ── Alimentación ─────────────────────────────────────────
    { match: ['canas lanches'],           cat: 'alimentacion', etiqueta: 'Almuerzo / local Cañas' },
    { match: ['sorvetes','acai magias','açaí magias'], cat: 'alimentacion', etiqueta: 'Heladería / café' },
    { match: ['tiziano gelato'],          cat: 'alimentacion', etiqueta: 'Heladería / café' },
    { match: ['jorge lourenco','jorge lourenço'], cat: 'alimentacion', etiqueta: 'Restaurante / parrilla' },
    { match: ['rio branco choperia'],     cat: 'alimentacion', etiqueta: 'Bar / restorán' },

    // ── Ocio ─────────────────────────────────────────────────
    { match: ['monte civetta'],           cat: 'ocio', etiqueta: 'Heladería / salida' },
    { match: ['revistaria magus'],        cat: 'ocio', etiqueta: 'Librería / revista' },

    // ── Servicios ────────────────────────────────────────────
    { match: ['telefonica bras','telefônica bras','vivo'], cat: 'servicios', etiqueta: 'Internet / telefonía' },
    { match: ['claro'],                   cat: 'servicios', etiqueta: 'Celular / internet' },
    { match: ['leo gas','leo gás'],       cat: 'servicios', etiqueta: 'Gas / agua' },
    { match: ['vindi pagamentos'],        cat: 'servicios', etiqueta: 'Servicio online / suscripción' },
    { match: ['ademir jose','ademir josé'], cat: 'servicios', etiqueta: 'Servicio / profesional' },

    // ── Transporte ───────────────────────────────────────────
    { match: ['posto galo'],              cat: 'transporte', etiqueta: 'Combustible' },
    { match: ['posto agricopel'],         cat: 'transporte', etiqueta: 'Combustible' },
    { match: ['sim - rede de postos','sim rede de postos'], cat: 'transporte', etiqueta: 'Combustible / telepeaje' },
    { match: ['heli tur'],                cat: 'transporte', etiqueta: 'Transporte / excursión' },

    // ── Salud ────────────────────────────────────────────────
    { match: ['farmaouro','farmaôuro','sao joao farm','são joão farm'], cat: 'salud', etiqueta: 'Farmacia' },
    { match: ['espaco corpo','espaço corpo'], cat: 'salud', etiqueta: 'Centro de bienestar / spa' },
    { match: ['princesa me'],             cat: 'salud', etiqueta: 'Peluquería / cuidado personal' },

    // ── Suscripción ──────────────────────────────────────────
    { match: ['esteban gabriel mederos'], cat: 'suscripcion', etiqueta: 'Spotify — cuota grupal (3/5)' },

    // ── Transferencias personales ────────────────────────────
    { match: ['daniel parra','florencia silvina carrizo','clebe da silva','israel gomes',
              'francielly nunes','filipe gusmao','filipe gusmão','victor fernandes',
              'cleber luciano','joice marlete','felipe camilo','hector sebastian balboa',
              'héctor sebastián balboa','yvonne maria','carlos sebastian lorier',
              'carlos sebastián lorier','gilmara lisboa','claudio aparecido','mayara cristhyna',
              'andre filipe','andré filipe','josefina ceballos','fabio daniel','fábio daniel',
              'francielly'],
      cat: 'transferencia', etiqueta: 'Transferencia personal' },

    // ── Ingresos ─────────────────────────────────────────────
    { match: ['maria florencia de tezanos','maria florência de tezanos'],
      cat: 'ingreso', etiqueta: 'Traspaso entre cuentas BTG' },
    { match: ['kp servicos','kp serviços'],  cat: 'ingreso', etiqueta: 'Ingreso — servicio digital' },
    { match: ['astro instituicao','astro instituição'], cat: 'ingreso', etiqueta: 'Devolución / cashback' },
    { match: ['lais de fatima','laís de fátima'], cat: 'ingreso', etiqueta: 'Devolución Pix (ver 13/01)' },
    { match: ['joao vitor pereira','joão vitor pereira'], cat: 'ingreso', etiqueta: 'Ingreso — transferencia recibida' },
    { match: ['mercado pago'],            cat: 'sin_clasificar', etiqueta: 'Ingreso sin clasificar' },
];


// ── inferirCategoria(nombre) ──────────────────────────────────
//
//  Busca el nombre del movimiento en las reglas de categorización.
//  Devuelve { cat, etiqueta } o { cat: '', etiqueta: '' } si no hay match.
//
//  @param  {string} nombre — descripción del movimiento (se normaliza a lowercase)
//  @returns {{ cat: string, etiqueta: string }}
//
function inferirCategoria(nombre) {
    const n = (nombre || '').toLowerCase();
    for (const regla of BTG_REGLAS_CAT) {
        if (regla.match.some(function(m) { return n.includes(m); })) {
            return { cat: regla.cat, etiqueta: regla.etiqueta };
        }
    }
    return { cat: '', etiqueta: '' };
}


// ── fingerprintMovimiento(fecha, monto, descripcion) ──────────
//
//  Genera una clave única por movimiento para detectar duplicados.
//  Formato: "YYYY-MM-DD|monto_en_centavos|primeras_4_palabras"
//
//  El monto se usa en valor absoluto — la dirección (débito/crédito)
//  no forma parte del fingerprint para tolerar variaciones de signo
//  entre diferentes formatos de extracto.
//
//  @param  {string} fecha       — 'YYYY-MM-DD'
//  @param  {number} monto       — valor numérico (positivo o negativo)
//  @param  {string} descripcion — texto del movimiento
//  @returns {string}
//
function fingerprintMovimiento(fecha, monto, descripcion) {
    var f = (fecha || '').slice(0, 10);
    var m = Math.round(Math.abs(monto || 0) * 100);
    var d = (descripcion || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join('_');
    return f + '|' + m + '|' + d;
}


// ── conciliarMovimientos(parseados, cuentaId) ─────────────────
//
//  Compara los movimientos parseados del extracto contra los ya
//  guardados en Firestore para esa cuenta en los últimos 6 meses.
//
//  Cada movimiento recibe un estado:
//    'nuevo'             — no existe en Firestore, se puede importar
//    'duplicado'         — fingerprint idéntico ya existe → saltar
//    'posible_duplicado' — misma fecha y monto, descripción diferente → revisar
//
//  @param  {Array}  parseados  — [{fecha, monto, descripcion, tipo, ...}]
//  @param  {string} cuentaId   — ID del documento en colección 'cuentas'
//  @returns {Promise<Array>}   — mismos objetos con campo 'estado' agregado
//
async function conciliarMovimientos(parseados, cuentaId) {
    // Cargar movimientos de esa cuenta de los últimos 6 meses
    var hace6meses = new Date();
    hace6meses.setMonth(hace6meses.getMonth() - 6);
    var fechaLimite = hace6meses.toISOString().slice(0, 10);

    var snap = await db.collection('movimientos')
        .where('cuentaId', '==', cuentaId)
        .where('fecha', '>=', fechaLimite)
        .get();

    // Construir índice de fingerprints existentes
    var existentes = snap.docs.map(function(d) {
        var data = d.data();
        return {
            id: d.id,
            fingerprint: data.fingerprint ||
                fingerprintMovimiento(data.fecha, data.monto, data.descripcion)
        };
    });
    var fpExistentes = new Set(existentes.map(function(e) { return e.fingerprint; }));

    // Clasificar cada movimiento parseado
    return parseados.map(function(mov) {
        var fp = fingerprintMovimiento(mov.fecha, mov.monto, mov.descripcion);
        var duplicadoExacto = fpExistentes.has(fp);

        // Posible duplicado: misma fecha + mismo monto, descripción diferente
        var posibleDup = false;
        if (!duplicadoExacto) {
            var partesFp = fp.split('|');
            posibleDup = existentes.some(function(e) {
                var partesE = e.fingerprint.split('|');
                return partesE[0] === partesFp[0] && partesE[1] === partesFp[1];
            });
        }

        return Object.assign({}, mov, {
            fingerprint: fp,
            estado: duplicadoExacto ? 'duplicado'
                  : posibleDup      ? 'posible_duplicado'
                  : 'nuevo'
        });
    });
}


// ── importarMovimientosConfirmados(movimientos, opts) ─────────
//
//  Graba en Firestore (colección 'movimientos') los movimientos
//  aprobados por el usuario. Usa batch para atomicidad.
//
//  Aplica categorización automática a los que no tienen categoría.
//  Salta automáticamente los que tienen estado 'duplicado'.
//
//  @param  {Array}  movimientos  — resultado de conciliarMovimientos(),
//                                  filtrado por el usuario (puede incluir
//                                  'posible_duplicado' si el usuario los aprobó)
//  @param  {Object} opts
//    opts.cuentaId    {string}  — ID de la cuenta
//    opts.moneda      {string}  — 'BRL' | 'USD' | 'UYU' | 'ARS'
//    opts.importadoPor {string} — UID del usuario que importa
//  @returns {Promise<{ importados: number, saltados: number }>}
//
async function importarMovimientosConfirmados(movimientos, opts) {
    var cuentaId     = opts.cuentaId     || '';
    var moneda       = opts.moneda       || 'BRL';
    var importadoPor = opts.importadoPor || null;
    var ahora        = firebase.firestore.FieldValue.serverTimestamp();

    var importados = 0;
    var saltados   = 0;

    // Firestore batch admite máximo 500 operaciones — procesar en lotes
    var LOTE = 400;
    var pendientes = movimientos.filter(function(m) { return m.estado !== 'duplicado'; });
    saltados = movimientos.length - pendientes.length;

    for (var i = 0; i < pendientes.length; i += LOTE) {
        var lote   = pendientes.slice(i, i + LOTE);
        var batch  = db.batch();

        lote.forEach(function(mov) {
            var ref = db.collection('movimientos').doc();
            var cat = inferirCategoria(mov.descripcion);
            batch.set(ref, {
                cuentaId:           cuentaId,
                moneda:             moneda,
                fecha:              mov.fecha,
                descripcion:        mov.descripcion || '',
                monto:              mov.monto || 0,
                tipo:               (mov.monto || 0) >= 0 ? 'credito' : 'debito',
                fingerprint:        mov.fingerprint,
                // Categoría operativa del negocio (vacía por defecto en importación)
                categoria:          '',
                // Categoría personal inferida automáticamente
                categoria_personal: cat.cat      || '',
                etiqueta:           cat.etiqueta  || '',
                origen:             'btg_import',
                importadoPor:       importadoPor,
                importadoEn:        ahora,
                notas:              ''
            });
        });

        await batch.commit();
        importados += lote.length;
    }

    return { importados: importados, saltados: saltados };
}


// ── toDate(val) ───────────────────────────────────────────────
//
//  Convierte cualquier representación de fecha a objeto Date.
//  Resuelve el problema de fechas mixtas (Timestamp vs string)
//  que existe en algunos documentos de Firestore.
//
//  Uso: reemplazar el patrón  val?.toDate ? val.toDate() : new Date(val)
//       por el más simple      CVC.toDate(val)
//
function toDate(val) {
    if (!val)              return null;
    if (val instanceof Date) return val;
    if (val.toDate)        return val.toDate();           // Firestore Timestamp
    if (typeof val === 'string' && val.length === 10)
        return new Date(val + 'T12:00:00');               // 'YYYY-MM-DD'
    return new Date(val);
}


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
    // ── Módulo BTG ──
    BTG_CATEGORIAS, BTG_REGLAS_CAT,
    inferirCategoria,
    fingerprintMovimiento,
    conciliarMovimientos,
    importarMovimientosConfirmados,
    // ── Helper fechas ──
    toDate,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
