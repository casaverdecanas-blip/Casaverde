// ============================================================
//  utils.js — Casa Verde Canas  v4.2
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


// ── VERIFICAR DISPONIBILIDAD ──────────────────────────────────
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
    return '⚠️ Fechas no disponibles — ya existe una reserva ('
        + etiqueta + ') del ' + ci + ' al ' + co
        + ' para ' + (conflicto.nombre !== 'Sin nombre' ? conflicto.nombre : 'otro huésped') + '.';
}


// ── SINCRONIZAR DISPONIBILIDAD PÚBLICA ───────────────────────
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
        ? reservaData.checkOut.toDate().toISOString().slice(0, 10)
        : reservaData.checkOut;

    await db.collection('tareas').add({
        nombre:      'Limpieza — Cabaña ' + (reservaData.caba || ''),
        tipo:        'limpieza',
        estado:      'pendiente',
        prioridad:   'alta',
        fechaInicio: checkOut,
        recurrencia: 0,
        activa:      true,
        reservaId,
        clienteNombre: reservaData.nombre || '',
        creadoEn:    firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor
    });
}


// ── MÓDULO DE TAREAS ──────────────────────────────────────────

async function iniciarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');

    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

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

    const todasSnap  = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (!sesAbierta) throw new Error('No tenés una sesión activa en esta tarea');

    const ahora = firebase.firestore.Timestamp.now();
    await sesAbierta.ref.update({ fin: ahora });

    const todasSnap2     = await sesionesRef.get();
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

    // Cerrar sesión abierta del usuario actual si existe
    const todasSnap  = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap.docs.find(d => d.data().fin === null);
    const ahora      = firebase.firestore.Timestamp.now();
    if (sesAbierta) {
        await sesAbierta.ref.update({ fin: ahora });
    }

    // Cargar todas las sesiones para calcular horas
    const todasFinal = await sesionesRef.get();
    const sesiones   = todasFinal.docs.map(d => d.data());

    // Calcular horas por colaborador (sesiones >= 5 min solamente)
    const porColaborador = {};
    for (const s of sesiones) {
        if (!s.fin || !s.inicio) continue;
        const inicioMs = s.inicio.toDate ? s.inicio.toDate().getTime() : new Date(s.inicio).getTime();
        const finMs    = s.fin.toDate    ? s.fin.toDate().getTime()    : new Date(s.fin).getTime();
        const horas    = (finMs - inicioMs) / 3600000;
        if (horas < (5 / 60)) continue;  // ignorar sesiones < 5 min
        if (!porColaborador[s.uid]) {
            porColaborador[s.uid] = { uid: s.uid, nombre: s.nombre, horas: 0 };
        }
        porColaborador[s.uid].horas += horas;
    }

    const colaboradores = Object.values(porColaborador);

    // CORRECCIÓN BUG: no crear historial si no hay colaboradores con horas
    if (colaboradores.length === 0) {
        await tareaRef.update({
            estado:          'finalizada',
            finalizadoEn:    ahora,
            sesionesActivas: []
        });
        return;
    }

    // Leer tarifa de honorarios de cada colaborador
    const honorariosProm = colaboradores.map(async (c) => {
        try {
            const uDoc = await db.collection('usuarios').doc(c.uid).get();
            return uDoc.exists ? (uDoc.data().tarifaHora || 0) : 0;
        } catch(e) { return 0; }
    });
    const tarifas = await Promise.all(honorariosProm);

    // Calcular monto y crear honorarios
    let totalMonto = 0;
    const colaboradoresConMonto = colaboradores.map((c, i) => {
        const monto = parseFloat((c.horas * tarifas[i]).toFixed(2));
        totalMonto += monto;
        return { ...c, horas: parseFloat(c.horas.toFixed(2)), monto };
    });

    // Guardar honorarios individuales
    for (const c of colaboradoresConMonto) {
        if (c.monto <= 0) continue;
        await db.collection('honorarios').add({
            uid:         c.uid,
            nombre:      c.nombre,
            tareaId,
            tareaNombre: tarea.nombre || '',
            horas:       c.horas,
            monto:       c.monto,
            moneda:      'BRL',
            pagado:      false,
            creadoEn:    ahora
        });
    }

    // Guardar en historial_tareas
    await db.collection('historial_tareas').add({
        tareaId,
        nombre:        tarea.nombre || '',
        tipo:          tarea.tipo   || '',
        colaboradores: colaboradoresConMonto,
        totalHoras:    parseFloat(colaboradoresConMonto.reduce((s, c) => s + c.horas, 0).toFixed(2)),
        totalMonto:    parseFloat(totalMonto.toFixed(2)),
        moneda:        'BRL',
        finalizadoEn:  ahora,
        finalizadoPor: currentUser.uid
    });

    // Marcar tarea como finalizada
    await tareaRef.update({
        estado:          'finalizada',
        finalizadoEn:    ahora,
        sesionesActivas: []
    });
}

