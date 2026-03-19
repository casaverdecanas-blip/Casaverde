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
const adminUser = 'admin@casaverde.com';

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
        if (unsubscribeTasks) {
            unsubscribeTasks();
            unsubscribeTasks = null;
        }
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
        if (currentUser) setupRealtimeTasks();
    });
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showPrivateArea() {
    loginContainer.style.display = 'none';
    privateArea.style.display = 'block';
}

function showLoginArea() {
    loginContainer.style.display = 'flex';
    privateArea.style.display = 'none';
}

function getTituloFiltro() {
    const titulos = {
        pendientes: 'Todas las tareas pendientes',
        hoy: 'Tareas para hoy',
        repetitivas: 'Tareas repetitivas'
    };
    return titulos[currentFilter] || 'Tareas';
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
                    const fechaComp = data.fecha.toDate();
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
            
            totalSemana = tareasActivas.size;
            
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
    if (unsubscribeTasks) {
        unsubscribeTasks();
    }

    const query = db.collection('tareas')
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
    }, (error) => {
        console.error('Error en snapshot:', error);
    });
}

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
            console.error('Error procesando tarea:', tarea.titulo, error);
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
            default:
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
// CRUD DE TAREAS
// ============================================
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser || currentUser.email !== adminUser) {
        alert('Solo el administrador puede crear tareas');
        return;
    }
    
    try {
        const tarea = {
            titulo: document.getElementById('taskTitle').value,
            descripcion: document.getElementById('taskDescription').value || '',
            prioridad: document.getElementById('taskPriority').value,
            recurrencia: document.getElementById('taskRecurrence').value,
            fechaInicio: document.getElementById('taskStartDate').value,
            activa: true,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
            creadaPor: currentUser.email
        };

        await db.collection('tareas').add(tarea);
        taskForm.reset();
        alert('✅ Tarea creada correctamente');
    } catch (error) {
        console.error('Error creando tarea:', error);
        alert('❌ Error al crear la tarea');
    }
});

// ============================================
// CONTROL DE DUPLICADOS - VERSIÓN ROBUSTA
// ============================================

/**
 * Verifica si una tarea ya fue marcada hoy y devuelve quién la hizo
 * @param {string} tareaId - ID de la tarea
 * @returns {Promise<object|null>} Datos de quien la realizó o null
 */
async function verificarTareaRealizadaHoy(tareaId) {
    try {
        // Definir rango del día actual
        const inicioDia = new Date();
        inicioDia.setHours(0, 0, 0, 0);
        
        const finDia = new Date(inicioDia);
        finDia.setDate(inicioDia.getDate() + 1);
        
        console.log('🔍 Verificando tarea:', tareaId);
        console.log('📅 Rango:', inicioDia.toLocaleString(), '-', finDia.toLocaleString());
        
        // Obtener TODOS los registros de hoy
        const snapshot = await db.collection('historial')
            .where('fecha', '>=', inicioDia)
            .where('fecha', '<', finDia)
            .get();
        
        console.log('📊 Total registros hoy:', snapshot.size);
        
        // Buscar si esta tarea específica está en los registros
        let encontrado = null;
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log('   - Registro:', data.tareaId, data.titulo, 'por', data.completadaPor);
            
            if (data.tareaId === tareaId) {
                encontrado = data;
            }
        });
        
        if (encontrado) {
            const hora = encontrado.fecha ? 
                new Date(encontrado.fecha.toDate()).toLocaleTimeString() : 
                'hora desconocida';
            
            console.log('⛔ Tarea YA realizada por:', encontrado.completadaPor, 'a las', hora);
            
            return {
                realizada: true,
                usuario: encontrado.completadaPor,
                hora: hora
            };
        }
        
        console.log('✅ Tarea disponible para marcar hoy');
        return { realizada: false };
        
    } catch (error) {
        console.error('❌ Error verificando tarea:', error);
        return { realizada: false, error: true };
    }
}

/**
 * Marca una tarea como realizada (con control anti-duplicado)
 */
