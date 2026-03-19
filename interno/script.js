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
let currentFilter = 'pendientes';
let unsubscribeTasks = null;
let adminUser = 'admin@casaverde.com';

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
        
        // Verificar si es admin
        if (user.email === adminUser) {
            adminSection.style.display = 'block';
            viewOnlyMessage.style.display = 'none';
        } else {
            adminSection.style.display = 'none';
            viewOnlyMessage.style.display = 'flex';
        }
        
        showPrivateArea();
        setupRealtimeTasks();
        actualizarEstadisticasSemanales(user.email);
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
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            try {
                await auth.createUserWithEmailAndPassword(email, password);
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
// ESTADÍSTICAS SEMANALES
// ============================================
async function actualizarEstadisticasSemanales(email) {
    if (!email) return;
    
    try {
        // Obtener inicio y fin de la semana actual
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        // Calcular inicio de semana (lunes)
        const inicioSemana = new Date(hoy);
        const diaSemana = hoy.getDay();
        const diasARestar = diaSemana === 0 ? 6 : diaSemana - 1;
        inicioSemana.setDate(hoy.getDate() - diasARestar);
        inicioSemana.setHours(0, 0, 0, 0);
        
        // Calcular fin de semana (domingo)
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(inicioSemana.getDate() + 6);
        finSemana.setHours(23, 59, 59, 999);
        
        // Contar tareas completadas en la semana
        let completadas = 0;
        try {
            const historial = await db.collection('historial')
                .where('completadaPor', '==', email)
                .get();
            
            historial.docs.forEach(doc => {
                const data = doc.data();
                if (data.fecha) {
                    const fechaComp = new Date(data.fecha.toDate());
                    if (fechaComp >= inicioSemana && fechaComp <= finSemana) {
                        completadas++;
                    }
                }
            });
        } catch (error) {
            console.error('Error obteniendo historial:', error);
        }
        
        // Contar tareas activas totales
        let totalSemana = 0;
        try {
            const tareasActivas = await db.collection('tareas')
                .where('activa', '==', true)
                .get();
            
            const tareas = [];
            tareasActivas.docs.forEach(doc => {
                tareas.push({ id: doc.id, ...doc.data() });
            });
            
            totalSemana = tareas.length;
            
        } catch (error) {
            console.error('Error obteniendo tareas:', error);
        }
        
        // Actualizar UI
        if (weeklyStatsText) {
            weeklyStatsText.textContent = `Llevas realizadas ${completadas} tareas de las ${totalSemana} propuestas para esta semana`;
        }
        
        if (weeklyProgress) {
            const porcentaje = totalSemana > 0 ? (completadas / totalSemana) * 100 : 0;
            weeklyProgress.style.width = `${porcentaje}%`;
        }
        
    } catch (error) {
        console.error('Error en estadísticas:', error);
        if (weeklyStatsText) {
            weeklyStatsText.textContent = 'Estadísticas no disponibles';
        }
    }
}

// ============================================
// TAREAS EN TIEMPO REAL
// ============================================
function setupRealtimeTasks() {
    if (unsubscribeTasks) unsubscribeTasks();

    let query = db.collection('tareas')
        .orderBy('fechaCreacion', 'desc');

    unsubscribeTasks = query.onSnapshot((snapshot) => {
        const tareas = [];
        snapshot.forEach(doc => {
            tareas.push({ id: doc.id, ...doc.data() });
        });
        
        const tareasProcesadas = procesarRecurrencias(tareas);
        actualizarVista(tareasProcesadas);
        
        if (currentUser) {
            actualizarEstadisticasSemanales(currentUser.email);
        }
    });
}

function procesarRecurrencias(tareas) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    return tareas.map(tarea => {
        if (!tarea.activa) return tarea;
        
        const fechaInicio = new Date(tarea.fechaInicio + 'T00:00:00');
        let proximaFecha = calcularProximaFecha(fechaInicio, tarea.recurrencia, hoy);
        
        return {
            ...tarea,
            proximaFecha: proximaFecha,
            debeAparecerHoy: debeAparecerEnFecha(proximaFecha, hoy, tarea.recurrencia)
        };
    });
}

