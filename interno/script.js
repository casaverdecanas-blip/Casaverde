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
const adminUser = 'admin@casaverde.com';

// Cache de datos
let tareasCache = [];
let historialCache = [];
let realizadasHoy = new Set();

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
const adminSection = document.getElementById('adminSection');
const viewOnlyMessage = document.getElementById('viewOnlyMessage');
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
        
        if (user.email === adminUser) {
            adminSection.style.display = 'block';
            viewOnlyMessage.style.display = 'none';
        } else {
            adminSection.style.display = 'none';
            viewOnlyMessage.style.display = 'flex';
        }
        
        showPrivateArea();
        setupRealtimeData();
        actualizarEstadisticasSemanales(user.email);
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
        actualizarVistaSegunFiltro();
    });
});

// ============================================
// DATOS EN TIEMPO REAL
// ============================================
function setupRealtimeData() {
    // Escuchar tareas
    if (unsubscribeTasks) unsubscribeTasks();
    
    const tasksQuery = db.collection('tareas')
        .orderBy('fechaCreacion', 'desc');
    
    unsubscribeTasks = tasksQuery.onSnapshot((snapshot) => {
        tareasCache = [];
        snapshot.forEach(doc => {
            tareasCache.push({ id: doc.id, ...doc.data() });
        });
        procesarDatos();
    });

    // Escuchar historial
    if (unsubscribeHistorial) unsubscribeHistorial();
    
    const historialQuery = db.collection('historial')
        .orderBy('fecha', 'desc')
        .limit(1000);
    
    unsubscribeHistorial = historialQuery.onSnapshot((snapshot) => {
        historialCache = [];
        snapshot.forEach(doc => {
            historialCache.push({ id: doc.id, ...doc.data() });
        });
        procesarDatos();
    });
}

function procesarDatos() {
    // Actualizar Set de realizadas hoy
    realizadasHoy.clear();
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    
    historialCache.forEach(reg => {
        if (reg.fecha) {
            const fechaReg = reg.fecha.toDate();
            if (fechaReg >= inicioDia) {
                realizadasHoy.add(reg.tareaId);
            }
        }
    });

    // Actualizar contadores
    actualizarContadores();
    
    // Actualizar vista según filtro
    actualizarVistaSegunFiltro();
}

