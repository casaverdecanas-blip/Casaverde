// CONFIGURACIÓN DE FIREBASE (Tus credenciales reales)
const firebaseConfig = {
  apiKey: "AIzaSyCMo7yDsr4y_28o6JG2maHCY-tzRpOrmnk",
  authDomain: "casaverde-199.firebaseapp.com",
  projectId: "casaverde-199",
  storageBucket: "casaverde-199.firebasestorage.app",
  messagingSenderId: "134357658712",
  appId: "1:134357658712:web:70002137f8d7dcd7626e2d",
  measurementId: "G-8LNZ70GVDR",
  databaseURL: "https://casaverde-199-default-rtdb.firebaseio.com/" // URL estándar de Firebase
};

// Inicializar Firebase (Versión Compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let calendars = {};
let editMode = false;

document.addEventListener('DOMContentLoaded', function() {
    // Escuchar cambios en la nube (Base de Datos)
    db.ref('reservas').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        actualizarCalendarios(data);
    });
});

function actualizarCalendarios(data) {
    const ids = ['calendar-cabin-1', 'calendar-cabin-2'];
    ids.forEach(id => {
        const eventosNube = data[id] || [];
        if (!calendars[id]) {
            renderCal(id, eventosNube);
        } else {
            calendars[id].removeAllEvents();
            calendars[id].addEventSource(eventosNube);
        }
    });
}

function renderCal(id, events) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const cal = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: 'es',
        height: 'auto',
        events: events,
        dateClick: function(info) {
            if (editMode) {
                if (confirm(`¿Marcar ${info.dateStr} como OCUPADO?`)) {
                    guardarEnNube(id, info.dateStr);
                }
            }
        },
        eventClick: function(info) {
            if (editMode && confirm("¿Eliminar esta reserva?")) {
                eliminarDeNube(id, info.event.startStr);
            }
        }
    });
    cal.render();
    calendars[id] = cal;
}

// FUNCIONES DE NUBE
function guardarEnNube(id, fecha) {
    const ref = db.ref(`reservas/${id}`);
    ref.once('value').then((snapshot) => {
        let actual = snapshot.val() || [];
        actual.push({ title: 'Ocupado', start: fecha, color: '#ff4d4d' });
        ref.set(actual);
    });
}

function eliminarDeNube(id, fecha) {
    const ref = db.ref(`reservas/${id}`);
    ref.once('value').then((snapshot) => {
        let actual = snapshot.val() || [];
        const filtrado = actual.filter(e => e.start !== fecha);
        ref.set(filtrado);
    });
}

// PANEL ADMIN
function toggleAdmin() {
    const pass = prompt("Introduce la contraseña de administrador:");
    if (pass === "Casaverde-199") { // Contraseña basada en tu proyecto
        editMode = !editMode;
        alert(editMode ? "MODO EDICIÓN ACTIVADO. Haz clic en los días para marcar/desmarcar." : "MODO LECTURA ACTIVADO.");
    } else {
        alert("Contraseña incorrecta.");
    }
}

// NAVEGACIÓN ENTRE CABAÑAS
function showCabinDetails(cabinId) {
    document.getElementById('main-content-wrapper').style.display = 'none';
    document.getElementById('cabin-details-wrapper').style.display = 'block';
    document.querySelectorAll('.cabin-detail-section').forEach(s => s.style.display = 'none');
    document.getElementById('details-' + cabinId).style.display = 'block';
    
    setTimeout(() => {
        const calId = 'calendar-' + cabinId;
        if (calendars[calId]) calendars[calId].updateSize();
    }, 150);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideCabinDetails() {
    document.getElementById('cabin-details-wrapper').style.display = 'none';
    document.getElementById('main-content-wrapper').style.display = 'block';
}

function updateCalendarsLanguage(lang) {
    for (let id in calendars) {
        calendars[id].setOption('locale', lang);
    }
}