function calcularProximaFecha(fechaInicio, recurrencia, fechaReferencia) {
    if (recurrencia === 'none' || !fechaInicio) return fechaInicio;
    
    let fecha = new Date(fechaInicio);
    
    while (fecha <= fechaReferencia) {
        switch(recurrencia) {
            case 'daily':
                fecha.setDate(fecha.getDate() + 1);
                break;
            case 'weekly':
                fecha.setDate(fecha.getDate() + 7);
                break;
            case 'biweekly':
                fecha.setDate(fecha.getDate() + 1);
                while (fecha.getDay() !== 1 && fecha.getDay() !== 4) {
                    fecha.setDate(fecha.getDate() + 1);
                }
                break;
            case 'monthly':
                fecha.setMonth(fecha.getMonth() + 1);
                break;
        }
    }
    
    return fecha;
}

function debeAparecerEnFecha(fecha, hoy, recurrencia) {
    if (!fecha) return false;
    
    if (recurrencia === 'biweekly') {
        return (fecha.getDay() === 1 || fecha.getDay() === 4) && 
               fecha.toDateString() === hoy.toDateString();
    }
    return fecha.toDateString() === hoy.toDateString();
}

// ============================================
// CRUD DE TAREAS
// ============================================
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (currentUser.email !== adminUser) {
        alert('Solo el administrador puede crear tareas');
        return;
    }
    
    const tarea = {
        titulo: document.getElementById('taskTitle').value,
        descripcion: document.getElementById('taskDescription').value,
        prioridad: document.getElementById('taskPriority').value,
        recurrencia: document.getElementById('taskRecurrence').value,
        fechaInicio: document.getElementById('taskStartDate').value,
        activa: true,
        completada: false,
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
        creadaPor: currentUser.email
    };

    await db.collection('tareas').add(tarea);
    taskForm.reset();
});

// Completar tarea
window.completarTarea = async (tareaId, titulo) => {
    if (!confirm(`¿Marcar "${titulo}" como realizada?`)) return;
    
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tarea = await tareaRef.get();
    const data = tarea.data();
    
    await db.collection('historial').add({
        tareaId: tareaId,
        titulo: data.titulo,
        completadaPor: currentUser.email,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    if (data.recurrencia && data.recurrencia !== 'none') {
        const fechaActual = new Date(data.fechaInicio + 'T00:00:00');
        const nuevaFecha = calcularSiguienteFecha(fechaActual, data.recurrencia);
        
        await tareaRef.update({
            fechaInicio: nuevaFecha.toISOString().split('T')[0]
        });
    } else {
        await tareaRef.update({ activa: false });
    }
    
    actualizarEstadisticasSemanales(currentUser.email);
};

// Editar tarea
window.abrirModalEdicion = async (tareaId) => {
    if (currentUser.email !== adminUser) {
        alert('Solo el administrador puede editar tareas');
        return;
    }
    
    const tareaRef = db.collection('tareas').doc(tareaId);
    const tarea = await tareaRef.get();
    const data = tarea.data();
    
    document.getElementById('editTaskId').value = tareaId;
    document.getElementById('editTitle').value = data.titulo;
    document.getElementById('editDescription').value = data.descripcion || '';
    document.getElementById('editPriority').value = data.prioridad;
    document.getElementById('editRecurrence').value = data.recurrencia;
    document.getElementById('editStartDate').value = data.fechaInicio;
    
    editModal.style.display = 'block';
};

window.cerrarModal = () => {
    editModal.style.display = 'none';
};

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
});

// ============================================
// RENDERIZADO
// ============================================
function actualizarVista(tareas) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const tareasActivas = tareas.filter(t => t.activa);
    const tareasHoy = tareasActivas.filter(t => 
        t.proximaFecha && t.proximaFecha.toDateString() === hoy.toDateString()
    );
    
    pendingToday.textContent = tareasHoy.length;
    totalActive.textContent = tareasActivas.length;
    
    db.collection('historial')
        .where('fecha', '>=', hoy)
        .where('fecha', '<', new Date(hoy.getTime() + 86400000))
        .get()
        .then(snapshot => {
            completedToday.textContent = snapshot.size;
        });
    
    let tareasMostrar = [];
    switch(currentFilter) {
        case 'pendientes':
            tareasMostrar = tareasActivas;
            break;
        case 'hoy':
            tareasMostrar = tareasHoy;
            break;
        case 'repetitivas':
            tareasMostrar = tareasActivas.filter(t => t.recurrencia !== 'none');
            break;
        case 'completadas':
            mostrarCompletadasHoy();
            return;
        case 'historial':
            mostrarHistorial();
            return;
    }
    
    renderizarTareas(tareasMostrar);
}