window.completarTarea = async (tareaId, titulo) => {
    console.log('🔄 Iniciando proceso para marcar tarea:', tareaId, titulo);
    
    // Validar usuario
    if (!currentUser) {
        alert('❌ Debes iniciar sesión');
        return;
    }
    
    try {
        // PASO 1: Verificar si ya fue realizada hoy
        const resultado = await verificarTareaRealizadaHoy(tareaId);
        
        if (resultado.realizada) {
            // Mostrar mensaje con la información de quién ya la hizo
            alert(
                `⛔ TAREA YA REALIZADA HOY\n\n` +
                `📌 Tarea: "${titulo}"\n` +
                `👤 Realizada por: ${resultado.usuario}\n` +
                `🕐 Hora: ${resultado.hora}\n\n` +
                `❌ No puedes marcarla nuevamente.`
            );
            return; // BLOQUEAR COMPLETAMENTE
        }
        
        // PASO 2: Confirmar con el usuario
        if (!confirm(`✅ ¿Marcar "${titulo}" como realizada?`)) {
            return;
        }
        
        // PASO 3: Obtener datos actualizados de la tarea
        const tareaRef = db.collection('tareas').doc(tareaId);
        const tareaDoc = await tareaRef.get();
        
        if (!tareaDoc.exists) {
            alert('❌ La tarea no existe');
            return;
        }
        
        const tareaData = tareaDoc.data();
        
        // PASO 4: Guardar en historial
        const historialRef = await db.collection('historial').add({
            tareaId: tareaId,
            titulo: tareaData.titulo,
            completadaPor: currentUser.email,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Registro guardado en historial:', historialRef.id);
        
        // PASO 5: Manejar recurrencia
        if (tareaData.recurrencia && tareaData.recurrencia !== 'none') {
            // Calcular siguiente fecha
            const fechaActual = new Date(tareaData.fechaInicio + 'T00:00:00');
            const nuevaFecha = calcularSiguienteFecha(fechaActual, tareaData.recurrencia);
            
            await tareaRef.update({
                fechaInicio: nuevaFecha.toISOString().split('T')[0]
            });
            
            alert(`✅ Tarea marcada y reprogramada para ${nuevaFecha.toLocaleDateString()}`);
        } else {
            // Tarea sin recurrencia: desactivar
            await tareaRef.update({ activa: false });
            alert('✅ Tarea marcada como completada');
        }
        
        // PASO 6: Actualizar estadísticas
        actualizarEstadisticasSemanales(currentUser.email);
        
    } catch (error) {
        console.error('❌ Error completando tarea:', error);
        alert('❌ Error al marcar la tarea. Revisa la consola para más detalles.');
    }
};

// ============================================
// FUNCIÓN PARA VER TAREAS REALIZADAS HOY
// ============================================
window.verTareasRealizadasHoy = async () => {
    if (!currentUser) {
        alert('❌ Debes iniciar sesión');
        return;
    }
    
    try {
        // Definir rango del día
        const inicioDia = new Date();
        inicioDia.setHours(0, 0, 0, 0);
        
        const finDia = new Date(inicioDia);
        finDia.setDate(inicioDia.getDate() + 1);
        
        // Obtener historial de hoy
        const snapshot = await db.collection('historial')
            .where('fecha', '>=', inicioDia)
            .where('fecha', '<', finDia)
            .orderBy('fecha', 'asc')
            .get();
        
        if (snapshot.empty) {
            alert('📭 No hay tareas realizadas hoy');
            return;
        }
        
        // Construir mensaje
        let mensaje = '📋 TAREAS REALIZADAS HOY:\n\n';
        let contador = 1;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const hora = data.fecha ? 
                new Date(data.fecha.toDate()).toLocaleTimeString() : 
                'hora desconocida';
            
            mensaje += `${contador++}. ${data.titulo}\n`;
            mensaje += `   👤 ${data.completadaPor} - 🕐 ${hora}\n\n`;
        });
        
        alert(mensaje);
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('❌ Error al obtener tareas realizadas');
    }
};

// ============================================
// EDICIÓN DE TAREAS (SOLO ADMIN)
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
        console.error('❌ Error abriendo modal:', error);
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
        alert('✅ Tarea actualizada correctamente');
        
    } catch (error) {
        console.error('❌ Error actualizando tarea:', error);
        alert('❌ Error al actualizar la tarea');
    }
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
        })
        .catch(error => {
            console.error('Error contando completadas hoy:', error);
            completedToday.textContent = '0';
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
        default:
            tareasMostrar = tareasActivas;
    }
    
    renderizarTareas(tareasMostrar);
}

