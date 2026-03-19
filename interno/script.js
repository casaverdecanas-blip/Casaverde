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

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configurar persistencia
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ============================================
// VARIABLES GLOBALES
// ============================================
let currentUser = null;
let currentFilter = 'tareas';
let unsubscribeTasks = null;
let tareasCache = [];
let historialCache = [];

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

// ============================================
// AUTENTICACIÓN
// ============================================
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        userEmail.textContent = user.email;
        showPrivateArea();
        cargarDatosIniciales();
    } else {
        currentUser = null;
        showLoginArea();
        if (unsubscribeTasks) unsubscribeTasks();
    }
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (password.length < 6) {
        loginError.textContent = 'La contraseña debe tener al menos 6 caracteres';
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        loginError.textContent = '';
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            try {
                await auth.createUserWithEmailAndPassword(email, password);
                loginError.textContent = '';
            } catch (createError) {
                loginError.textContent = 'Error al crear usuario';
            }
        } else {
            loginError.textContent = 'Email o contraseña incorrectos';
        }
    }
});

// Logout
logoutBtn.addEventListener('click', () => auth.signOut());

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
// CARGAR DATOS INICIALES
// ============================================
async function cargarDatosIniciales() {
    try {
        // Cargar tareas
        const tareasSnapshot = await db.collection('tareas')
            .where('activa', '==', true)
            .get();
        
        tareasCache = [];
        tareasSnapshot.forEach(doc => {
            tareasCache.push({ id: doc.id, ...doc.data() });
        });
        
        // Cargar historial
        const historialSnapshot = await db.collection('historial')
            .orderBy('fecha', 'desc')
            .limit(500)
            .get();
        
        historialCache = [];
        historialSnapshot.forEach(doc => {
            historialCache.push({ id: doc.id, ...doc.data() });
        });
        
        actualizarDashboard();
        actualizarVista();
        
        // Configurar listener en tiempo real
        configurarListener();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

function configurarListener() {
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
            console.error('Error en listener:', error);
        });
}

// ============================================
// ACTUALIZAR DASHBOARD
// ============================================
function actualizarDashboard() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Tareas para hoy
    const tareasHoy = tareasCache.filter(t => {
        if (!t.fechaInicio) return false;
        const fechaTarea = new Date(t.fechaInicio + 'T00:00:00');
        return fechaTarea.toDateString() === hoy.toDateString();
    });
    
    pendingToday.textContent = tareasHoy.length;
    totalActive.textContent = tareasCache.length;
    
    // Tareas completadas hoy
    const completadasHoy = historialCache.filter(h => {
        if (!h.fecha) return false;
        const fechaHistorial = h.fecha.toDate();
        return fechaHistorial.toDateString() === hoy.toDateString();
    });
    
    completedToday.textContent = completadasHoy.length;
    
    // Contadores de filtros
    tareasCount.textContent = tareasCache.length;
    
    const tareasSemana = new Set();
    const inicioSemana = getInicioSemana();
    historialCache.forEach(h => {
        if (h.fecha) {
            const fechaHistorial = h.fecha.toDate();
            if (fechaHistorial >= inicioSemana) {
                tareasSemana.add(h.titulo);
            }
        }
    });
    semanaCount.textContent = tareasSemana.size;
    historialCount.textContent = historialCache.length;
    
    // Estadísticas semanales del usuario
    if (currentUser) {
        const misCompletadas = historialCache.filter(h => 
            h.completadaPor === currentUser.email && h.fecha
        ).length;
        
        weeklyStatsText.textContent = `Llevas realizadas ${misCompletadas} tareas de las ${tareasCache.length} propuestas`;
        
        const porcentaje = tareasCache.length > 0 ? (misCompletadas / tareasCache.length) * 100 : 0;
        weeklyProgress.style.width = `${porcentaje}%`;
    }
}

