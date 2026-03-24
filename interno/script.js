// ============================================
// CONFIGURACIÓN FIREBASE
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyDluIIBwIJVkO9DEX4ghJQYhzJAnXtQoKs",
    authDomain: "tatareas-d8a80.firebaseapp.com",
    projectId: "tatareas-d8a80",
    storageBucket: "tatareas-d8a80.firebasestorage.app",
    messagingSenderId: "709332495480",
    appId: "1:709332495480:web:7060b2c75984352354918d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ============================================
// VARIABLES GLOBALES
// ============================================
let currentUser = null;
let currentFilter = 'tareas';
let unsubscribeTasks = null;
let unsubscribeHistorial = null;
let tareasCache = [];
let historialCache = [];

// ============================================
// ELEMENTOS DEL DOM
// ============================================
const loginContainer = document.getElementById('loginContainer');
const privateArea = document.getElementById('privateArea');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');
const loginError = document.getElementById('loginError');
const todayDate = document.getElementById('todayDate');
const filterTabs = document.querySelectorAll('.filter-tab');
const contentArea = document.getElementById('contentArea');
const pendingToday = document.getElementById('pendingToday');
const completedToday = document.getElementById('completedToday');
const totalActive = document.getElementById('totalActive');
const weeklyStatsText = document.getElementById('weeklyStatsText');
const weeklyProgress = document.getElementById('weeklyProgress');
const tareasCount = document.getElementById('tareasCount');
const semanaCount = document.getElementById('semanaCount');
const historialCount = document.getElementById('historialCount');

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

function getRecurrenciaText(recurrencia) {
    const map = { 
        'none': 'Una vez', 
        'daily': 'Diaria', 
        'weekly': 'Semanal', 
        'biweekly': '2 veces/semana', 
        'monthly': 'Mensual' 
    };
    return map[recurrencia] || recurrencia;
}

function getEspaciadoMinimo(recurrencia) {
    switch (recurrencia) {
        case 'daily': return 1;
        case 'biweekly': return 3;
        case 'weekly': return 6;
        case 'monthly': return 28;
        default: return 0;
    }
}

function getInicioSemana() {
    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    const dia = fecha.getDay();
    const diff = dia === 0 ? 6 : dia - 1;
    fecha.setDate(fecha.getDate() - diff);
    return fecha;
}

// Obtener la última realización de una tarea desde el historial
async function obtenerUltimaRealizacion(tareaId) {
    try {
        const snapshot = await db.collection('historial')
            .where('tareaId', '==', tareaId)
            .orderBy('fecha', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) return null;
        const data = snapshot.docs[0].data();
        return {
            fecha: data.fecha.toDate(),
            quien: data.completadaPor
        };
    } catch (error) {
        console.error('Error obteniendo última realización:', error);
        return null;
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
const hoy = new Date();
todayDate.textContent = hoy.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
});

function showPrivateArea() { 
    loginContainer.style.display = 'none'; 
    privateArea.style.display = 'block'; 
}

function showLoginArea() { 
    loginContainer.style.display = 'flex'; 
    privateArea.style.display = 'none'; 
}

// ============================================
// AUTENTICACIÓN CON REDIRECCIÓN PARA ADMIN
// ============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        userEmail.textContent = user.email;
        
        // Verificar si es admin desde Firestore
        let esAdmin = false;
        try {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().rol === 'admin') {
                esAdmin = true;
            }
        } catch (error) {
            console.error('Error verificando rol de admin:', error);
        }
        
        // SI ES ADMIN, REDIRIGIR AL PANEL ADMIN
        if (esAdmin) {
            window.location.href = 'admin-tareas.html';
            return;
        }
        
        // SI NO ES ADMIN, MOSTRAR GESTOR NORMAL
        showPrivateArea();
        await cargarDatosIniciales();
        configurarListenersTiempoReal();
    } else {
        currentUser = null;
        showLoginArea();
        if (unsubscribeTasks) unsubscribeTasks();
        if (unsubscribeHistorial) unsubscribeHistorial();
    }
});