function renderizarTareas(tareas) {
    if (!contentArea) return;

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
            ${tareas.map(tarea => {
                const fechaMostrar = tarea.proximaFecha ? 
                    tarea.proximaFecha.toLocaleDateString() : 
                    (tarea.fechaInicio || 'Fecha no disponible');
                
                return `
                <div class="task-item priority-${tarea.prioridad || 'media'}">
                    <div class="task-content">
                        <h3>
                            ${escapeHtml(tarea.titulo || 'Sin título')}
                            ${tarea.recurrencia && tarea.recurrencia !== 'none' ? 
                                `<span class="recurrence-badge">
                                    ${getRecurrenciaText(tarea.recurrencia)}
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
                                <span class="material-icons">edit</span> Editar
                            </button>
                        ` : ''}
                        <button onclick="completarTarea('${tarea.id}', '${escapeHtml(tarea.titulo || '')}')" class="complete-btn">
                            <span class="material-icons">check_circle</span> Realizada
                        </button>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;
}

async function mostrarCompletadasHoy() {
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const manana = new Date(hoy);
        manana.setDate(hoy.getDate() + 1);
        
        const historial = await db.collection('historial')
            .where('fecha', '>=', hoy)
            .where('fecha', '<', manana)
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
                                const hora = data.fecha ? new Date(data.fecha.toDate()).toLocaleTimeString() : 'Hora desconocida';
                                return `
                                    <tr>
                                        <td class="fecha-col">${hora}</td>
                                        <td class="tarea-col">${escapeHtml(data.titulo || '')}</td>
                                        <td class="usuario-col">${escapeHtml(data.completadaPor || '')}</td>
                                    </tr>
                                `;
                            }).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error mostrando completadas hoy:', error);
        contentArea.innerHTML = '<div class="tasks-container"><p style="color: #e74c3c;">Error al cargar las tareas completadas</p></div>';
    }
}

async function mostrarHistorial() {
    try {
        const historial = await db.collection('historial')
            .orderBy('fecha', 'desc')
            .limit(500)
            .get();

        const registros = [];
        historial.docs.forEach(doc => {
            const data = doc.data();
            if (data.fecha) {
                const fecha = data.fecha.toDate();
                registros.push({
                    fechaStr: fecha.toLocaleDateString(),
                    hora: fecha.toLocaleTimeString(),
                    titulo: data.titulo || 'Sin título',
                    usuario: data.completadaPor || 'Usuario desconocido'
                });
            }
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
                                    <td class="tarea-col">${escapeHtml(r.titulo)}</td>
                                    <td class="usuario-col">${escapeHtml(r.usuario)}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error mostrando historial:', error);
        contentArea.innerHTML = '<div class="tasks-container"><p style="color: #e74c3c;">Error al cargar el historial</p></div>';
    }
}

function calcularSiguienteFecha(fecha, recurrencia) {
    if (!fecha || isNaN(fecha.getTime())) return new Date();
    
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
            let contador = 0;
            while (nuevaFecha.getDay() !== 1 && nuevaFecha.getDay() !== 4 && contador < 7) {
                nuevaFecha.setDate(nuevaFecha.getDate() + 1);
                contador++;
            }
            break;
        case 'monthly':
            nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
            break;
        default:
            return nuevaFecha;
    }
    
    return nuevaFecha;
}

// ============================================
// FUNCIONES DE UTILIDAD (ADMIN)
// ============================================
window.limpiarDuplicados = async () => {
    if (!currentUser || currentUser.email !== adminUser) {
        alert('❌ Solo el administrador puede ejecutar esta función');
        return;
    }
    
    if (!confirm('¿Eliminar registros duplicados del historial? Esta acción no se puede deshacer.')) return;
    
    try {
        const historial = await db.collection('historial').get();
        const vistos = new Map();
        const aEliminar = [];
        
        historial.docs.forEach(doc => {
            const data = doc.data();
            if (!data.fecha || !data.tareaId) return;
            
            const fecha = data.fecha.toDate();
            const clave = `${data.tareaId}_${fecha.toLocaleDateString()}`;
            
            if (vistos.has(clave)) {
                aEliminar.push(doc.id);
            } else {
                vistos.set(clave, doc.id);
            }
        });
        
        for (const id of aEliminar) {
            await db.collection('historial').doc(id).delete();
        }
        
        alert(`✅ Eliminados ${aEliminar.length} registros duplicados`);
        
    } catch (error) {
        console.error('❌ Error limpiando duplicados:', error);
        alert('❌ Error al limpiar duplicados');
    }
};

window.mostrarEstadisticas = async () => {
    if (!currentUser || currentUser.email !== adminUser) {
        console.log('Función solo para administradores');
        return;
    }
    
    console.group('📊 ESTADÍSTICAS DEL SISTEMA');
    
    try {
        const tareas = await db.collection('tareas').get();
        console.log(`📋 Total tareas: ${tareas.size}`);
        
        const activas = await db.collection('tareas').where('activa', '==', true).get();
        console.log(`✅ Tareas activas: ${activas.size}`);
        
        const historial = await db.collection('historial').get();
        console.log(`📜 Total registros historial: ${historial.size}`);
        
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const manana = new Date(hoy);
        manana.setDate(hoy.getDate() + 1);
        
        const historialHoy = await db.collection('historial')
            .where('fecha', '>=', hoy)
            .where('fecha', '<', manana)
            .get();
        console.log(`📅 Completadas hoy: ${historialHoy.size}`);
        
        const usuariosUnicos = new Set();
        historial.docs.forEach(doc => {
            usuariosUnicos.add(doc.data().completadaPor);
        });
        console.log(`👥 Usuarios que han participado: ${usuariosUnicos.size}`);
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
    }
    
    console.groupEnd();
};
