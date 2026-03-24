// ============================================
// CONFIGURACIÓN INICIAL
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
const adminEmail = 'admin@casaverde.com';

// ============================================
// ELEMENTOS DEL DOM
// ============================================
const loginContainer = document.getElementById('loginContainer');
const privateArea = document.getElementById('privateArea');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const taskForm = document.getElementById('taskForm');
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
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const tareasCount = document.getElementById('tareasCount');
const semanaCount = document.getElementById('semanaCount');
const historialCount = document.getElementById('historialCount');
const adminTaskForm = document.getElementById('adminTaskForm');
const adminPanel = document.getElementById('adminPanel');
const viewOnlyMessage = document.getElementById('viewOnlyMessage');

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
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
// AUTENTICACIÓN
// ============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        userEmail.textContent = user.email;
        
        if (user.email === adminEmail) {
            adminTaskForm.style.display = 'block';
            adminPanel.style.display = 'block';
            viewOnlyMessage.style.display = 'none';
        } else {
            adminTaskForm.style.display = 'none';
            adminPanel.style.display = 'none';
            viewOnlyMessage.style.display = 'flex';
        }
        
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
                await auth.createUserWithEmailAndPassword(email, password);
                loginError.style.display = 'none';
            } catch (createError) {
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
    
    unsubscribeTasks = db.collection('tareas')
        .where('activa', '==', true)
        .onSnapshot((snapshot) => {
            tareasCache = [];
            snapshot.forEach(doc => {
                tareasCache.push({ id: doc.id, ...doc.data() });
            });
            actualizarDashboard();
            actualizarVista();
        }, (error) => {
            console.error('Error en listener de tareas:', error);
        });

    if (unsubscribeHistorial) unsubscribeHistorial();
    
    unsubscribeHistorial = db.collection('historial')
        .orderBy('fecha', 'desc')
        .limit(1000)
        .onSnapshot((snapshot) => {
            historialCache = [];
            snapshot.forEach(doc => {
                historialCache.push({ id: doc.id, ...doc.data() });
            });
            actualizarDashboard();
            actualizarVista();
        }, (error) => {
            console.error('Error en listener de historial:', error);
        });
}

