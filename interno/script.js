// Credenciales válidas (en un caso real, esto debería estar en el servidor)
const VALID_CREDENTIALS = {
    username: 'admin',
    password: 'admin123'
};

// Estado de la aplicación
let currentUser = null;
let tasks = [];

// Cargar tareas del localStorage al iniciar
function loadTasks() {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
    }
    renderTasks();
}

// Guardar tareas en localStorage
function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Renderizar tareas según filtros
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    const searchTerm = document.getElementById('searchTask')?.value.toLowerCase() || '';
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

    let filteredTasks = tasks;

    // Filtrar por prioridad
    if (activeFilter !== 'all') {
        filteredTasks = filteredTasks.filter(task => task.priority === activeFilter);
    }

    // Filtrar por búsqueda
    if (searchTerm) {
        filteredTasks = filteredTasks.filter(task => 
            task.title.toLowerCase().includes(searchTerm) || 
            task.description.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredTasks.length === 0) {
        tasksList.innerHTML = '<div class="task-item" style="justify-content: center; color: #999;">No hay actividades pendientes</div>';
        return;
    }

    tasksList.innerHTML = filteredTasks.map(task => `
        <div class="task-item priority-${task.priority}" data-id="${task.id}">
            <div class="task-content">
                <h3>${escapeHtml(task.title)}</h3>
                ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
                <div class="task-meta">
                    <span><span class="material-icons">event</span> ${formatDate(task.date)}</span>
                    <span><span class="material-icons">flag</span> ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                </div>
            </div>
            <div class="task-actions">
                <button onclick="toggleTaskStatus('${task.id}')" class="complete-btn" title="Marcar como completada">
                    <span class="material-icons">check_circle</span>
                </button>
                <button onclick="deleteTask('${task.id}')" class="delete-btn" title="Eliminar">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formatear fecha
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
}

// Agregar nueva tarea
function addTask(event) {
    event.preventDefault();

    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const date = document.getElementById('taskDate').value;
    const priority = document.getElementById('taskPriority').value;

    if (!title || !date) return;

    const newTask = {
        id: Date.now().toString(),
        title,
        description,
        date,
        priority,
        createdAt: new Date().toISOString()
    };

    tasks.unshift(newTask);
    saveTasks();
    renderTasks();

    // Limpiar formulario
    event.target.reset();
}

// Eliminar tarea
function deleteTask(taskId) {
    if (confirm('¿Estás seguro de que quieres eliminar esta actividad?')) {
        tasks = tasks.filter(task => task.id !== taskId);
        saveTasks();
        renderTasks();
    }
}

// Marcar tarea como completada (eliminar)
function toggleTaskStatus(taskId) {
    if (confirm('¿Marcar esta actividad como completada?')) {
        tasks = tasks.filter(task => task.id !== taskId);
        saveTasks();
        renderTasks();
    }
}

// Login
function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('loginError');

    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
        currentUser = username;
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('privateArea').style.display = 'block';
        errorElement.textContent = '';
        loadTasks();
    } else {
        errorElement.textContent = 'Usuario o contraseña incorrectos';
    }
}

// Logout
function logout() {
    currentUser = null;
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('privateArea').style.display = 'none';
    document.getElementById('loginForm').reset();
}

// Inicializar eventos
document.addEventListener('DOMContentLoaded', function() {
    // Evento de login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Evento de logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Evento de agregar tarea
    document.getElementById('taskForm').addEventListener('submit', addTask);

    // Evento de búsqueda
    document.getElementById('searchTask').addEventListener('input', renderTasks);

    // Eventos de filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderTasks();
        });
    });

    // Establecer fecha mínima para el input date (hoy)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDate').min = today;
    document.getElementById('taskDate').value = today;
});

// Hacer funciones globales para los botones
window.deleteTask = deleteTask;
window.toggleTaskStatus = toggleTaskStatus;
