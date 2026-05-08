// ============================================================
//  utils.js — Casa Verde Canas
//  Funciones compartidas para todos los módulos internos
//  Incluir en cada página de /interno/ antes del script propio:
//  <script src="utils.js"></script>
// ============================================================

// ── CONFIGURACIÓN FIREBASE ───────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4",
    authDomain: "casaverdecanas-199.firebaseapp.com",
    projectId: "casaverdecanas-199"
};

// Inicializa Firebase solo si no fue inicializado antes
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();
const auth = firebase.auth();


// ── ESTADOS DE RESERVA ───────────────────────────────────────
const ESTADOS_RESERVA = {
    pendiente:  { label: 'Pendiente',  color: '#fff3e0', text: '#f39c12' },
    confirmada: { label: 'Confirmada', color: '#e8f5e9', text: '#27ae60' },
    anulada:    { label: 'Anulada',    color: '#fdecea', text: '#e74c3c' },
    finalizada: { label: 'Finalizada', color: '#e8eaf6', text: '#5c6bc0' }
};

// Genera el HTML del badge de estado
function badgeEstado(estado) {
    const e = ESTADOS_RESERVA[estado] || { label: estado, color: '#f0f0f0', text: '#666' };
    return `<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:${e.color}; color:${e.text};">${e.label}</span>`;
}


// ── VERIFICACIÓN DE AUTENTICACIÓN ────────────────────────────
/**
 * Verifica que haya sesión activa y que el rol sea el correcto.
 * Redirige a index.html si no cumple.
 *
 * @param {string|string[]} rolesPermitidos  'admin' | 'user' | ['admin','user']
 * @returns {Promise<{user, userData}>}
 */
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // ejecutar solo una vez, evita condición de carrera
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
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
                    if (userData.rol === 'user') window.location.href = 'tareas.html';
                    else window.location.href = 'index.html';
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

// Cierra sesión y vuelve al login
async function cerrarSesion() {
    await auth.signOut();
    window.location.href = 'index.html';
}


// ── CÁLCULO DE PRECIO ────────────────────────────────────────
/**
 * Calcula el precio total de una estadía usando tarifas base e intervalos.
 *
 * @param {Object} cabana       Documento completo de la cabaña (con .tarifas)
 * @param {string} checkIn      Fecha ISO: '2025-01-15'
 * @param {string} checkOut     Fecha ISO: '2025-01-20'
 * @param {number} adultos
 * @param {number} ninos
 * @returns {{ noches, subtotal, limpieza, total }}
 */
function calcularPrecio(cabana, checkIn, checkOut, adultos, ninos) {
    const tarifas = cabana.tarifas || {};
    const capacidadBase = cabana.capacidad?.base || 2;
    const personasExtra = Math.max(0, (adultos + ninos) - capacidadBase);

    let subtotal = 0;
    let noches = 0;
    let fecha = new Date(checkIn + 'T12:00:00'); // mediodía para evitar problemas de timezone
    const fin = new Date(checkOut + 'T12:00:00');

    while (fecha < fin) {
        const fechaStr = fecha.toISOString().split('T')[0];
        const intervalo = (tarifas.intervalos || []).find(i => i.desde <= fechaStr && i.hasta >= fechaStr);
        const precioNoche = intervalo ? intervalo.precioNoche : (tarifas.precioBase || 0);
        const precioExtra = intervalo ? intervalo.precioExtra : (tarifas.precioExtraPersona || 0);
        subtotal += precioNoche + (personasExtra * precioExtra);
        fecha.setDate(fecha.getDate() + 1);
        noches++;
    }

    const limpieza = tarifas.precioLimpieza || 0;
    const total = subtotal + limpieza;
    return { noches, subtotal, limpieza, total };
}


// ── CREAR TAREA DE LIMPIEZA ──────────────────────────────────
/**
 * Crea una tarea de limpieza al confirmar una reserva.
 * Busca la reserva siguiente en la misma cabaña para mostrar
 * los datos del próximo huésped.
 *
 * @param {string} reservaId    ID del documento en Firestore
 * @param {Object} reservaData  Datos de la reserva confirmada
 * @param {string} creadoPor    UID del usuario que confirma
 */
