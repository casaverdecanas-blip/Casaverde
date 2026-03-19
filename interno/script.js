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
let unsubscribeHistorial = null;
let tareasCache = [];
let historialCache = [];
let realizadasHoySet = new Set();
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
        
        // Controlar visibilidad según si es admin
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
        cargarDatosIniciales();
        configurarListenersTiempoReal();
    } else {
        currentUser = null;
        showLoginArea();
        if (unsubscribeTasks) unsubscribeTasks();
        if (unsubscribeHistorial) unsubscribeHistorial();
    }
});

// Login
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
            actualizarSetRealizadasHoy();
            actualizarDashboard();
            actualizarVista();
        }, (error) => {
            console.error('Error en listener de historial:', error);
        });
}

// ============================================
// ACTUALIZAR SET DE REALIZADAS HOY
// ============================================
function actualizarSetRealizadasHoy() {
    realizadasHoySet.clear();
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    
    historialCache.forEach(h => {
        if (h.fecha) {
            try {
                const fechaHistorial = h.fecha.toDate();
                if (fechaHistorial >= inicioDia) {
                    realizadasHoySet.add(h.tareaId);
                }
            } catch (e) {}
        }
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
        
        actualizarSetRealizadasHoy();
        actualizarDashboard();
        actualizarVista();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// ============================================
// ACTUALIZAR DASHBOARD
// ============================================
function actualizarDashboard() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const tareasHoy = tareasCache.filter(t => {
        if (!t.fechaInicio) return false;
        try {
            const fechaTarea = new Date(t.fechaInicio + 'T00:00:00');
            return fechaTarea.toDateString() === hoy.toDateString();
        } catch (e) {
            return false;
        }
    });
    
    pendingToday.textContent = tareasHoy.length;
    totalActive.textContent = tareasCache.length;
    completedToday.textContent = realizadasHoySet.size;
    
    tareasCount.textContent = tareasCache.length;
    
    const tareasSemana = new Set();
    const inicioSemana = getInicioSemana();
    historialCache.forEach(h => {
        if (h.fecha) {
            try {
                const fechaHistorial = h.fecha.toDate();
                if (fechaHistorial >= inicioSemana) {
                    tareasSemana.add(h.titulo);
                }
            } catch (e) {}
        }
    });
    semanaCount.textContent = tareasSemana.size;
    historialCount.textContent = historialCache.length;
    
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
    const pendientes = [];
    const realizadas = [];
    
    tareasCache.forEach(tarea => {
        if (realizadasHoySet.has(tarea.id)) {
            realizadas.push(tarea);
        } else {
            pendientes.push(tarea);
        }
    });
    
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
                <div class="task-section">
                    <h3 class="section-title pending-title">
                        <span class="material-icons">pending</span> Pendientes (${pendientes.length})
                    </h3>
                    ${renderizarTareas(pendientes, false)}
                </div>
            ` : ''}
            
            ${realizadas.length > 0 ? `
                <div class="task-section">
                    <h3 class="section-title completed-title">
                        <span class="material-icons">check_circle</span> Realizadas hoy (${realizadas.length})
                    </h3>
                    ${renderizarTareas(realizadas, true)}
                </div>
            ` : ''}
            
            ${pendientes.length === 0 && realizadas.length === 0 ? `
                <div class="empty-state">
                    <span class="material-icons empty-icon">assignment</span>
                    <p class="empty-text">No hay tareas</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderizarTareas(tareas, completadas = false) {
    const esAdmin = currentUser?.email === adminEmail;
    
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
            try {
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
            } catch (e) {}
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
                <div class="empty-state">
                    <span class="material-icons empty-icon">event_busy</span>
                    <p class="empty-text">No hay tareas realizadas esta semana</p>
                </div>
            ` : `
                <div class="weekly-stats">
                    ${tareasArray.map(t => `
                        <div class="stat-item">
                            <div class="task-name">
                                <span class="material-icons">task</span>
                                ${escapeHtml(t.titulo)}
                            </div>
                            <div>
                                <span class="task-count">${t.veces} ${t.veces === 1 ? 'vez' : 'veces'}</span>
                                <span class="task-users">por ${Array.from(t.usuarios).join(', ')}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    `;
}

// ============================================
// VISTA HISTORIAL
// ============================================
function mostrarHistorial() {
    const registros = historialCache.map(h => {
        if (h.fecha) {
            try {
                const fecha = h.fecha.toDate();
                return {
                    fecha: fecha.toLocaleDateString(),
                    hora: fecha.toLocaleTimeString(),
                    titulo: h.titulo,
                    usuario: h.completadaPor
                };
            } catch (e) {
                return null;
            }
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
                        '<tr><td colspan="4" class="empty-table">No hay historial</td></tr>' :
                        registros.map(r => `
                            <tr>
                                <td class="fecha-col">${r.fecha}</td>
                                <td>${r.hora}</td>
                                <td class="tarea-col">${escapeHtml(r.titulo)}</td>
                                <td class="usuario-col">${escapeHtml(r.usuario)}</td>
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
    
    if (currentUser.email !== adminEmail) {
        alert('❌ Solo el administrador puede crear tareas');
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
        
        taskForm.reset();
        document.getElementById('taskStartDate').value = new Date().toISOString().split('T')[0];
        
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
    
    if (realizadasHoySet.has(tareaId)) {
        const registro = historialCache.find(h => h.tareaId === tareaId);
        let hora = 'hora desconocida';
        if (registro?.fecha) {
            try {
                hora = registro.fecha.toDate().toLocaleTimeString();
            } catch (e) {}
        }
        
        alert(`⛔ Tarea ya realizada hoy por ${registro?.completadaPor || 'otro usuario'} a las ${hora}`);
        return;
    }
    
    if (!confirm(`¿Marcar "${titulo}" como realizada?`)) return;
    
    try {
        await db.collection('historial').add({
            tareaId: tareaId,
            titulo: titulo,
            completadaPor: currentUser.email,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const tareaRef = db.collection('tareas').doc(tareaId);
        const tareaDoc = await tareaRef.get();
        const tareaData = tareaDoc.data();
        
        if (tareaData.recurrencia && tareaData.recurrencia !== 'none') {
            try {
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
            } catch (e) {}
        } else {
            await tareaRef.update({ activa: false });
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al completar la tarea: ' + error.message);
    }
};

// ============================================
// EDITAR TAREA
// ============================================
window.abrirModalEdicion = async (tareaId) => {
    if (!currentUser || currentUser.email !== adminEmail) {
        alert('❌ Solo el administrador puede editar tareas');
        return;
    }
    
    try {
        const tareaRef = db.collection('tareas').doc(tareaId);
        const tareaDoc = await tareaRef.get();
        
        if (!tareaDoc.exists) {
            alert('❌ La tarea no existe');
            return;
        }
        
        const data = tareaDoc.data();
        
        document.getElementById('editTaskId').value = tareaId;
        document.getElementById('editTitle').value = data.titulo || '';
        document.getElementById('editDescription').value = data.descripcion || '';
        document.getElementById('editPriority').value = data.prioridad || 'media';
        document.getElementById('editRecurrence').value = data.recurrencia || 'none';
        document.getElementById('editStartDate').value = data.fechaInicio || '';
        
        editModal.style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al cargar la tarea');
    }
};

window.cerrarModal = () => {
    editModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === editModal) {
        cerrarModal();
    }
};

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser || currentUser.email !== adminEmail) {
        alert('❌ Solo el administrador puede editar tareas');
        return;
    }
    
    try {
        const tareaId = document.getElementById('editTaskId').value;
        const tareaRef = db.collection('tareas').doc(tareaId);
        
        await tareaRef.update({
            titulo: document.getElementById('editTitle').value,
            descripcion: document.getElementById('editDescription').value,
            prioridad: document.getElementById('editPriority').value,
            recurrencia: document.getElementById('editRecurrence').value,
            fechaInicio: document.getElementById('editStartDate').value
        });
        
        cerrarModal();
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al actualizar la tarea');
    }
});

// ============================================
// LIMPIAR BASE DE DATOS - CON CONFIRMACIÓN
// ============================================
let limpiandoDB = false;

window.mostrarModalLimpiarDB = () => {
    if (!currentUser || currentUser.email !== adminEmail) {
        alert('❌ Solo el administrador puede limpiar la base de datos');
        return;
    }
    
    document.getElementById('confirmPassword').value = '';
    document.getElementById('limpiarError').style.display = 'none';
    document.getElementById('limpiarModal').style.display = 'block';
};

window.cerrarModalLimpiar = () => {
    document.getElementById('limpiarModal').style.display = 'none';
};

window.ejecutarLimpiarDB = async () => {
    if (limpiandoDB) return;
    
    const password = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('limpiarError');
    
    if (!password) {
        errorDiv.textContent = '❌ Debes ingresar tu contraseña';
        errorDiv.style.display = 'block';
        return;
    }
    
    limpiandoDB = true;
    
    try {
        const credential = firebase.auth.EmailAuthProvider.credential(
            currentUser.email,
            password
        );
        
        await currentUser.reauthenticateWithCredential(credential);
        
        errorDiv.style.display = 'none';
        cerrarModalLimpiar();
        
        const confirmar = confirm('⚠️ ¿Estás ABSOLUTAMENTE SEGURO?\n\nEsta acción eliminará TODAS las tareas y TODO el historial permanentemente.\n\nNo hay forma de recuperar los datos.');
        if (!confirmar) {
            limpiandoDB = false;
            return;
        }
        
        alert('🔄 Limpiando base de datos... Por favor espera.');
        
        const tareasSnapshot = await db.collection('tareas').get();
        const batchTareas = db.batch();
        tareasSnapshot.docs.forEach(doc => {
            batchTareas.delete(doc.ref);
        });
        await batchTareas.commit();
        
        const historialSnapshot = await db.collection('historial').get();
        const batchHistorial = db.batch();
        historialSnapshot.docs.forEach(doc => {
            batchHistorial.delete(doc.ref);
        });
        await batchHistorial.commit();
        
        tareasCache = [];
        historialCache = [];
        realizadasHoySet.clear();
        
        actualizarDashboard();
        actualizarVista();
        
        alert('✅ Base de datos limpiada correctamente');
        
    } catch (error) {
        console.error('Error:', error);
        errorDiv.textContent = '❌ Contraseña incorrecta o error de autenticación';
        errorDiv.style.display = 'block';
    } finally {
        limpiandoDB = false;
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

// Cerrar modal de limpieza al hacer clic fuera
window.addEventListener('click', (event) => {
    const modal = document.getElementById('limpiarModal');
    if (event.target === modal) {
        cerrarModalLimpiar();
    }
});
