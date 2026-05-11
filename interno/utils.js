// ============================================================
//  utils.js — Casa Verde Canas  v3.0
//  Funciones compartidas · /interno/
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
    pendiente:        { label: 'Pendiente',          cssClass: 'badge-pendiente'  },
    confirmada:       { label: 'Confirmada',         cssClass: 'badge-confirmada' },
    anulada:          { label: 'Anulada',            cssClass: 'badge-anulada'    },
    finalizada:       { label: 'Finalizada',         cssClass: 'badge-finalizada' },
    airbnb_activa:    { label: 'Airbnb',             cssClass: 'badge-neutral'    },
    airbnb_cancelada: { label: 'Cancelada Airbnb',   cssClass: 'badge-pendiente'  }
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
    let fecha = new Date(checkIn  + 'T12:00:00');
    const fin = new Date(checkOut + 'T12:00:00');

    while (fecha < fin) {
        const fechaStr  = fecha.toISOString().split('T')[0];
        const intervalo = (tarifas.intervalos || []).find(
            i => i.desde <= fechaStr && i.hasta >= fechaStr
        );
        subtotal += (intervalo ? intervalo.precioNoche     : (tarifas.precioBase         || 0))
                  + (intervalo ? intervalo.precioExtra     : (tarifas.precioExtraPersona || 0)) * personasExtra;
        fecha.setDate(fecha.getDate() + 1);
        noches++;
    }

    const limpieza = tarifas.precioLimpieza || 0;
    return { noches, subtotal, limpieza, total: subtotal + limpieza };
}


// ── SINCRONIZAR DISPONIBILIDAD PÚBLICA ───────────────────────
async function sincronizarDisponibilidad(reservaId, reservaData) {
    try {
        const estado    = reservaData.estado || 'pendiente';
        const bloqueante = ['confirmada', 'airbnb_activa', 'pendiente'].includes(estado);
        const libre      = ['anulada', 'finalizada', 'airbnb_cancelada'].includes(estado);

        if (libre) {
            await db.collection('disponibilidad').doc(reservaId).delete();
            return;
        }

        await db.collection('disponibilidad').doc(reservaId).set({
            caba:         reservaData.caba,
            checkIn:      reservaData.checkIn,
            checkOut:     reservaData.checkOut,
            estado,
            bloqueante,
            origen:       reservaData.origen || 'directa',
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {
        console.warn('sincronizarDisponibilidad:', e.message);
    }
}


// ── CREAR TAREA DE LIMPIEZA ──────────────────────────────────
async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut?.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    let proximoHuesped = null;
    try {
        const proxSnap = await db.collection('reservas')
            .where('caba', '==', reservaData.caba).get();

        const proxima = proxSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => {
                if (!['confirmada', 'pendiente'].includes(r.estado)) return false;
                const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
                return ci > checkOut;
            })
            .sort((a, b) => {
                const ca = a.checkIn?.toDate ? a.checkIn.toDate() : new Date(a.checkIn);
                const cb = b.checkIn?.toDate ? b.checkIn.toDate() : new Date(b.checkIn);
                return ca - cb;
            })[0];

        if (proxima) {
            const ci = proxima.checkIn?.toDate ? proxima.checkIn.toDate() : new Date(proxima.checkIn);
            proximoHuesped = {
                nombre:    proxima.nombre || '—',
                checkIn:   ci,
                huespedes: proxima.huespedes || ((proxima.adultos || 0) + (proxima.ninos || 0)),
                notas:     proxima.notas || ''
            };
        }
    } catch(e) {
        console.warn('proxima reserva:', e);
    }

    const descripcion = [
        'Checkout: ' + checkOut.toLocaleDateString('es-AR') + ' — ' + reservaData.nombre,
        proximoHuesped
            ? 'Checkin siguiente: ' + proximoHuesped.checkIn.toLocaleDateString('es-AR') + ' — ' + proximoHuesped.nombre
            : 'Sin reserva siguiente registrada',
        reservaData.notas     ? 'Notas: ' + reservaData.notas        : '',
        proximoHuesped?.notas ? 'Notas proxima: ' + proximoHuesped.notas : '',
        'Limpieza: R$ ' + (reservaData.costoLimpiezaBRL || 0)
    ].filter(Boolean).join('\n');

    await db.collection('tareas').add({
        nombre:      'Limpiar Cabana ' + reservaData.caba + ' — ' + reservaData.nombre,
        descripcion,
        tipo:        'limpieza',
        prioridad:   'alta',
        estado:      'pendiente',
        fechaInicio: checkOut.toISOString().split('T')[0],
        recurrencia: 0,
        monto:       reservaData.costoLimpiezaBRL || 0,
        activa:      true,
        reservaId,
        cabana:      reservaData.caba,
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

    // Filtrar en cliente para evitar índice compuesto en subcolección
    const todasSnap = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const yaAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (yaAbierta) throw new Error('Ya tenes una sesion activa en esta tarea');

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

    // Filtrar en cliente para evitar índice compuesto en subcolección
    const todasSnap2 = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap2.docs.find(d => d.data().fin === null);
    if (!sesAbierta) throw new Error('No tenes una sesion activa en esta tarea');

    const ahora = firebase.firestore.Timestamp.now();
    await sesAbierta.ref.update({ fin: ahora });

    // Verificar si quedan sesiones abiertas (sin índice compuesto)
    const todasSnap3 = await sesionesRef.get();
    const quedanAbiertas = todasSnap3.docs.some(d => d.data().fin === null);
    const sesActuales = (tareaDoc.data().sesionesActivas || []).filter(s => s.uid !== currentUser.uid);
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

    // Leer sesiones de subcoleccion
    const sesSnap = await sesionesRef.get();
    let sesiones  = sesSnap.docs.map(d => ({ _ref: d.ref, ...d.data() }));

    // Si quien finaliza no participo, registrar presencia minima
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

    const totalHoras   = Object.values(horasPor).reduce((a, b) => a + b, 0);
    const monto        = tarea.monto || 0;
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

    // 2. Honorarios (no pagos_pendientes)
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

    // 3. Recurrencia
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

    // Limpiar sesiones si hay recurrencia
    if (recurrencia > 0) {
        const b3 = db.batch();
        for (const s of sesiones) b3.delete(s._ref);
        await b3.commit();
    }

    return colaboradores;
}


// ── URGENCIA DE TAREA ────────────────────────────────────────
function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio     = new Date(tarea.fechaInicio + 'T00:00:00');
    const diasAtraso = Math.floor((hoy - inicio) / 86400000);

    if (diasAtraso < 0)   return { color: 'gris',     label: 'Proximamente'         };
    if (diasAtraso === 0) return { color: 'verde',    label: 'Hoy'                  };

    const ciclo       = tarea.recurrencia > 0 ? tarea.recurrencia : 3;
    const muyAtrasada = diasAtraso > ciclo || diasAtraso > 10;

    return muyAtrasada
        ? { color: 'rojo',     label: diasAtraso + 'd de atraso' }
        : { color: 'amarillo', label: diasAtraso + 'd de atraso' };
}


// ── HELPERS ───────────────────────────────────────────────────
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
    el.innerHTML = '<div class="state-loading"><div class="spinner"></div><span>' + escapeHtml(mensaje) + '</span></div>';
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
    titulo      = titulo      || 'Ocurrio un error';
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
    var iconos = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    var wrap = document.getElementById('cvc-toasts');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'cvc-toasts';
        wrap.className = 'toast-container';
        document.body.appendChild(wrap);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.innerHTML = '<span class="material-icons">' + (iconos[tipo] || 'info') + '</span><span>' + escapeHtml(mensaje) + '</span>';
    wrap.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3300);
}