function renderizarTareas(tareas) {
    if (tareas.length === 0) {
        contentArea.innerHTML = `
            <div class="tasks-container">
                <div style="text-align: center; padding: 40px;">
                    <span class="material-icons" style="font-size: 48px; color: #ccc;">assignment</span>
                    <p style="color: #999; margin-top: 10px;">No hay tareas para mostrar</p>
                </div>
            </div>
        `;
        return;
    }

    const esAdmin = currentUser && currentUser.email === adminUser;

    contentArea.innerHTML = `
        <div class="tasks-container">
            <h2>${getTituloFiltro()}</h2>
            ${tareas.map(tarea => `
                <div class="task-item priority-${tarea.prioridad}">
                    <div class="task-content">
                        <h3>
                            ${escapeHtml(tarea.titulo)}
                            ${tarea.recurrencia && tarea.recurrencia !== 'none' ? 
                                `<span class="recurrence-badge">
                                    ${getRecurrenciaText(tarea.recurrencia)}
                                </span>` : ''}
                        </h3>
                        ${tarea.descripcion ? `<p>${escapeHtml(tarea.descripcion)}</p>` : ''}
                        <div class="task-meta">
                            <span>
                                <span class="material-icons">event</span> 
                                ${tarea.proximaFecha ? tarea.proximaFecha.toLocaleDateString() : tarea.fechaInicio}
                            </span>
                            <span>
                                <span class="material-icons">flag</span> 
                                ${tarea.prioridad}
                            </span>
                        </div>
                    </div>
                    <div class="task-actions">
                        ${esAdmin ? `
                            <button onclick="abrirModalEdicion('${tarea.id}')" class="edit-btn">
                                <span class="material-icons">edit</span> Editar
                            </button>
                        ` : ''}
                        <button onclick="completarTarea('${tarea.id}', '${escapeHtml(tarea.titulo)}')" class="complete-btn">
                            <span class="material-icons">check_circle</span> Realizada
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function mostrarCompletadasHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const historial = await db.collection('historial')
        .where('fecha', '>=', hoy)
        .where('fecha', '<', new Date(hoy.getTime() + 86400000))
        .orderBy('fecha', 'desc')
        .get();

    contentArea.innerHTML = `
        <div class="history-container">
            <h2>✅ Completadas hoy - ${hoy.toLocaleDateString()}</h2>
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>Tarea</th>
                        <th>Realizada por</th>
                    </tr>
                </thead>
                <tbody>
                    ${historial.empty ? 
                        '<tr><td colspan="3" style="text-align: center; color: #999;">No hay tareas completadas hoy</td></tr>' :
                        historial.docs.map(doc => {
                            const data = doc.data();
                            const hora = new Date(data.fecha.toDate()).toLocaleTimeString();
                            return `
                                <tr>
                                    <td class="fecha-col">${hora}</td>
                                    <td class="tarea-col">${data.titulo}</td>
                                    <td class="usuario-col">${data.completadaPor}</td>
                                </tr>
                            `;
                        }).join('')
                    }
                </tbody>
            </table>
        </div>
    `;
}

async function mostrarHistorial() {
    const historial = await db.collection('historial')
        .orderBy('fecha', 'desc')
        .limit(500)
        .get();

    const registros = [];
    historial.docs.forEach(doc => {
        const data = doc.data();
        const fecha = new Date(data.fecha.toDate());
        registros.push({
            fechaStr: fecha.toLocaleDateString(),
            hora: fecha.toLocaleTimeString(),
            titulo: data.titulo,
            usuario: data.completadaPor
        });
    });

    contentArea.innerHTML = `
        <div class="history-container">
            <h2>📋 Historial de Tareas Realizadas</h2>
            <p style="color: #666; margin-bottom: 10px;">Total: ${registros.length} tareas realizadas</p>
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
                                <td class="tarea-col">${r.titulo}</td>
                                <td class="usuario-col">${r.usuario}</td>
                            </tr>
                        `).join('')
                    }
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function calcularSiguienteFecha(fecha, recurrencia) {
    const nuevaFecha = new Date(fecha);
    
    switch(recurrencia) {
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
    
    return nuevaFecha;
}

function getTituloFiltro() {
    const titulos = {
        pendientes: 'Todas las tareas pendientes',
        hoy: 'Tareas para hoy',
        repetitivas: 'Tareas repetitivas'
    };
    return titulos[currentFilter];
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

// Filtros
filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        if (currentUser) setupRealtimeTasks();
    });
});

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
    if (event.target === editModal) {
        cerrarModal();
    }
};