async function getHistorialTareas(tareaId) {
    try {
        const snap = await db.collection('historial_tareas')
            .where('tareaId', '==', tareaId)
            .get();

        if (snap.empty) return { totalVeces: 0, ultimaVez: null, porUsuario: [], resumen: { totalHoras: 0, totalMonto: 0, colaboradoresUnicos: 0 } };

        const registros = snap.docs
            .map(d => d.data())
            .sort((a, b) => {
                const ta = a.finalizadoEn?.toDate ? a.finalizadoEn.toDate().getTime() : 0;
                const tb = b.finalizadoEn?.toDate ? b.finalizadoEn.toDate().getTime() : 0;
                return tb - ta;
            });

        let totalHoras = 0, totalMonto = 0;
        const porUsuario = {};
        const colaboradoresUnicos = new Set();

        for (const r of registros) {
            for (const c of (r.colaboradores || [])) {
                totalHoras += c.horas  || 0;
                totalMonto += c.monto  || 0;
                colaboradoresUnicos.add(c.uid || c.nombre);
                if (!porUsuario[c.uid || c.nombre]) {
                    porUsuario[c.uid || c.nombre] = { uid: c.uid, nombre: c.nombre, horas: 0, monto: 0, veces: 0 };
                }
                porUsuario[c.uid || c.nombre].horas += c.horas  || 0;
                porUsuario[c.uid || c.nombre].monto += c.monto  || 0;
                porUsuario[c.uid || c.nombre].veces += 1;
            }
        }

        const porUsuarioArray = Object.values(porUsuario)
            .map(u => ({ ...u, horas: parseFloat(u.horas.toFixed(2)), monto: parseFloat(u.monto.toFixed(2)) }))
            .sort((a, b) => b.horas - a.horas);

        const ultimaVez = registros[0].finalizadoEn?.toDate
            ? registros[0].finalizadoEn.toDate()
            : null;

        return {
            totalVeces: registros.length,
            ultimaVez,
            porUsuario: porUsuarioArray,
            resumen: {
                totalHoras:           parseFloat(totalHoras.toFixed(2)),
                totalMonto:           parseFloat(totalMonto.toFixed(2)),
                colaboradoresUnicos:  colaboradoresUnicos.size
            }
        };
    } catch (e) {
        console.warn('getHistorialTareas:', e.message);
        return { totalVeces: 0, ultimaVez: null, porUsuario: [], resumen: { totalHoras: 0, totalMonto: 0, colaboradoresUnicos: 0 } };
    }
}

function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };
    if (tarea.estado === 'en_curso') return { color: 'verde', label: 'En curso' };

    const hoy        = new Date(); hoy.setHours(0, 0, 0, 0);
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


// ── HELPERS DE UI ─────────────────────────────────────────────
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


