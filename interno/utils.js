// ============================================================
//  utils.js — Casa Verde Canas  v2.0
//  Funciones compartidas para todos los módulos de /interno/
//
//  DEPENDENCIAS (cargar antes en cada HTML):
//    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
//    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
//    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
//    <script src="utils.js"></script>
//
//  EXCEPCIÓN: interno/index.html (login) NO incluye utils.js
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
    pendiente:  { label: 'Pendiente',  cssClass: 'badge-pendiente'  },
    confirmada: { label: 'Confirmada', cssClass: 'badge-confirmada' },
    anulada:    { label: 'Anulada',    cssClass: 'badge-anulada'    },
    finalizada: { label: 'Finalizada', cssClass: 'badge-finalizada' }
};

const ESTADOS_TAREA = {
    pendiente:  { label: 'Pendiente',  cssClass: 'badge-pendiente' },
    en_curso:   { label: 'En curso',   cssClass: 'badge-en_curso'  },
    finalizada: { label: 'Finalizada', cssClass: 'badge-finalizada'}
};

const PRIORIDADES = {
    alta:  { label: 'Alta',  cssClass: 'badge-alta'  },
    media: { label: 'Media', cssClass: 'badge-media' },
    baja:  { label: 'Baja',  cssClass: 'badge-baja'  }
};

// Calendar IDs confirmados por cabaña (solo el ID, no el embed)
const CALENDAR_IDS = {
    1: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com',
    2: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com',
    3: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com'
};


// ── BADGES ───────────────────────────────────────────────────
// Usan clases del design-system.css — sin estilos inline

function badgeEstado(estado) {
    const e = ESTADOS_RESERVA[estado] || ESTADOS_TAREA[estado] || { label: estado, cssClass: 'badge-neutral' };
    return `<span class="badge ${e.cssClass}">${e.label}</span>`;
}

function badgePrioridad(prioridad) {
    const p = PRIORIDADES[prioridad] || { label: prioridad, cssClass: 'badge-neutral' };
    return `<span class="badge ${p.cssClass}">${p.label}</span>`;
}


// ── AUTENTICACIÓN ─────────────────────────────────────────────
/**
 * Verifica sesión activa y rol correcto.
 * Solo bloquea si userData.activo === false (explícito).
 * Redirige a index.html si no cumple.
 *
 * @param {string|string[]} rolesPermitidos  'admin' | 'user' | ['admin','user']
 * @returns {Promise<{ user, userData }>}
 */
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) { window.location.href = 'index.html'; return; }
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (!userDoc.exists) {
                    await auth.signOut();
                    window.location.href = 'index.html';
                    return;
                }
                const userData = userDoc.data();

                // Solo bloquea si activo es EXPLÍCITAMENTE false
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
                console.error('Error verificando auth:', e);
                window.location.href = 'index.html';
            }
        });
    });
}

async function cerrarSesion() {
    await auth.signOut();
    window.location.href = 'index.html';
}


// ── CÁLCULO DE PRECIO ────────────────────────────────────────
/**
 * Calcula precio total usando tarifas base e intervalos de temporada.
 *
 * @param {Object} cabana    Documento de Firestore (con .tarifas)
 * @param {string} checkIn   Fecha ISO: '2025-01-15'
 * @param {string} checkOut  Fecha ISO: '2025-01-20'
 * @param {number} adultos
 * @param {number} ninos
 * @returns {{ noches, subtotal, limpieza, total }}
 */