async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    // Buscar la próxima reserva en la misma cabaña (confirmada o pendiente)
    let proximoHuesped = null;
    try {
        const proxSnap = await db.collection('reservas')
            .where('caba', '==', reservaData.caba)
            .where('checkIn', '>', reservaData.checkOut)
            .where('estado', 'in', ['confirmada', 'pendiente'])
            .orderBy('checkIn', 'asc')
            .limit(1)
            .get();

        if (!proxSnap.empty) {
            const proxData = proxSnap.docs[0].data();
            const proxCheckIn = proxData.checkIn.toDate ? proxData.checkIn.toDate() : new Date(proxData.checkIn);
            proximoHuesped = {
                nombre: proxData.nombre || '—',
                checkIn: proxCheckIn,
                huespedes: proxData.huespedes || (proxData.adultos + (proxData.ninos || 0)),
                notas: proxData.notas || ''
            };
        }
    } catch (e) {
        console.warn('No se pudo buscar próxima reserva:', e);
    }

    // Armar descripción detallada
    const lineaCheckOut = `🚪 Check-out: ${checkOut.toLocaleDateString('es-AR')} — ${reservaData.nombre} (${reservaData.huespedes} huéspedes)`;
    const lineaCheckIn = proximoHuesped
        ? `🛎️ Check-in siguiente: ${proximoHuesped.checkIn.toLocaleDateString('es-AR')} — ${proximoHuesped.nombre} (${proximoHuesped.huespedes} huéspedes)`
        : `🛎️ Sin reserva siguiente registrada`;
    const lineaNotas = reservaData.notas ? `📝 Notas reserva actual: ${reservaData.notas}` : '';
    const lineaNotasProx = proximoHuesped?.notas ? `📝 Notas próxima reserva: ${proximoHuesped.notas}` : '';
    const lineaMonto = `💰 Monto limpieza: R$ ${reservaData.costoLimpiezaBRL}`;

    const descripcion = [lineaCheckOut, lineaCheckIn, lineaNotas, lineaNotasProx, lineaMonto]
        .filter(Boolean)
        .join('\n');

    await db.collection('tareas').add({
        nombre: `🧹 Limpiar Cabaña ${reservaData.caba} — ${reservaData.nombre}`,
        descripcion: descripcion,
        tipo: 'limpieza',
        prioridad: 'alta',
        estado: 'pendiente',             // pendiente | en_curso | completada
        fechaInicio: checkOut.toISOString().split('T')[0],
        recurrencia: 0,
        activa: true,
        completada: false,
        reservaId: reservaId,
        proximaReservaHuesped: proximoHuesped?.nombre || null,
        proximaReservaCheckIn: proximoHuesped ? firebase.firestore.Timestamp.fromDate(proximoHuesped.checkIn) : null,
        cabaña: reservaData.caba,
        montoLimpieza: reservaData.costoLimpiezaBRL,
        colaboradores: [],               // se completa cuando los colaboradores trabajan
        fechaHoraInicio: null,
        fechaHoraFin: null,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: creadoPor || null
    });
}


// ── LÓGICA DE TAREAS — INICIO / FIN ─────────────────────────
/**
 * Registra que un colaborador inició una tarea de limpieza.
 * Si nadie había iniciado, cambia estado a 'en_curso'.
 *
 * @param {string} tareaId
 * @param {Object} currentUser   { uid, nombre }
 */
async function iniciarTarea(tareaId, currentUser) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');

    const tarea = tareaDoc.data();
    if (tarea.completada) throw new Error('La tarea ya fue completada');

    const colaboradores = tarea.colaboradores || [];
    // Verificar si este usuario ya inició
    const yaInicio = colaboradores.find(c => c.uid === currentUser.uid);
    if (yaInicio) throw new Error('Ya iniciaste esta tarea');

    colaboradores.push({
        uid: currentUser.uid,
        nombre: currentUser.nombre || currentUser.email,
        horaInicio: firebase.firestore.Timestamp.now(),
        horaFin: null,
        horas: null,
        montoRecibido: null,
        pagado: false
    });

    await tareaRef.update({
        colaboradores: colaboradores,
        estado: 'en_curso',
        fechaHoraInicio: tarea.fechaHoraInicio || firebase.firestore.Timestamp.now()
    });
}