// ── BTG: categorías automáticas ───────────────────────────────
const BTG_CATEGORIAS = [
    { palabras: ['airbnb', 'air bnb'],                   cat: 'Airbnb',            etiqueta: 'Liquidación Airbnb'   },
    { palabras: ['celesc', 'energia', 'energía'],         cat: 'Luz (Celesc)',       etiqueta: ''                     },
    { palabras: ['casan', 'agua', 'saneamento'],          cat: 'Agua (Casan)',       etiqueta: ''                     },
    { palabras: ['internet', 'claro', 'vivo', 'tim'],     cat: 'Internet',           etiqueta: ''                     },
    { palabras: ['gas', 'ultragaz', 'liquigas'],          cat: 'Gas',               etiqueta: ''                     },
    { palabras: ['iptu'],                                  cat: 'IPTU',              etiqueta: ''                     },
    { palabras: ['limpeza', 'limpieza', 'faxina'],        cat: 'Honorarios limpieza',etiqueta: ''                     },
    { palabras: ['supermercado', 'mercado', 'atacadao',
                 'bistek', 'angeloni'],                   cat: 'Insumos limpieza',  etiqueta: ''                     },
    { palabras: ['farmacia', 'farmácia', 'drogaria'],     cat: 'Amenities / baño',  etiqueta: ''                     },
    { palabras: ['construção', 'construcao', 'leroy',
                 'telhanorte', 'c&c', 'materiais'],       cat: 'Materiales',        etiqueta: ''                     },
    { palabras: ['pix enviado', 'ted', 'transferencia',
                 'transf'],                               cat: 'Entre cuentas propias', etiqueta: 'Verificar destino' },
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
    // Obtener fechas únicas del extracto para consulta acotada
    const fechas = [...new Set(movimientos.map(m => m.fecha))].filter(Boolean);
    if (!fechas.length) return movimientos.map(m => ({ ...m, estado: 'nuevo' }));

    // Firestore: máximo 30 valores en 'in'
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
            e.descripcion?.slice(0, 20).toLowerCase().replace(/\s+/g, '') === (m.descripcion || '').slice(0, 20).toLowerCase().replace(/\s+/g, '')
        );
        const posibleDup = !dupExacto && existentes.find(e =>
            e.fecha === m.fecha &&
            Math.abs(e.monto - m.monto) < 0.01
        );
        return {
            ...m,
            fingerprint: fp,
            estado: dupExacto ? 'duplicado' : posibleDup ? 'posible_duplicado' : 'nuevo'
        };
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
                cuentaId,
                moneda,
                fecha:        m.fecha,
                descripcion:  m.descripcion,
                monto:        m.monto,
                tipo:         m.tipo || (m.monto >= 0 ? 'credito' : 'debito'),
                saldoPost:    m.saldoPost || null,
                categoriaId:  null,
                etiqueta:     '',
                reservaId:    null,
                tareaId:      null,
                pixId:        '',
                // Campos de conciliación (inicialmente vacíos)
                conciliado:   false,
                conciliadoNivel:  null,
                conciliadoConId:  null,
                conciliadoConCol: null,
                importadoEn:  firebase.firestore.FieldValue.serverTimestamp(),
                importadoPor
            });
            importados++;
        });
        await batch.commit();
    }
    return { importados, saltados };
}