function calcularPrecio(cabana, checkIn, checkOut, adultos, ninos) {
    const tarifas       = cabana.tarifas || {};
    const capacidadBase = cabana.capacidad?.base || 2;
    const personasExtra = Math.max(0, (adultos + ninos) - capacidadBase);

    let subtotal = 0, noches = 0;
    let fecha = new Date(checkIn  + 'T12:00:00');
    const fin = new Date(checkOut + 'T12:00:00');

    while (fecha < fin) {
        const fechaStr  = fecha.toISOString().split('T')[0];
        const intervalo = (tarifas.intervalos || []).find(i => i.desde <= fechaStr && i.hasta >= fechaStr);
        subtotal += (intervalo ? intervalo.precioNoche     : (tarifas.precioBase         || 0))
                  + (intervalo ? intervalo.precioExtra     : (tarifas.precioExtraPersona || 0)) * personasExtra;
        fecha.setDate(fecha.getDate() + 1);
        noches++;
    }

    const limpieza = tarifas.precioLimpieza || 0;
    return { noches, subtotal, limpieza, total: subtotal + limpieza };
}


// ── CREAR TAREA DE LIMPIEZA ──────────────────────────────────
/**
 * Crea una tarea de limpieza al confirmar una reserva.
 * Busca la próxima reserva en la misma cabaña.
 */
// ── SINCRONIZAR DISPONIBILIDAD PÚBLICA ───────────────────────
/**
 * Escribe/actualiza un documento en la colección `disponibilidad`
 * con solo los datos necesarios para mostrar ocupación sin exponer
 * datos personales del huésped.
 *
 * Llamar después de cualquier operación que cambie el estado de una reserva:
 *   create, update estado, anular, finalizar
 */