/**
 * Registra que un colaborador terminó. Cierra la tarea para todos.
 * Hereda horaFin a colaboradores que no la marcaron.
 * Calcula montos proporcionales a horas trabajadas.
 * Crea pagos_pendientes.
 *
 * @param {string} tareaId
 * @param {Object} currentUser   { uid, nombre }
 */
async function terminarTarea(tareaId, currentUser) {
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tareaDoc = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');

    const tarea = tareaDoc.data();
    if (tarea.completada) throw new Error('La tarea ya fue completada');

    const ahora = firebase.firestore.Timestamp.now();
    const ahoraDate = ahora.toDate();
    let colaboradores = tarea.colaboradores || [];

    // Si quien termina no está en la lista, agregarlo
    const yaRegistrado = colaboradores.find(c => c.uid === currentUser.uid);
    if (!yaRegistrado) {
        colaboradores.push({
            uid: currentUser.uid,
            nombre: currentUser.nombre || currentUser.email,
            horaInicio: tarea.fechaHoraInicio || ahora,
            horaFin: ahora,
            horas: null,
            montoRecibido: null,
            pagado: false
        });
    }

    // Cerrar horaFin para todos los que no la tienen
    colaboradores = colaboradores.map(c => ({
        ...c,
        horaFin: c.horaFin || ahora
    }));

    // Calcular horas de cada uno
    colaboradores = colaboradores.map(c => {
        const inicio = c.horaInicio?.toDate ? c.horaInicio.toDate() : new Date(c.horaInicio);
        const fin = c.horaFin?.toDate ? c.horaFin.toDate() : new Date(c.horaFin);
        const horas = Math.max(0, (fin - inicio) / 3600000); // ms → horas
        return { ...c, horas };
    });

    // Calcular montos proporcionales
    const totalHoras = colaboradores.reduce((sum, c) => sum + (c.horas || 0), 0);
    const montoTotal = tarea.montoLimpieza || 0;
    colaboradores = colaboradores.map(c => ({
        ...c,
        montoRecibido: totalHoras > 0 ? parseFloat(((c.horas / totalHoras) * montoTotal).toFixed(2)) : 0
    }));

    // Guardar tarea completada
    await tareaRef.update({
        colaboradores,
        completada: true,
        estado: 'completada',
        completadaEn: ahora,
        completadaPor: currentUser.uid,
        fechaHoraFin: ahora
    });

    // Crear pagos_pendientes para cada colaborador
    const batch = db.batch();
    for (const col of colaboradores) {
        const pagoRef = db.collection('pagos_pendientes').doc();
        const fechaStr = ahoraDate.toLocaleDateString('es-AR');
        batch.set(pagoRef, {
            colaboradorId: col.uid,
            colaboradorNombre: col.nombre,
            tareaId: tareaId,
            reservaId: tarea.reservaId || null,
            monto: col.montoRecibido,
            moneda: 'BRL',
            concepto: `Limpieza Cabaña ${tarea.cabaña} — ${tarea.reservaId ? tarea.nombre : ''} — ${fechaStr}`,
            pagado: false,
            fechaPago: null,
            creadoEn: ahora
        });
    }
    await batch.commit();

    return colaboradores; // para mostrar resumen en UI
}


// ── HELPERS GENERALES ────────────────────────────────────────

// Escapa HTML para evitar XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m] || m));
}

// Formatea fecha timestamp de Firestore a string legible
function formatFecha(timestamp) {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('es-AR');
}

// Formatea fecha+hora timestamp de Firestore
function formatFechaHora(timestamp) {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleString('es-AR');
}

// Genera colores distintos para cabañas dinámicamente
const COLORES_CABANAS = ['#FF9800', '#3498db', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12'];
function colorCabana(index) {
    return COLORES_CABANAS[index % COLORES_CABANAS.length];
}

// Exportar para uso global
window.CVC = {
    db, auth,
    ESTADOS_RESERVA,
    badgeEstado,
    verificarAuth,
    cerrarSesion,
    calcularPrecio,
    crearTareaLimpieza,
    iniciarTarea,
    terminarTarea,
    escapeHtml,
    formatFecha,
    formatFechaHora,
    colorCabana
};