// ── NAV CENTRALIZADA ─────────────────────────────────────────
const NAV_ADMIN_ITEMS = [
    { href: 'dashboard.html',     icon: 'dashboard',       label: 'Dashboard'     },
    { href: 'reservas.html',      icon: 'event',           label: 'Reservas'      },
    { href: 'presupuestos.html',  icon: 'request_quote',   label: 'Presupuestos'  },
    { href: 'pagos.html',         icon: 'payments',        label: 'Finanzas'      },
    { href: 'clientes.html',      icon: 'people',          label: 'Clientes'      },
    { href: 'cabanas-admin.html', icon: 'cottage',         label: 'Cabanas'       },
    { href: 'tareas.html',        icon: 'checklist',       label: 'Tareas'        },
    { href: 'calendario.html',    icon: 'calendar_month',  label: 'Calendario'    },
    { href: 'usuarios.html',      icon: 'manage_accounts', label: 'Usuarios'      }
];

const NAV_USER_ITEMS = [
    { href: 'tareas.html', icon: 'checklist', label: 'Tareas'     },
    { href: 'pagos.html',  icon: 'payments',  label: 'Mis cobros' }
];

function renderNav(paginaActiva, rol) {
    rol = rol || 'admin';
    var el = document.getElementById('appNav') || document.querySelector('.admin-nav');
    if (!el) return;
    var items = rol === 'admin' ? NAV_ADMIN_ITEMS : NAV_USER_ITEMS;
    el.innerHTML = items.map(function(item) {
        var activo = item.href === paginaActiva || item.href.replace('.html', '') === paginaActiva;
        return '<a href="' + item.href + '" class="nav-item' + (activo ? ' active' : '') + '">'
            + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
    }).join('');
}


// ── EXPORTAR ─────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