async function sincronizarDisponibilidad(reservaId, reservaData) {
    try {
        const estado = reservaData.estado || 'pendiente';

        // Solo estados que bloquean el calendario público
        const bloqueante = ['confirmada', 'airbnb_activa'].includes(estado);
        // Estados que liberan el calendario
        const libre = ['anulada', 'finalizada', 'airbnb_cancelada'].includes(estado);

        if (libre) {
            // Eliminar de disponibilidad si existía
            await db.collection('disponibilidad').doc(reservaId).delete();
            return;
        }

        await db.collection('disponibilidad').doc(reservaId).set({
            caba:       reservaData.caba,
            checkIn:    reservaData.checkIn,
            checkOut:   reservaData.checkOut,
            estado,
            bloqueante,
            origen:     reservaData.origen || 'directa',
            // Sin datos personales
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {
        // No bloquear el flujo principal si falla la sincronización
        console.warn('sincronizarDisponibilidad:', e.message);
    }
}

async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut?.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    let proximoHuesped = null;
    try {
        // Sin where+orderBy combinados — traer por cabaña y filtrar en cliente
        const proxSnap = await db.collection('reservas')
            .where('caba', '==', reservaData.caba)
            .get();

        const checkOutDate = checkOut instanceof Date ? checkOut : new Date(reservaData.checkOut);

        const proxima = proxSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => {
                if (!['confirmada', 'pendiente'].includes(r.estado)) return false;
                const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
                return ci > checkOutDate;
            })
            .sort((a, b) => {
                const ca = a.checkIn?.toDate ? a.checkIn.toDate() : new Date(a.checkIn);
                const cb = b.checkIn?.toDate ? b.checkIn.toDate() : new Date(b.checkIn);
                return ca - cb;
            })[0];

        if (proxima) {
            const d  = proxima;
            const ci = d.checkIn?.toDate ? d.checkIn.toDate() : new Date(d.checkIn);
            proximoHuesped = {
                nombre:    d.nombre || '—',
                checkIn:   ci,
                huespedes: d.huespedes || ((d.adultos || 0) + (d.ninos || 0)),
                notas:     d.notas || ''
            };
        }
    } catch (e) {
        console.warn('No se pudo buscar próxima reserva:', e);
    }

    const descripcion = [
        `🚪 Check-out: ${checkOut.toLocaleDateString('es-AR')} — ${reservaData.nombre} (${reservaData.huespedes} huéspedes)`,
        proximoHuesped
            ? `🛎️ Check-in siguiente: ${proximoHuesped.checkIn.toLocaleDateString('es-AR')} — ${proximoHuesped.nombre} (${proximoHuesped.huespedes} huéspedes)`
            : `🛎️ Sin reserva siguiente registrada`,
        reservaData.notas     ? `📝 Notas actuales: ${reservaData.notas}`   : '',
        proximoHuesped?.notas ? `📝 Notas próxima: ${proximoHuesped.notas}` : '',
        `💰 Monto limpieza: R$ ${reservaData.costoLimpiezaBRL || 0}`
    ].filter(Boolean).join('\n');

    await db.collection('tareas').add({
        nombre:      `🧹 Limpiar Cabaña ${reservaData.caba} — ${reservaData.nombre}`,
        descripcion,
        tipo:        'limpieza',
        prioridad:   'alta',
        estado:      'pendiente',
        fechaInicio: checkOut.toISOString().split('T')[0],
        recurrencia: 0,
        monto:       reservaData.costoLimpiezaBRL || 0,
        activa:      true,
        sesiones:    [],
        reservaId,
        proximaReservaHuesped: proximoHuesped?.nombre || null,
        proximaReservaCheckIn: proximoHuesped
            ? firebase.firestore.Timestamp.fromDate(proximoHuesped.checkIn)
            : null,
        cabana:    reservaData.caba,
        creadoEn:  firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: creadoPor || null
    });
}


// ── LÓGICA DE TAREAS ─────────────────────────────────────────
//
//  tarea.sesiones = [
//    { uid, nombre, inicio: Timestamp, fin: Timestamp | null },
//    ...  // un mismo usuario puede tener múltiples sesiones
//  ]
//
//  ESTADOS:
//  'pendiente'  → nadie trabajando ahora (puede tener sesiones cerradas previas)
//  'en_curso'   → al menos una sesión con fin: null
//  'finalizada' → movida a historial, eliminada o reseteada
//
//  FLUJO:
//  ▶️ Iniciar   → agrega sesión abierta, estado → 'en_curso'
//  ⏸️ Pausar    → cierra sesión activa del usuario;
//                 si no quedan abiertas → estado → 'pendiente'
//  ✅ Finalizar → cierra TODAS las sesiones, calcula horas/pagos,
//                 mueve a historial, elimina o resetea según recurrencia

/**
 * Inicia la tarea para el usuario actual.
 * Un mismo usuario no puede tener dos sesiones abiertas simultáneas.
 */
async function iniciarTarea(tareaId, currentUser) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');

    const tarea    = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const sesiones = tarea.sesiones || [];
    if (sesiones.some(s => s.uid === currentUser.uid && s.fin === null))
        throw new Error('Ya tenés una sesión activa en esta tarea');

    sesiones.push({
        uid:    currentUser.uid,
        nombre: currentUser.nombre || currentUser.email,
        inicio: firebase.firestore.Timestamp.now(),
        fin:    null
    });

    await tareaRef.update({ sesiones, estado: 'en_curso' });
}

/**
 * Pausa la tarea para el usuario actual.
 * Cierra su sesión activa.
 * Si no quedan sesiones abiertas → estado vuelve a 'pendiente'.
 */
async function pausarTarea(tareaId, currentUser) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');

    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const ahora = firebase.firestore.Timestamp.now();
    let cerro   = false;

    const sesiones = (tarea.sesiones || []).map(s => {
        if (s.uid === currentUser.uid && s.fin === null) {
            cerro = true;
            return { ...s, fin: ahora };
        }
        return s;
    });

    if (!cerro) throw new Error('No tenés una sesión activa en esta tarea');

    const hayAbierta = sesiones.some(s => s.fin === null);
    await tareaRef.update({ sesiones, estado: hayAbierta ? 'en_curso' : 'pendiente' });
}

/**
 * Finaliza la tarea para TODOS.
 *
 * - Cierra todas las sesiones abiertas
 * - Suma horas de TODAS las sesiones de cada usuario
 * - monto > 0 → crea pagos_pendientes proporcionales a horas
 * - monto = 0 → solo registra en historial, sin pagos
 * - recurrencia = 0 → elimina la tarea de Firestore
 * - recurrencia = N → resetea con fechaInicio = hoy + N días
 *
 * @returns {Array} colaboradores con horas y montos (para mostrar resumen en UI)
 */