// ============================================
// LOGIN CON CREACIÓN AUTOMÁTICA EN FIRESTORE
// ============================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (password.length < 6) {
        loginError.textContent = 'La contraseña debe tener al menos 6 caracteres';
        loginError.style.display = 'block';
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        loginError.style.display = 'none';
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const newUser = userCredential.user;
                
                // Guardar en Firestore
                await db.collection('usuarios').doc(newUser.uid).set({
                    email: email,
                    nombre: '',
                    rol: 'user',
                    telefono: '',
                    creadoEn: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('✅ Nuevo usuario registrado:', email);
                loginError.style.display = 'none';
            } catch (createError) {
                console.error('Error al crear usuario:', createError);
                loginError.textContent = 'Error al crear usuario';
                loginError.style.display = 'block';
            }
        } else {
            loginError.textContent = 'Email o contraseña incorrectos';
            loginError.style.display = 'block';
        }
    }
});

logoutBtn.addEventListener('click', () => auth.signOut());

// ============================================
// LISTENERS EN TIEMPO REAL
// ============================================
function configurarListenersTiempoReal() {
    if (unsubscribeTasks) unsubscribeTasks();
    unsubscribeTasks = db.collection('tareas').where('activa', '==', true).onSnapshot((snapshot) => {
        tareasCache = [];
        snapshot.forEach(doc => tareasCache.push({ id: doc.id, ...doc.data() }));
        actualizarDashboard();
        actualizarVista();
    }, (error) => console.error('Error en tareas:', error));

    if (unsubscribeHistorial) unsubscribeHistorial();
    unsubscribeHistorial = db.collection('historial').orderBy('fecha', 'desc').limit(1000).onSnapshot((snapshot) => {
        historialCache = [];
        snapshot.forEach(doc => historialCache.push({ id: doc.id, ...doc.data() }));
        actualizarDashboard();
        actualizarVista();
    }, (error) => console.error('Error en historial:', error));
}

