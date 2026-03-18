const firebaseConfig = {
  apiKey: "AIzaSyDYE7XIZ5ZhU6ky-A1sWGOeBmI67MOrj4g",
  authDomain: "casa-199.firebaseapp.com",
  databaseURL: "https://casa-199-default-rtdb.firebaseio.com",
  projectId: "casa-199",
  storageBucket: "casa-199.firebasestorage.app",
  messagingSenderId: "441572853741",
  appId: "1:441572853741:web:25e588b5161d7486e4c9e4",
  measurementId: "G-5LLT1XKF1W"
};

// Inicializar Firebase
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

let calendars = {};
let editMode = false;

document.addEventListener('DOMContentLoaded', function() {
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
        locale: document.documentElement.lang || 'es',
        height: 'auto',
        events: events,
        dateClick: function(info) {
            if (editMode && confirm(`¿Marcar ${info.dateStr} como OCUPADO?`)) {
                guardarEnNube(id, info.dateStr);
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

function guardarEnNube(id, fecha) {
    const ref = db.ref(`reservas/${id}`);
    ref.once('value').then((snapshot) => {
        let actual = snapshot.val() || [];
        if (!actual.some(e => e.start === fecha)) {
            actual.push({ title: 'Ocupado', start: fecha, color: '#ff4d4d' });
            ref.set(actual);
        }
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

function toggleAdmin() {
    const pass = prompt("Contraseña de Admin:");
    if (pass === "Casaverde-199") {
        editMode = !editMode;
        alert(editMode ? "MODO EDITOR ACTIVADO" : "MODO LECTURA ACTIVADO");
    } else { alert("Incorrecto"); }
}

function showCabinDetails(cabinId) {
    document.getElementById('main-content-wrapper').style.display = 'none';
    document.getElementById('cabin-details-wrapper').style.display = 'block';
    document.querySelectorAll('.cabin-detail-section').forEach(s => s.style.display = 'none');
    document.getElementById('details-' + cabinId).style.display = 'block';
    setTimeout(() => {
        if (calendars['calendar-' + cabinId]) calendars['calendar-' + cabinId].updateSize();
    }, 150);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideCabinDetails() {
    document.getElementById('cabin-details-wrapper').style.display = 'none';
    document.getElementById('main-content-wrapper').style.display = 'block';
}

function updateCalendarsLanguage(lang) {
    for (let id in calendars) { calendars[id].setOption('locale', lang); }
}