async function finalizarTarea(tareaId, currentUser) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');

    const tarea     = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const ahora     = firebase.firestore.Timestamp.now();
    const ahoraDate = ahora.toDate();
    let sesiones    = tarea.sesiones || [];

    // Si quien finaliza nunca participó, registrar presencia mínima
    if (!sesiones.some(s => s.uid === currentUser.uid)) {
        sesiones.push({
            uid:    currentUser.uid,
            nombre: currentUser.nombre || currentUser.email,
            inicio: ahora,
            fin:    ahora
        });
    }

    // Cerrar TODAS las sesiones abiertas
    sesiones = sesiones.map(s => ({ ...s, fin: s.fin === null ? ahora : s.fin }));

    // Calcular horas totales por usuario (suma de todas sus sesiones)
    const horasPor  = {};
    const nombrePor = {};

    for (const s of sesiones) {
        const ini = s.inicio?.toDate ? s.inicio.toDate() : new Date(s.inicio);
        const fin = s.fin?.toDate    ? s.fin.toDate()    : new Date(s.fin);
        const hrs = Math.max(0, (fin - ini) / 3_600_000);
        horasPor[s.uid]  = (horasPor[s.uid] || 0) + hrs;
        nombrePor[s.uid] = s.nombre;
    }

    const totalHoras = Object.values(horasPor).reduce((a, b) => a + b, 0);
    const monto      = tarea.monto || 0;

    const colaboradores = Object.entries(horasPor).map(([uid, horas]) => ({
        uid,
        nombre:        nombrePor[uid],
        horas:         parseFloat(horas.toFixed(2)),
        montoRecibido: monto > 0 && totalHoras > 0
            ? parseFloat(((horas / totalHoras) * monto).toFixed(2))
            : 0
    }));

    // ── Batch ────────────────────────────────────────────────
    const batch   = db.batch();
    const histRef = db.collection('historial_tareas').doc();

    // 1. Guardar en historial
    batch.set(histRef, {
        tareaId,
        nombre:        tarea.nombre,
        descripcion:   tarea.descripcion   || '',
        tipo:          tarea.tipo          || 'general',
        prioridad:     tarea.prioridad     || 'media',
        fechaInicio:   tarea.fechaInicio   || null,
        fechaFin:      ahoraDate.toISOString().split('T')[0],
        monto,
        sesiones,
        colaboradores,
        reservaId:     tarea.reservaId     || null,
        cabana:        tarea.cabana        || null,
        recurrencia:   tarea.recurrencia   || 0,
        finalizadoPor: currentUser.uid,
        finalizadoEn:  ahora,
        creadoEn:      tarea.creadoEn      || null
    });

    // 2. Pagos solo si monto > 0
    if (monto > 0) {
        for (const col of colaboradores) {
            if (col.montoRecibido <= 0) continue;
            const pagoRef = db.collection('pagos_pendientes').doc();
            batch.set(pagoRef, {
                colaboradorId:     col.uid,
                colaboradorNombre: col.nombre,
                tareaId,
                historialId:       histRef.id,
                reservaId:         tarea.reservaId || null,
                monto:             col.montoRecibido,
                moneda:            'BRL',
                concepto:          `Tarea: ${tarea.nombre} — ${ahoraDate.toLocaleDateString('es-AR')}`,
                horas:             col.horas,
                pagado:            false,
                fechaPago:         null,
                creadoEn:          ahora
            });
        }
    }

    // 3. Recurrencia: 0 → eliminar, N → resetear
    const recurrencia = tarea.recurrencia || 0;
    if (recurrencia === 0) {
        batch.delete(tareaRef);
    } else {
        const nuevaFecha = new Date(ahoraDate);
        nuevaFecha.setDate(nuevaFecha.getDate() + recurrencia);
        batch.update(tareaRef, {
            estado:      'pendiente',
            sesiones:    [],
            fechaInicio: nuevaFecha.toISOString().split('T')[0],
            ultimaVez:   ahora
        });
    }

    await batch.commit();
    return colaboradores;
}