function actualizarContadores() {
    const tareasActivas = tareasCache.filter(t => t.activa);
    tareasCount.textContent = tareasActivas.length;
    
    // Tareas realizadas esta semana (únicas)
    const tareasSemana = new Set();
    const inicioSemana = getInicioSemana();
    historialCache.forEach(reg => {
        if (reg.fecha && reg.fecha.toDate() >= inicioSemana) {
            tareasSemana.add(reg.titulo);
        }
    });
    semanaCount.textContent = tareasSemana.size;
    
    // Total historial
    historialCount.textContent = historialCache.length;
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

function getFinSemana() {
    const fecha = getInicioSemana();
    fecha.setDate(fecha.getDate() + 6);
    fecha.setHours(23, 59, 59, 999);
    return fecha;
}

// ============================================
// VISTAS SEGÚN FILTRO
// ============================================
function actualizarVistaSegunFiltro() {
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
// VISTA TAREAS (con prioridad y realizadas al final)
// ============================================
function mostrarVistaTareas() {
    const tareasActivas = tareasCache.filter(t => t.activa);
    const tareasProcesadas = procesarRecurrencias(tareasActivas);
    
    // Separar pendientes y realizadas hoy
    const pendientes = [];
    const realizadas = [];
    
    tareasProcesadas.forEach(tarea => {
        if (realizadasHoy.has(tarea.id)) {
            realizadas.push(tarea);
        } else {
            pendientes.push(tarea);
        }
    });

    // Ordenar pendientes por prioridad
    const ordenPrioridad = { 'alta': 1, 'media': 2, 'baja': 3 };
    pendientes.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);
    
    const esAdmin = currentUser?.email === adminUser;
    
    contentArea.innerHTML = `
        <div class="tasks-container">
            <h2>
                <span class="material-icons">list</span>
                Tareas
                <span class="count-badge">${pendientes.length + realizadas.length}</span>
            </h2>
            
            ${pendientes.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #27ae60; margin-bottom: 10px;">
                        <span class="material-icons">pending</span> Pendientes (${pendientes.length})
                    </h3>
                    ${renderizarListaTareas(pendientes, esAdmin)}
                </div>
            ` : ''}
            
            ${realizadas.length > 0 ? `
                <div>
                    <h3 style="color: #7f8c8d; margin-bottom: 10px;">
                        <span class="material-icons">check_circle</span> Realizadas hoy (${realizadas.length})
                    </h3>
                    ${renderizarListaTareas(realizadas, esAdmin, true)}
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

function renderizarListaTareas(tareas, esAdmin, completadas = false) {
    return tareas.map(tarea => {
        const fechaMostrar = tarea.proximaFecha ? 
            tarea.proximaFecha.toLocaleDateString() : 
            (tarea.fechaInicio || 'Fecha no disponible');
        
        return `
            <div class="task-item priority-${tarea.prioridad || 'media'} ${completadas ? 'completed' : ''}">
                <div class="task-content">
                    <h3>
                        ${escapeHtml(tarea.titulo || 'Sin título')}
                        ${tarea.recurrencia && tarea.recurrencia !== 'none' ? 
                            `<span class="recurrence-badge">
                                ${getRecurrenciaText(tarea.recurrencia)}
                            </span>` : ''}
                        ${completadas ? 
                            `<span class="completed-badge">
                                <span class="material-icons">check</span> Hecha
                            </span>` : ''}
                    </h3>
                    ${tarea.descripcion ? `<p>${escapeHtml(tarea.descripcion)}</p>` : ''}
                    <div class="task-meta">
                        <span>
                            <span class="material-icons">event</span> 
                            ${fechaMostrar}
                        </span>
                        <span>
                            <span class="material-icons">flag</span> 
                            ${tarea.prioridad || 'media'}
                        </span>
                    </div>
                </div>
                <div class="task-actions">
                    ${esAdmin ? `
                        <button onclick="abrirModalEdicion('${tarea.id}')" class="edit-btn">
                            <span class="material-icons">edit</span>
                        </button>
                    ` : ''}
                    ${!completadas ? `
                        <button onclick="completarTarea('${tarea.id}', '${escapeHtml(tarea.titulo || '')}')" class="complete-btn">
                            <span class="material-icons">check_circle</span> Realizar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// VISTA SEMANA (tareas realizadas esta semana)
// ============================================
function mostrarVistaSemana() {
    const inicioSemana = getInicioSemana();
    const finSemana = getFinSemana();
    
    // Agrupar tareas realizadas en la semana
    const tareasSemana = new Map();
    
    historialCache.forEach(reg => {
        if (reg.fecha) {
            const fechaReg = reg.fecha.toDate();
            if (fechaReg >= inicioSemana && fechaReg <= finSemana) {
                const titulo = reg.titulo;
                if (!tareasSemana.has(titulo)) {
                    tareasSemana.set(titulo, {
                        titulo: titulo,
                        veces: 0,
                        realizadaPor: new Set()
                    });
                }
                const tarea = tareasSemana.get(titulo);
                tarea.veces++;
                tarea.realizadaPor.add(reg.completadaPor);
            }
        }
    });

    const tareasArray = Array.from(tareasSemana.values());
    
    contentArea.innerHTML = `
        <div class="history-container">
            <h2>
                <span class="material-icons">event_note</span>
                Realizadas esta semana
                <span class="count-badge">${tareasArray.length}</span>
            </h2>
            
            <div class="weekly-stats">
                <p style="color: #666; margin-bottom: 15px;">
                    Semana del ${inicioSemana.toLocaleDateString()} al ${finSemana.toLocaleDateString()}
                </p>
                
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
                                por ${Array.from(t.realizadaPor).join(', ')}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================
// VISTA HISTORIAL
// ============================================
async function mostrarHistorial() {
    const registros = historialCache.map(doc => {
        if (doc.fecha) {
            const fecha = doc.fecha.toDate();
            return {
                fechaStr: fecha.toLocaleDateString(),
                hora: fecha.toLocaleTimeString(),
                titulo: doc.titulo || 'Sin título',
                usuario: doc.completadaPor || 'Usuario desconocido'
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
                        <th>Fecha y Hora</th>
                        <th>Tarea</th>
                        <th>Realizada por</th>
                    </tr>
                </thead>
                <tbody>
                    ${registros.length === 0 ? 
                        '<tr><td colspan="3" style="text-align: center; color: #999;">No hay historial</td></tr>' :
                        registros.map(r => `
                            <tr>
                                <td class="fecha-col">${r.fechaStr} ${r.hora}</td>
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
// PROCESAMIENTO DE RECURRENCIAS
// ============================================
function procesarRecurrencias(tareas) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    return tareas.map(tarea => {
        if (!tarea.activa) return tarea;
        
        try {
            const fechaInicio = new Date(tarea.fechaInicio + 'T00:00:00');
            const proximaFecha = calcularProximaFecha(fechaInicio, tarea.recurrencia, hoy);
            
            return {
                ...tarea,
                proximaFecha: proximaFecha,
                debeAparecerHoy: debeAparecerEnFecha(proximaFecha, hoy, tarea.recurrencia)
            };
        } catch (error) {
            return tarea;
        }
    });
}

function calcularProximaFecha(fechaInicio, recurrencia, fechaReferencia) {
    if (recurrencia === 'none' || !fechaInicio) return fechaInicio;
    if (isNaN(fechaInicio.getTime())) return fechaInicio;
    
    let fecha = new Date(fechaInicio);
    let intentos = 0;
    const maxIntentos = 100;
    
    while (fecha <= fechaReferencia && intentos < maxIntentos) {
        switch(recurrencia) {
            case 'daily':
                fecha.setDate(fecha.getDate() + 1);
                break;
            case 'weekly':
                fecha.setDate(fecha.getDate() + 7);
                break;
            case 'biweekly':
                fecha.setDate(fecha.getDate() + 1);
                let contador = 0;
                while (fecha.getDay() !== 1 && fecha.getDay() !== 4 && contador < 7) {
                    fecha.setDate(fecha.getDate() + 1);
                    contador++;
                }
                break;
            case 'monthly':
                fecha.setMonth(fecha.getMonth() + 1);
                break;
        }
        intentos++;
    }
    
    return fecha;
}

function debeAparecerEnFecha(fecha, hoy, recurrencia) {
    if (!fecha || isNaN(fecha.getTime())) return false;
    
    if (recurrencia === 'biweekly') {
        return (fecha.getDay() === 1 || fecha.getDay() === 4) && 
               fecha.toDateString() === hoy.toDateString();
    }
    return fecha.toDateString() === hoy.toDateString();
}

// ============================================
// COMPLETAR TAREA (CON CONTROL DE DUPLICADOS)
// ============================================
window.completarTarea = async (tareaId, titulo) => {
    if (!currentUser) {
        alert('❌ Debes iniciar sesión');
        return;
    }
    
    try {
        // Verificar si ya fue realizada hoy
        if (realizadasHoy.has(tareaId)) {
            const registro = historialCache.find(r => 
                r.tareaId === tareaId && 
                r.fecha && 
                r.fecha.toDate() >= new Date().setHours(0,0,0,0)
            );
            
            if (registro) {
                const hora = registro.fecha ? 
                    new Date(registro.fecha.toDate()).toLocaleTimeString() : 
                    'hora desconocida';
                
                alert(
                    `⛔ TAREA YA REALIZADA HOY\n\n` +
                    `📌 Tarea: "${titulo}"\n` +
                    `👤 Realizada por: ${registro.completadaPor}\n` +
                    `🕐 Hora: ${hora}\n\n` +
                    `❌ No puedes marcarla nuevamente.`
                );
                return;
            }
        }
        
        if (!confirm(`✅ ¿Marcar "${titulo}" como realizada?`)) return;
        
        const tareaRef = db.collection('tareas').doc(tareaId);
        const tareaDoc = await tareaRef.get();
        
        if (!tareaDoc.exists) {
            alert('❌ La tarea no existe');
            return;
        }
        
        const tareaData = tareaDoc.data();
        
        await db.collection('historial').add({
            tareaId: tareaId,
            titulo: tareaData.titulo,
            completadaPor: currentUser.email,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (tareaData.recurrencia && tareaData.recurrencia !== 'none') {
            const fechaActual = new Date(tareaData.fechaInicio + 'T00:00:00');
            const nuevaFecha = calcularProximaFecha(fechaActual, tareaData.recurrencia, new Date());
            
            await tareaRef.update({
                fechaInicio: nuevaFecha.toISOString().split('T')[0]
            });
            
            alert(`✅ Tarea reprogramada para ${nuevaFecha.toLocaleDateString()}`);
        } else {
            await tareaRef.update({ activa: false });
            alert('✅ Tarea completada');
        }
        
        actualizarEstadisticasSemanales(currentUser.email);
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('❌ Error al marcar la tarea');
    }
};

// ============================================
// ESTADÍSTICAS SEMANALES
// ============================================
async function actualizarEstadisticasSemanales(email) {
    if (!email) return;
    
    try {
        const inicioSemana = getInicioSemana();
        const finSemana = getFinSemana();
        
        let completadas = 0;
        historialCache.forEach(reg => {
            if (reg.completadaPor === email && reg.fecha) {
                const fechaReg = reg.fecha.toDate();
                if (fechaReg >= inicioSemana && fechaReg <= finSemana) {
                    completadas++;
                }
            }
        });
        
        const tareasActivas = tareasCache.filter(t => t.activa);
        const totalSemana = tareasActivas.length;
        
        if (weeklyStatsText) {
            weeklyStatsText.textContent = `Llevas realizadas ${completadas} tareas de las ${totalSemana} propuestas para esta semana`;
        }
        
        if (weeklyProgress) {
            const porcentaje = totalSemana > 0 ? (completadas / totalSemana) * 100 : 0;
            weeklyProgress.style.width = `${porcentaje}%`;
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

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

// ============================================
// EDICIÓN DE TAREAS
// ============================================
window.abrirModalEdicion = async (tareaId) => {
    if (!currentUser || currentUser.email !== adminUser) {
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
        console.error('❌ Error:', error);
        alert('❌ Error al cargar la tarea');
    }
};

window.cerrarModal = () => {
    editModal.style.display = 'none';
};

window.onclick = function(event) {
    if (event.target === editModal) {
        cerrarModal();
    }
};

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser || currentUser.email !== adminUser) {
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
        alert('✅ Tarea actualizada');
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('❌ Error al actualizar');
    }
});