// ── MOTOR DE AUTO-CONCILIACIÓN ────────────────────────────────

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

    const montoBanco     = Math.abs(movBanco.monto);
    const esCreditoBanco = movBanco.monto >= 0;
    let mejorMatch = null, mejorNivel = 'C', mejorConfianza = 0;
    let mejorRazon = 'Sin coincidencia en el sistema';

    for (const reg of registros) {
        const fechaReg     = _toDateStr(reg.fecha || reg.creadoEn);
        const montoReg     = Math.abs(reg.monto || reg.total_neto || 0);
        if (!montoReg) continue;
        const esCreditoReg = reg._coleccion === 'pagos' || reg._coleccion === 'informes_airbnb';
        if (esCreditoBanco !== esCreditoReg) continue;

        const difMonto  = montoReg > 0 ? Math.abs(montoBanco - montoReg) / montoReg : 1;
        const difDias   = _diasDiferencia(movBanco.fecha, fechaReg);
        const nombreRef = reg.clienteNombre || reg.proveedor || reg.anfitrion || '';
        const origenOk  = _esAirbnb(movBanco.descripcion, palabrasClaveAirbnb) ||
                          _descripcionContiene(movBanco.descripcion, nombreRef);

        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasA && origenOk) {
            const confianza = 1.0 - (difMonto * 10) - (difDias * 0.02);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'A'; mejorConfianza = confianza;
                mejorRazon = 'Monto ±' + (difMonto*100).toFixed(2) + '% · Fecha ±' + difDias + 'd · Origen reconocido';
            }
            continue;
        }
        if (difMonto <= toleranciaMontoPctA && difDias <= toleranciaFechaDiasB) {
            const confianza = 0.8 - (difDias * 0.03);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = confianza;
                mejorRazon = 'Monto exacto · Fecha ±' + difDias + 'd (fuera ventana A)';
            }
        } else if (difMonto <= toleranciaMontoPctB && difDias <= toleranciaFechaDiasB && origenOk) {
            const confianza = 0.65 - (difMonto * 5) - (difDias * 0.02);
            if (confianza > mejorConfianza) {
                mejorMatch = reg; mejorNivel = 'B'; mejorConfianza = confianza;
                mejorRazon = 'Monto ±' + (difMonto*100).toFixed(2) + '% · Fecha ±' + difDias + 'd · Origen reconocido';
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


// ── NAVEGACIÓN v4.2 ───────────────────────────────────────────
const NAV_ADMIN_ITEMS = [
    { href: 'dashboard.html',   icon: 'dashboard',      label: 'Dashboard'  },
    { href: 'calendario.html',  icon: 'calendar_month', label: 'Calendario' },
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
            { href: 'pagos.html',           icon: 'payments',        label: 'Ingresos / Egresos' },
            { href: 'informes-airbnb.html', icon: 'summarize',       label: 'Informes Airbnb'    },
            { sep: true },
            { href: 'cuentas.html',         icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',     icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'herramientas-btg.html',icon: 'compare_arrows',  label: 'BTG / Conciliación' },
            { href: 'categorias.html',      icon: 'label',           label: 'Categorías'         },
        ]
    },
    {
        group: 'Operaciones', icon: 'checklist',
        items: [
            { href: 'tareas.html',    icon: 'checklist', label: 'Tareas'    },
            { href: 'pendientes.html',icon: 'playlist_add_check', label: 'Pendientes' },
        ]
    },
    {
        group: 'Fiscal', icon: 'receipt',
        items: [
            { href: 'fiscal.html',         icon: 'receipt',          label: 'Panel fiscal'    },
            { href: 'acceso-contador.html', icon: 'person_outline',  label: 'Acceso contador' },
        ]
    },
    {
        group: 'Config.', icon: 'settings',
        items: [
            { href: 'cabanas-admin.html',  icon: 'cottage',          label: 'Cabañas'  },
            { href: 'usuarios.html',       icon: 'manage_accounts',  label: 'Usuarios' },
            { sep: true },
            { href: 'manual-sistema.html', icon: 'menu_book',        label: 'Manual'   },
        ]
    }
];

const NAV_USER_ITEMS = [
    { href: 'tareas.html',         icon: 'checklist', label: 'Tareas'     },
    { href: 'pagos.html',          icon: 'payments',  label: 'Mis cobros' },
    { href: 'manual-sistema.html', icon: 'menu_book', label: 'Manual'     }
];

function renderNav(paginaActual, rol) {
    const nav    = document.getElementById('appNav');
    if (!nav) return;
    const items  = (rol === 'user') ? NAV_USER_ITEMS : NAV_ADMIN_ITEMS;
    const pagina = paginaActual || '';

    nav.innerHTML = items.map(function(item) {
        if (item.href) {
            const activo = pagina === item.href || pagina.endsWith('/' + item.href);
            return '<a href="' + item.href + '" class="nav-link' + (activo ? ' active' : '') + '">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
        }

        if (item.group) {
            const grupoId    = 'navg-' + item.group.replace(/[^a-z0-9]/gi, '').toLowerCase();
            const tieneActivo = (item.items || []).some(sub =>
                sub.href && (pagina === sub.href || pagina.endsWith('/' + sub.href))
            );
            const panelItems = (item.items || []).map(function(sub) {
                if (sub.sep) return '<div class="nav-dropdown__sep"></div>';
                const activo = pagina === sub.href || pagina.endsWith('/' + sub.href);
                return '<a href="' + sub.href + '" class="nav-dropdown__item' + (activo ? ' active' : '') + '">'
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

    document.removeEventListener('click', _cerrarDropdowns);
    document.addEventListener('click', _cerrarDropdowns);
}

function toggleNavDrop(e, id) {
    e.stopPropagation();
    const dropEl = document.getElementById(id);
    if (!dropEl) return;
    const estaAbierto = dropEl.classList.contains('open');
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.top = ''; p.style.left = ''; }
    });
    if (estaAbierto) return;
    const trigger = dropEl.querySelector('.nav-dropdown__trigger');
    const rect    = trigger.getBoundingClientRect();
    const panel   = dropEl.querySelector('.nav-dropdown__panel');
    panel.style.top  = (rect.bottom + 2) + 'px';
    panel.style.left = rect.left + 'px';
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

window.toggleNavDrop = toggleNavDrop;


// ── EXPORTAR ──────────────────────────────────────────────────
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
    BTG_CATEGORIAS, inferirCategoria, fingerprintMovimiento,
    conciliarMovimientos, importarMovimientosConfirmados,
    matchMovimientoBancario, conciliarContraRegistros,
    guardarConciliacion, cargarConfigConciliacion,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