// ── URGENCIA DE TAREA ────────────────────────────────────────
/**
 * Calcula el color/urgencia de una tarea.
 *
 * ⬜ gris     → fecha futura (no corresponde aún)
 * 🟢 verde    → es hoy
 * 🟡 amarillo → atrasada pero ≤ ciclo días Y ≤ 10 días
 * 🔴 rojo     → muy atrasada (> ciclo días O > 10 días)
 *
 * Para recurrencia = 0 se usa umbral de 3 días para amarillo.
 *
 * @param {Object} tarea
 * @returns {{ color: 'gris'|'verde'|'amarillo'|'rojo', label: string }}
 */
function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio     = new Date(tarea.fechaInicio + 'T00:00:00');
    const diasAtraso = Math.floor((hoy - inicio) / 86_400_000);

    if (diasAtraso < 0)   return { color: 'gris',     label: 'Próximamente'        };
    if (diasAtraso === 0) return { color: 'verde',    label: 'Hoy'                 };

    const ciclo       = tarea.recurrencia > 0 ? tarea.recurrencia : 3;
    const muyAtrasada = diasAtraso > ciclo || diasAtraso > 10;

    return muyAtrasada
        ? { color: 'rojo',     label: `${diasAtraso}d de atraso` }
        : { color: 'amarillo', label: `${diasAtraso}d de atraso` };
}


// ── HELPERS GENERALES ────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
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

/** Convierte horas decimales → "1h 23m" */
function formatHoras(horas) {
    if (!horas || horas <= 0) return '0m';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

const COLORES_CABANAS = ['#FF9800', '#3498db', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12'];
function colorCabana(index) {
    return COLORES_CABANAS[index % COLORES_CABANAS.length];
}


// ── HELPERS DE UI ────────────────────────────────────────────
// Requieren design-system.css cargado en la página.

function showLoading(container, mensaje = 'Cargando...') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = `
        <div class="state-loading">
            <div class="spinner"></div>
            <span>${escapeHtml(mensaje)}</span>
        </div>`;
}

function showEmpty(container, titulo = 'Sin datos', descripcion = '', icono = 'inbox') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = `
        <div class="state-empty">
            <span class="material-icons">${escapeHtml(icono)}</span>
            <div class="state-empty__title">${escapeHtml(titulo)}</div>
            ${descripcion ? `<div class="state-empty__desc">${escapeHtml(descripcion)}</div>` : ''}
        </div>`;
}

function showError(container, titulo = 'Ocurrió un error', descripcion = '', onRetry = null) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const retryId = onRetry ? `retry-${Date.now()}` : null;
    el.innerHTML = `
        <div class="state-error">
            <span class="material-icons">error_outline</span>
            <div class="state-error__title">${escapeHtml(titulo)}</div>
            ${descripcion ? `<div class="state-error__desc">${escapeHtml(descripcion)}</div>` : ''}
            ${retryId ? `<button class="btn btn-secondary" id="${retryId}">
                <span class="material-icons">refresh</span> Reintentar
            </button>` : ''}
        </div>`;
    if (retryId) document.getElementById(retryId)?.addEventListener('click', onRetry);
}

function showToast(mensaje, tipo = 'success') {
    const iconos = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    let wrap = document.getElementById('cvc-toasts');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'cvc-toasts';
        wrap.className = 'toast-container';
        document.body.appendChild(wrap);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `<span class="material-icons">${iconos[tipo] || 'info'}</span><span>${escapeHtml(mensaje)}</span>`;
    wrap.appendChild(toast);
    setTimeout(() => toast.remove(), 3300);
}


// ── EXPORTAR ─────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