// ============================================
// FUNCIONES DE FECHA
// ============================================
function getInicioSemana() {
    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    const dia = fecha.getDay();
    const diff = dia === 0 ? 6 : dia - 1;
    fecha.setDate(fecha.getDate() - diff);
    return fecha;
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
// VISTA TAREAS
// ============================================
function mostrarVistaTareas() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Determinar qué tareas están realizadas hoy
    const realizadasHoy = new Set();
    historialCache.forEach(h => {
        if (h.fecha) {
            const fechaHistorial = h.fecha.toDate();
            if (fechaHistorial.toDateString() === hoy.toDateString()) {
                realizadasHoy.add(h.tareaId);
            }
        }
    });
    
    const pendientes = [];
    const realizadas = [];
    
    tareasCache.forEach(tarea => {
        if (realizadasHoy.has(tarea.id)) {
            realizadas.push(tarea);
        } else {
            pendientes.push(tarea);
        }
    });
    
    // Ordenar pendientes por prioridad
    const ordenPrioridad = { 'alta': 1, 'media': 2, 'baja': 3 };
    pendientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    
    contentArea.innerHTML = `
        <div class="tasks-container">
            <h2>
                <span class="material-icons">list</span>
                Tareas
                <span class="count-badge">${tareasCache.length}</span>
            </h2>
            
            ${pendientes.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #27ae60; margin-bottom: 10px;">
                        <span class="material-icons">pending</span> Pendientes (${pendientes.length})
                    </h3>
                    ${renderizarTareas(pendientes)}
                </div>
            ` : ''}
            
            ${realizadas.length > 0 ? `
                <div>
                    <h3 style="color: #7f8c8d; margin-bottom: 10px;">
                        <span class="material-icons">check_circle</span> Realizadas hoy (${realizadas.length})
                    </h3>
                    ${renderizarTareas(realizadas, true)}
                </div>
            ` : ''}
            
            ${pendientes.length === 0 && realizadas.length === 0 ? `
                <div style="text-align: center; padding: 40px;">
                    <span class="material-icons" style="font-size: 48px; color: #ccc;">assignment</span>
                    <p style="color: #999; margin-top: 10px;">No hay tareas</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderizarTareas(tareas, completadas = false) {
    return tareas.map(tarea => `
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
            </div>
            <div class="task-actions">
                ${!completadas ? `
                    <button onclick="completarTarea('${tarea.id}', '${escapeHtml(tarea.titulo)}')" class="complete-btn">
                        <span class="material-icons">check_circle</span> Realizar
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ============================================
// VISTA SEMANA
// ============================================
function mostrarVistaSemana() {
    const inicioSemana = getInicioSemana();
    const tareasMap = new Map();
    
    historialCache.forEach(h => {
        if (h.fecha) {
            const fechaHistorial = h.fecha.toDate();
            if (fechaHistorial >= inicioSemana) {
                if (!tareasMap.has(h.titulo)) {
                    tareasMap.set(h.titulo, {
                        titulo: h.titulo,
                        veces: 0,
                        usuarios: new Set()
                    });
                }
                const tarea = tareasMap.get(h.titulo);
                tarea.veces++;
                tarea.usuarios.add(h.completadaPor);
            }
        }
    });
    
    const tareasArray = Array.from(tareasMap.values());
    
    contentArea.innerHTML = `
        <div class="history-container">
            <h2>
                <span class="material-icons">event_note</span>
                Realizadas esta semana
                <span class="count-badge">${tareasArray.length}</span>
            </h2>
            
            ${tareasArray.length === 0 ? `
                <div style="text-align: center; padding: 40px;">
                    <span class="material-icons" style="font-size: 48px; color: #ccc;">event_busy</span>
                    <p style="color: #999; margin-top: 10px;">No hay tareas realizadas esta semana</p>
                </div>
            ` : tareasArray.map(t => `
                <div class="stat-item">
                    <div class="task-name">
                        <span class="material-icons">task</span>
                        ${escapeHtml(t.titulo)}
                    </div>
                    <div>
                        <span class="task-count">${t.veces} ${t.veces === 1 ? 'vez' : 'veces'}</span>
                        <span style="margin-left: 10px; color: #666; font-size: 12px;">
                            por ${Array.from(t.usuarios).join(', ')}
                        </span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// VISTA HISTORIAL
// ============================================
function mostrarHistorial() {
    const registros = historialCache.map(h => {
        if (h.fecha) {
            const fecha = h.fecha.toDate();
            return {
                fecha: fecha.toLocaleDateString(),
                hora: fecha.toLocaleTimeString(),
                titulo: h.titulo,
                usuario: h.completadaPor
            };
        }
        return null;
    }).filter(r => r !== null);

    contentArea.innerHTML = `
        <div class="history-container">
            <h2>
                <span class="material-icons">history</span>
                Historial de Tareas Realizadas
                <span class="count-badge">${registros.length}</span>
            </h2>
            
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Tarea</th>
                        <th>Realizada por</th>
                    </tr>
                </thead>
                <tbody>
                    ${registros.length === 0 ? 
                        '<tr><td colspan="4" style="text-align: center; color: #999;">No hay historial</td></tr>' :
                        registros.map(r => `
                            <tr>
                                <td>${r.fecha}</td>
                                <td>${r.hora}</td>
                                <td>${escapeHtml(r.titulo)}</td>
                                <td>${escapeHtml(r.usuario)}</td>
                            </tr>
                        `).join('')
                    }
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// CREAR TAREA
// ============================================
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        alert('❌ Debes iniciar sesión');
        return;
    }
    
    const titulo = document.getElementById('taskTitle').value;
    const descripcion = document.getElementById('taskDescription').value;
    const prioridad = document.getElementById('taskPriority').value;
    const recurrencia = document.getElementById('taskRecurrence').value;
    const fechaInicio = document.getElementById('taskStartDate').value;
    
    if (!titulo || !fechaInicio) {
        alert('❌ Título y fecha son obligatorios');
        return;
    }
    
    try {
        await db.collection('tareas').add({
            titulo: titulo,
            descripcion: descripcion || '',
            prioridad: prioridad,
            recurrencia: recurrencia,
            fechaInicio: fechaInicio,
            activa: true,
            creadaPor: currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('✅ Tarea creada correctamente');
        taskForm.reset();
        
        // Restablecer fecha al día actual
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('taskStartDate').value = hoy;
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al crear la tarea: ' + error.message);
    }
});

// ============================================
// COMPLETAR TAREA
// ============================================
window.completarTarea = async (tareaId, titulo) => {
    if (!currentUser) {
        alert('❌ Debes iniciar sesión');
        return;
    }
    
    // Verificar si ya fue realizada hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const yaRealizada = historialCache.some(h => {
        if (h.tareaId === tareaId && h.fecha) {
            const fechaHistorial = h.fecha.toDate();
            return fechaHistorial.toDateString() === hoy.toDateString();
        }
        return false;
    });
    
    if (yaRealizada) {
        const registro = historialCache.find(h => h.tareaId === tareaId);
        const hora = registro?.fecha?.toDate().toLocaleTimeString() || 'hora desconocida';
        
        alert(`⛔ Tarea ya realizada hoy por ${registro?.completadaPor} a las ${hora}`);
        return;
    }
    
    if (!confirm(`¿Marcar "${titulo}" como realizada?`)) return;
    
    try {
        // Guardar en historial
        await db.collection('historial').add({
            tareaId: tareaId,
            titulo: titulo,
            completadaPor: currentUser.email,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Actualizar tarea si es recurrente
        const tareaRef = db.collection('tareas').doc(tareaId);
        const tareaDoc = await tareaRef.get();
        const tareaData = tareaDoc.data();
        
        if (tareaData.recurrencia && tareaData.recurrencia !== 'none') {
            const fechaActual = new Date(tareaData.fechaInicio + 'T00:00:00');
            let nuevaFecha = new Date(fechaActual);
            
            switch(tareaData.recurrencia) {
                case 'daily':
                    nuevaFecha.setDate(nuevaFecha.getDate() + 1);
                    break;
                case 'weekly':
                    nuevaFecha.setDate(nuevaFecha.getDate() + 7);
                    break;
                case 'biweekly':
                    nuevaFecha.setDate(nuevaFecha.getDate() + 1);
                    while (nuevaFecha.getDay() !== 1 && nuevaFecha.getDay() !== 4) {
                        nuevaFecha.setDate(nuevaFecha.getDate() + 1);
                    }
                    break;
                case 'monthly':
                    nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
                    break;
            }
            
            await tareaRef.update({
                fechaInicio: nuevaFecha.toISOString().split('T')[0]
            });
        }
        
        alert('✅ Tarea completada');
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al completar la tarea');
    }
};

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getRecurrenciaText(recurrencia) {
    const textos = {
        daily: 'Diaria',
        weekly: 'Semanal',
        biweekly: '2 veces/semana',
        monthly: 'Mensual'
    };
    return textos[recurrencia] || recurrencia;
}

function showPrivateArea() {
    loginContainer.style.display = 'none';
    privateArea.style.display = 'block';
}

function showLoginArea() {
    loginContainer.style.display = 'flex';
    privateArea.style.display = 'none';
}

// Cerrar modal
window.cerrarModal = () => {
    editModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === editModal) {
        cerrarModal();
    }
};