// ============================================
// CARGAR DATOS INICIALES
// ============================================
async function cargarDatosIniciales() {
    try {
        const tareasSnapshot = await db.collection('tareas')
            .where('activa', '==', true)
            .get();
        
        tareasCache = [];
        tareasSnapshot.forEach(doc => {
            tareasCache.push({ id: doc.id, ...doc.data() });
        });
        
        const historialSnapshot = await db.collection('historial')
            .orderBy('fecha', 'desc')
            .limit(1000)
            .get();
        
        historialCache = [];
        historialSnapshot.forEach(doc => {
            historialCache.push({ id: doc.id, ...doc.data() });
        });
        
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
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        if (tarea.recurrencia === 'none') {
            const inicioSemana = getInicioSemana();
            const finSemana = new Date(inicioSemana);
            finSemana.setDate(inicioSemana.getDate() + 6);
            finSemana.setHours(23, 59, 59, 999);
            return (fechaInicio >= inicioSemana && fechaInicio <= finSemana) ? 1 : 0;
        }
        
        let ocurrencias = 0;
        const inicioSemana = getInicioSemana();
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(inicioSemana.getDate() + 6);
        finSemana.setHours(23, 59, 59, 999);
        
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
        console.error('Error calculando ocurrencias:', error);
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
    
    // Calcular tareas únicas realizadas esta semana
    const tareasSemanaUnicas = new Set();
    const inicioSemana = getInicioSemana();
    historialCache.forEach(h => {
        if (h.fecha) {
            try {
                const fechaHistorial = h.fecha.toDate();
                if (fechaHistorial >= inicioSemana) {
                    tareasSemanaUnicas.add(h.titulo);
                }
            } catch (e) {}
        }
    });
    semanaCount.textContent = tareasSemanaUnicas.size;
    
    // Estadísticas semanales para el usuario actual
    if (currentUser) {
        let totalOcurrenciasSemana = 0;
        tareasCache.forEach(tarea => {
            totalOcurrenciasSemana += calcularOcurrenciasSemanales(tarea);
        });
        
        let realizadasSemana = 0;
        historialCache.forEach(h => {
            if (h.completadaPor === currentUser.email && h.fecha) {
                try {
                    const fechaHistorial = h.fecha.toDate();
                    if (fechaHistorial >= inicioSemana) {
                        realizadasSemana++;
                    }
                } catch (e) {}
            }
        });
        
        weeklyStatsText.textContent = `Llevas realizadas ${realizadasSemana} actividades de las ${totalOcurrenciasSemana} programadas para esta semana`;
        const porcentaje = totalOcurrenciasSemana > 0 ? (realizadasSemana / totalOcurrenciasSemana) * 100 : 0;
        weeklyProgress.style.width = `${porcentaje}%`;
    }
}

// ============================================
// ACTUALIZAR VISTA SEGÚN FILTRO
// ============================================
function actualizarVista() {
    switch(currentFilter) {
        case 'tareas':
            mostrarVistaTareas();
            break;
        case 'semana':
            mostrarVistaSemana();
            break;
        case 'historial':
            mostrarHistorial();
            break;
    }
}

// ============================================
// VISTA TAREAS (CON CLASIFICACIÓN POR ESPACIADO)
// ============================================
async function mostrarVistaTareas() {
    contentArea.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando tareas...</p></div>';
    
    const tareasConUltima = await Promise.all(tareasCache.map(async tarea => {
        const ultima = await obtenerUltimaRealizacion(tarea.id);
        return { ...tarea, ultimaRealizacion: ultima };
    }));
    
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
    
    const ordenPrioridad = { 'alta': 1, 'media': 2, 'baja': 3 };
    pendientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    realizadasRecientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    
    contentArea.innerHTML = `
        <div class="tasks-container">
            <h2>
                <span class="material-icons">list</span>
                Tareas
                <span class="count-badge">${tareasCache.length}</span>
            </h2>
            
            ${pendientes.length > 0 ? `
                <div class="task-section">
                    <h3 class="section-title pending-title">
                        <span class="material-icons">pending</span> Pendientes (${pendientes.length})
                    </h3>
                    ${renderizarTareas(pendientes, false, false)}
                </div>
            ` : ''}
            
            ${realizadasRecientes.length > 0 ? `
                <div class="task-section">
                    <h3 class="section-title completed-title">
                        <span class="material-icons">check_circle</span> Realizadas recientemente (${realizadasRecientes.length})
                    </h3>
                    ${renderizarTareas(realizadasRecientes, true, true)}
                </div>
            ` : ''}
            
            ${pendientes.length === 0 && realizadasRecientes.length === 0 ? `
                <div class="empty-state">
                    <span class="material-icons empty-icon">assignment</span>
                    <p class="empty-text">No hay tareas</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderizarTareas(tareas, completadas = false, mostrarUltima = false) {
    const esAdmin = currentUser?.email === adminEmail;
    
    return tareas.map(tarea => {
        let infoUltima = '';
        if (mostrarUltima && tarea.ultimaRealizacion) {
            const fechaUltima = tarea.ultimaRealizacion.fecha.toLocaleDateString();
            const quien = tarea.ultimaRealizacion.quien;
            infoUltima = `<div class="last-done-info">
                <span class="material-icons">history</span> 
                Última vez: ${fechaUltima} por ${quien}
            </div>`;
        }
        
        return `
            <div class="task-item priority-${tarea.prioridad || 'media'} ${completadas ? 'completed' : ''}">
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
                <div class="task-actions">
                    ${esAdmin ? `
                        <button onclick="abrirModalEdicion('${tarea.id}')" class="edit-btn">
                            <span class="material-icons">edit</span> Editar
                        </button>
                    ` : ''}
                    ${!completadas ? `
                        <button onclick="completarTarea('${tarea.id}', '${escapeHtml(tarea.titulo)}')" class="complete-btn">
                            <span class="material-icons">check_circle</span> Realizar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// COMPLETAR TAREA (CON VALIDACIÓN DE ESPACIADO)
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
        
        const ultimaSnapshot = await db.collection('historial')
            .where('tareaId', '==', tareaId)
            .orderBy('fecha', 'desc')
            .limit(1)
            .get();
        
        const espaciadoMinimo = getEspaciadoMinimo(tarea.recurrencia);
        
        if (!ultimaSnapshot.empty && espaciadoMinimo > 0) {
            const ultima = ultimaSnapshot.docs[0].data();
            const ultimaFecha = ultima.fecha.toDate();
            const ahora = new Date();
            const diasDiferencia = Math.floor((ahora - ultimaFecha) / (1000 * 60 * 60 * 24));
            
            if (diasDiferencia < espaciadoMinimo) {
                const fechaUltima = ultimaFecha.toLocaleDateString();
                const quien = ultima.completadaPor;
                alert(`⚠️ No puedes realizar esta tarea todavía.\n\nÚltima vez: ${fechaUltima} por ${quien}\nEspaciado mínimo requerido: ${espaciadoMinimo} días.\nHan pasado: ${diasDiferencia} días.`);
                return;
            }
        }
        
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
    
    // Agrupar realizaciones por día
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
            <h2>
                <span class="material-icons">calendar_view_week</span>
                Realizadas esta semana
                <span class="count-badge">${semanaCount.textContent}</span>
            </h2>
            <div style="display: flex; flex-direction: column; gap: 16px;">
    `;
    
    for (const fecha of diasSemana) {
        const fechaStr = fecha.toISOString().slice(0,10);
        const realizaciones = realizacionesPorDia[fechaStr] || [];
        const nombreDia = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
        
        html += `
            <div style="border: 1px solid #e0e0e0; border-radius: 12px; padding: 12px;">
                <h3 style="margin-bottom: 10px; color: #2c3e50;">${nombreDia}</h3>
                ${realizaciones.length > 0 ? 
                    realizaciones.map(r => `
                        <div style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                            <span>📋 ${escapeHtml(r.titulo)}</span>
                            <span style="color: #667eea;">👤 ${r.completadaPor}</span>
                        </div>
                    `).join('') : 
                    '<p style="color:#999; padding: 8px 0;">Sin tareas realizadas</p>'
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
            <h2>
                <span class="material-icons">history</span>
                Historial completo
                <span class="count-badge">${historialCache.length}</span>
            </h2>
            <div style="overflow-x: auto;">
                <table class="history-table">
                    <thead>
                        <tr><th>Fecha</th><th>Tarea</th><th>Realizada por</th></tr>
                    </thead>
                    <tbody>
    `;
    
    historialCache.slice(0, 200).forEach(h => {
        let fechaStr = '';
        if (h.fecha) {
            try {
                fechaStr = h.fecha.toDate().toLocaleString();
            } catch(e) { fechaStr = 'Fecha desconocida'; }
        }
        html += `
            <tr>
                <td class="fecha-col">${fechaStr}</td>
                <td class="tarea-col">${escapeHtml(h.titulo)}</td>
                <td class="usuario-col">${escapeHtml(h.completadaPor || '?')}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            ${historialCache.length === 0 ? '<p style="text-align:center; padding:20px;">No hay registros en el historial</p>' : ''}
        </div>
    `;
    contentArea.innerHTML = html;
}

// ============================================
// EDICIÓN DE TAREAS (ADMIN)
// ============================================
let tareaEnEdicion = null;

window.abrirModalEdicion = function(tareaId) {
    const tarea = tareasCache.find(t => t.id === tareaId);
    if (!tarea) return;
    
    tareaEnEdicion = tarea;
    document.getElementById('editTaskId').value = tarea.id;
    document.getElementById('editTitle').value = tarea.titulo || '';
    document.getElementById('editDescription').value = tarea.descripcion || '';
    document.getElementById('editPriority').value = tarea.prioridad || 'media';
    document.getElementById('editRecurrence').value = tarea.recurrencia || 'none';
    document.getElementById('editStartDate').value = tarea.fechaInicio || '';
    
    editModal.style.display = 'flex';
};

window.cerrarModal = function() {
    editModal.style.display = 'none';
    tareaEnEdicion = null;
};

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tareaEnEdicion || currentUser?.email !== adminEmail) return;
    
    const updates = {
        titulo: document.getElementById('editTitle').value,
        descripcion: document.getElementById('editDescription').value,
        prioridad: document.getElementById('editPriority').value,
        recurrencia: document.getElementById('editRecurrence').value,
        fechaInicio: document.getElementById('editStartDate').value
    };
    
    try {
        await db.collection('tareas').doc(tareaEnEdicion.id).update(updates);
        cerrarModal();
        alert('Tarea actualizada correctamente.');
    } catch (error) {
        console.error('Error al actualizar tarea:', error);
        alert('Error al guardar cambios.');
    }
});

// ============================================
// CREAR TAREA (ADMIN)
// ============================================
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentUser?.email !== adminEmail) {
        alert('No tienes permisos para crear tareas.');
        return;
    }
    
    const nuevaTarea = {
        titulo: document.getElementById('taskTitle').value,
        descripcion: document.getElementById('taskDescription').value,
        prioridad: document.getElementById('taskPriority').value,
        recurrencia: document.getElementById('taskRecurrence').value,
        fechaInicio: document.getElementById('taskStartDate').value,
        activa: true,
        creadaEn: firebase.firestore.FieldValue.serverTimestamp(),
        creadaPor: currentUser.email
    };
    
    if (!nuevaTarea.titulo) {
        alert('El título es obligatorio');
        return;
    }
    
    try {
        await db.collection('tareas').add(nuevaTarea);
        taskForm.reset();
        alert('Tarea creada correctamente.');
    } catch (error) {
        console.error('Error al crear tarea:', error);
        alert('Error al crear la tarea.');
    }
});

// ============================================
// LIMPIAR BASE DE DATOS (ADMIN)
// ============================================
window.mostrarModalLimpiarDB = function() {
    const modal = document.getElementById('limpiarModal');
    if (modal) modal.style.display = 'flex';
};

window.cerrarModalLimpiar = function() {
    const modal = document.getElementById('limpiarModal');
    if (modal) modal.style.display = 'none';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('limpiarError').style.display = 'none';
};

window.ejecutarLimpiarDB = async function() {
    const password = document.getElementById('confirmPassword').value;
    
    if (!password) {
        document.getElementById('limpiarError').textContent = 'Ingresa tu contraseña para confirmar.';
        document.getElementById('limpiarError').style.display = 'block';
        return;
    }
    
    try {
        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
        await currentUser.reauthenticateWithCredential(credential);
        
        if (!confirm('⚠️ Esta acción eliminará TODAS las tareas y TODO el historial. ¿Estás ABSOLUTAMENTE seguro?')) {
            cerrarModalLimpiar();
            return;
        }
        
        // Eliminar todas las tareas
        const tareasSnapshot = await db.collection('tareas').get();
        const batchTareas = db.batch();
        tareasSnapshot.forEach(doc => batchTareas.delete(doc.ref));
        await batchTareas.commit();
        
        // Eliminar todo el historial
        const historialSnapshot = await db.collection('historial').get();
        const batchHistorial = db.batch();
        historialSnapshot.forEach(doc => batchHistorial.delete(doc.ref));
        await batchHistorial.commit();
        
        alert('✅ Base de datos limpiada correctamente.');
        cerrarModalLimpiar();
        
    } catch (error) {
        console.error('Error al limpiar:', error);
        document.getElementById('limpiarError').textContent = 'Error: ' + (error.message || 'Contraseña incorrecta');
        document.getElementById('limpiarError').style.display = 'block';
    }
};

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

// ============================================
// CIERRE DE MODALES AL HACER CLICK FUERA
// ============================================
window.onclick = function(event) {
    if (event.target === editModal) cerrarModal();
    const limpiarModal = document.getElementById('limpiarModal');
    if (event.target === limpiarModal) cerrarModalLimpiar();
};