// ============================================
// CARGAR DATOS INICIALES
// ============================================
async function cargarDatosIniciales() {
    try {
        const tareasSnapshot = await db.collection('tareas').where('activa', '==', true).get();
        tareasCache = [];
        tareasSnapshot.forEach(doc => tareasCache.push({ id: doc.id, ...doc.data() }));
        
        const historialSnapshot = await db.collection('historial').orderBy('fecha', 'desc').limit(1000).get();
        historialCache = [];
        historialSnapshot.forEach(doc => historialCache.push({ id: doc.id, ...doc.data() }));
        
        actualizarDashboard();
        actualizarVista();
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// ============================================
// CALCULAR OCURRENCIAS SEMANALES
// ============================================
function calcularOcurrenciasSemanales(tarea) {
    if (!tarea.activa || !tarea.fechaInicio) return 0;
    try {
        const fechaInicio = new Date(tarea.fechaInicio + 'T00:00:00');
        const inicioSemana = getInicioSemana();
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(inicioSemana.getDate() + 6);
        finSemana.setHours(23, 59, 59, 999);
        
        if (tarea.recurrencia === 'none') {
            return (fechaInicio >= inicioSemana && fechaInicio <= finSemana) ? 1 : 0;
        }
        
        let ocurrencias = 0;
        let fecha = new Date(fechaInicio);
        let intentos = 0;
        const maxIntentos = 100;
        
        while (fecha < inicioSemana && intentos < maxIntentos) {
            switch(tarea.recurrencia) {
                case 'daily': fecha.setDate(fecha.getDate() + 1); break;
                case 'weekly': fecha.setDate(fecha.getDate() + 7); break;
                case 'biweekly': fecha.setDate(fecha.getDate() + 3); break;
                case 'monthly': fecha.setMonth(fecha.getMonth() + 1); break;
            }
            intentos++;
        }
        
        intentos = 0;
        while (fecha <= finSemana && intentos < maxIntentos) {
            if (fecha >= inicioSemana) ocurrencias++;
            switch(tarea.recurrencia) {
                case 'daily': fecha.setDate(fecha.getDate() + 1); break;
                case 'weekly': fecha.setDate(fecha.getDate() + 7); break;
                case 'biweekly': fecha.setDate(fecha.getDate() + 3); break;
                case 'monthly': fecha.setMonth(fecha.getMonth() + 1); break;
            }
            intentos++;
        }
        return ocurrencias;
    } catch (error) {
        console.error('Error:', error);
        return 0;
    }
}

// ============================================
// ACTUALIZAR DASHBOARD
// ============================================
function actualizarDashboard() {
    totalActive.textContent = tareasCache.length;
    tareasCount.textContent = tareasCache.length;
    historialCount.textContent = historialCache.length;
    
    const inicioSemana = getInicioSemana();
    const tareasSemanaUnicas = new Set();
    historialCache.forEach(h => {
        if (h.fecha) {
            try {
                if (h.fecha.toDate() >= inicioSemana) tareasSemanaUnicas.add(h.titulo);
            } catch(e) {}
        }
    });
    semanaCount.textContent = tareasSemanaUnicas.size;
    
    if (currentUser) {
        let totalOcurrenciasSemana = 0;
        tareasCache.forEach(t => totalOcurrenciasSemana += calcularOcurrenciasSemanales(t));
        
        let realizadasSemana = 0;
        historialCache.forEach(h => {
            if (h.completadaPor === currentUser.email && h.fecha) {
                try {
                    if (h.fecha.toDate() >= inicioSemana) realizadasSemana++;
                } catch(e) {}
            }
        });
        
        weeklyStatsText.textContent = `Llevas realizadas ${realizadasSemana} actividades de las ${totalOcurrenciasSemana} programadas esta semana`;
        const porcentaje = totalOcurrenciasSemana > 0 ? (realizadasSemana / totalOcurrenciasSemana) * 100 : 0;
        weeklyProgress.style.width = `${porcentaje}%`;
    }
}

// ============================================
// ACTUALIZAR VISTA
// ============================================
function actualizarVista() {
    if (currentFilter === 'tareas') mostrarVistaTareas();
    else if (currentFilter === 'semana') mostrarVistaSemana();
    else if (currentFilter === 'historial') mostrarHistorial();
}

// ============================================
// VISTA TAREAS PRINCIPAL (UNA SOLA LISTA)
// ============================================
async function mostrarVistaTareas() {
    contentArea.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando tareas...</p></div>';
    
    // Obtener última realización de cada tarea
    const tareasConUltima = await Promise.all(tareasCache.map(async tarea => {
        const ultima = await obtenerUltimaRealizacion(tarea.id);
        return { ...tarea, ultimaRealizacion: ultima };
    }));
    
    // Clasificar: pendientes (normales) vs realizadas recientemente (tachadas al final)
    const pendientes = [];
    const realizadasRecientes = [];
    const ahora = new Date();
    
    for (const tarea of tareasConUltima) {
        let esReciente = false;
        if (tarea.ultimaRealizacion) {
            const diasDiferencia = Math.floor((ahora - tarea.ultimaRealizacion.fecha) / (1000 * 60 * 60 * 24));
            const espaciadoMinimo = getEspaciadoMinimo(tarea.recurrencia);
            if (espaciadoMinimo > 0 && diasDiferencia < espaciadoMinimo) {
                esReciente = true;
            }
        }
        
        if (esReciente) {
            realizadasRecientes.push(tarea);
        } else {
            pendientes.push(tarea);
        }
    }
    
    // Ordenar pendientes por prioridad
    const ordenPrioridad = { 'alta': 1, 'media': 2, 'baja': 3 };
    pendientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    realizadasRecientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    
    // Contador de pendientes para el dashboard
    pendingToday.textContent = pendientes.length;
    
    // Renderizar UNA SOLA LISTA (pendientes arriba, realizadas recientes abajo tachadas)
    let html = `
        <div class="tasks-container">
            <h2>
                <span class="material-icons">list</span>
                Mis Tareas
                <span class="count-badge">${tareasCache.length}</span>
            </h2>
            <div id="tasksList" class="tasks-list">
    `;
    
    // Tareas pendientes (normales, clickeables)
    if (pendientes.length > 0) {
        html += pendientes.map(tarea => renderizarTarea(tarea, false)).join('');
    }
    
    // Tareas realizadas recientemente (tachadas, sin click, con info)
    if (realizadasRecientes.length > 0) {
        html += `<div class="recientes-divider"><span class="material-icons">history</span> Realizadas recientemente</div>`;
        html += realizadasRecientes.map(tarea => renderizarTarea(tarea, true)).join('');
    }
    
    if (pendientes.length === 0 && realizadasRecientes.length === 0) {
        html += `<div class="empty-state"><span class="material-icons empty-icon">assignment</span><p class="empty-text">No hay tareas</p></div>`;
    }
    
    html += `</div></div>`;
    contentArea.innerHTML = html;
    
    // Agregar event listeners a las tarjetas pendientes
    document.querySelectorAll('.task-item:not(.completed)').forEach(card => {
        card.addEventListener('click', (e) => {
            // Evitar que el click se propague si se hace clic en un botón interno (no hay)
            const tareaId = card.dataset.id;
            const tarea = tareasCache.find(t => t.id === tareaId);
            if (tarea) {
                mostrarConfirmacionRealizar(tarea);
            }
        });
    });
}

function renderizarTarea(tarea, completadaRecientemente = false) {
    let infoUltima = '';
    if (completadaRecientemente && tarea.ultimaRealizacion) {
        const fechaUltima = tarea.ultimaRealizacion.fecha.toLocaleDateString();
        const quien = tarea.ultimaRealizacion.quien;
        infoUltima = `<div class="last-done-info">
            <span class="material-icons">history</span> 
            Última vez: ${fechaUltima} por ${quien}
        </div>`;
    }
    
    return `
        <div class="task-item priority-${tarea.prioridad || 'media'} ${completadaRecientemente ? 'completed' : ''}" data-id="${tarea.id}">
            <div class="task-content">
                <h3>
                    ${escapeHtml(tarea.titulo)}
                    ${tarea.recurrencia && tarea.recurrencia !== 'none' ? 
                        `<span class="recurrence-badge">${getRecurrenciaText(tarea.recurrencia)}</span>` : ''}
                </h3>
                ${tarea.descripcion ? `<p>${escapeHtml(tarea.descripcion)}</p>` : ''}
                <div class="task-meta">
                    <span><span class="material-icons">event</span> ${tarea.fechaInicio || 'Sin fecha'}</span>
                    <span><span class="material-icons">flag</span> ${tarea.prioridad}</span>
                </div>
                ${infoUltima}
            </div>
        </div>
    `;
}

// ============================================
// CONFIRMACIÓN ANTES DE MARCAR TAREA
// ============================================
function mostrarConfirmacionRealizar(tarea) {
    const confirmar = confirm(`¿Deseas marcar la tarea "${tarea.titulo}" como realizada?`);
    if (confirmar) {
        completarTarea(tarea.id, tarea.titulo);
    }
}

// ============================================
// COMPLETAR TAREA CON VALIDACIÓN DE ESPACIADO
// ============================================
async function completarTarea(tareaId, titulo) {
    if (!currentUser) {
        alert('Debes iniciar sesión para marcar tareas.');
        return;
    }
    
    try {
        const tareaDoc = await db.collection('tareas').doc(tareaId).get();
        if (!tareaDoc.exists) {
            alert('La tarea ya no existe.');
            return;
        }
        const tarea = tareaDoc.data();
        
        // Verificar última realización
        const ultimaSnapshot = await db.collection('historial')
            .where('tareaId', '==', tareaId)
            .orderBy('fecha', 'desc')
            .limit(1)
            .get();
        
        const espaciadoMinimo = getEspaciadoMinimo(tarea.recurrencia);
        
        if (!ultimaSnapshot.empty && espaciadoMinimo > 0) {
            const ultima = ultimaSnapshot.docs[0].data();
            const ultimaFecha = ultima.fecha.toDate();
            const diasDiferencia = Math.floor((new Date() - ultimaFecha) / (1000 * 60 * 60 * 24));
            
            if (diasDiferencia < espaciadoMinimo) {
                alert(`⚠️ Esta tarea ya fue realizada recientemente.\n\nÚltima vez: ${ultimaFecha.toLocaleDateString()} por ${ultima.completadaPor}\nDebes esperar ${espaciadoMinimo} días entre realizaciones.`);
                return;
            }
        }
        
        // Registrar en historial
        await db.collection('historial').add({
            tareaId: tareaId,
            titulo: titulo,
            completadaPor: currentUser.email,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert(`✅ Tarea "${titulo}" registrada como realizada.`);
        actualizarDashboard();
        actualizarVista();
        
    } catch (error) {
        console.error('Error al completar tarea:', error);
        alert('Error al registrar la tarea. Intenta de nuevo.');
    }
}

// ============================================
// VISTA SEMANA
// ============================================
async function mostrarVistaSemana() {
    const inicioSemana = getInicioSemana();
    const diasSemana = [];
    for (let i = 0; i < 7; i++) {
        const fecha = new Date(inicioSemana);
        fecha.setDate(inicioSemana.getDate() + i);
        diasSemana.push(fecha);
    }
    
    const realizacionesPorDia = {};
    historialCache.forEach(h => {
        if (h.fecha) {
            try {
                const fecha = h.fecha.toDate();
                const fechaStr = fecha.toISOString().slice(0,10);
                if (!realizacionesPorDia[fechaStr]) realizacionesPorDia[fechaStr] = [];
                realizacionesPorDia[fechaStr].push(h);
            } catch(e) {}
        }
    });
    
    let html = `
        <div class="tasks-container">
            <h2><span class="material-icons">calendar_view_week</span> Realizadas esta semana <span class="count-badge">${semanaCount.textContent}</span></h2>
            <div style="display:flex; flex-direction:column; gap:16px;">
    `;
    
    for (const fecha of diasSemana) {
        const fechaStr = fecha.toISOString().slice(0,10);
        const realizaciones = realizacionesPorDia[fechaStr] || [];
        const nombreDia = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
        
        html += `
            <div class="day-card">
                <h3>${nombreDia}</h3>
                ${realizaciones.length > 0 ? 
                    realizaciones.map(r => `
                        <div class="day-task">
                            <span>📋 ${escapeHtml(r.titulo)}</span>
                            <span class="day-task-user">👤 ${r.completadaPor}</span>
                        </div>
                    `).join('') : 
                    '<p class="day-empty">Sin tareas realizadas</p>'
                }
            </div>
        `;
    }
    
    html += `</div></div>`;
    contentArea.innerHTML = html;
}

// ============================================
// VISTA HISTORIAL
// ============================================
function mostrarHistorial() {
    let html = `
        <div class="history-container">
            <h2><span class="material-icons">history</span> Historial completo <span class="count-badge">${historialCache.length}</span></h2>
            <div style="overflow-x:auto;">
                <table class="history-table">
                    <thead>
                        <tr><th>Fecha</th><th>Tarea</th><th>Realizada por</th></tr>
                    </thead>
                    <tbody>
    `;
    
    historialCache.slice(0, 200).forEach(h => {
        let fechaStr = '';
        if (h.fecha) {
            try { fechaStr = h.fecha.toDate().toLocaleString(); } catch(e) {}
        }
        html += `<tr><td>${fechaStr}</td><td>${escapeHtml(h.titulo)}</td><td>${escapeHtml(h.completadaPor)}</td></tr>`;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            ${historialCache.length === 0 ? '<p class="empty-state">No hay registros en el historial</p>' : ''}
        </div>
    `;
    contentArea.innerHTML = html;
}

// ============================================
// FILTROS
// ============================================
filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        actualizarVista();
    });
});