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
    ['calendar-cabin-1', 'calendar-cabin-2'].forEach(id => {
        const eventosObjeto = data[id] || {};
        // Convertimos el objeto raro de Firebase en una lista limpia
        const eventosArray = Object.keys(eventosObjeto).map(key => ({
            id: key,
            title: eventosObjeto[key].title,
            start: eventosObjeto[key].start,
            end: eventosObjeto[key].end,
            color: eventosObjeto[key].color || '#ff4d4d',
            allDay: true
        }));

        if (!calendars[id]) {
            renderCal(id, eventosArray);
        } else {
            calendars[id].removeAllEvents();
            calendars[id].addEventSource(eventosArray);
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
            if (!editMode) return;
            const nombre = prompt("Nombre del huésped:");
            if (!nombre) return;
            const fechaFin = prompt("Fecha de salida (AAAA-MM-DD):", info.dateStr);
            if (fechaFin) {
                db.ref(`reservas/${id}`).push({
                    title: nombre,
                    start: info.dateStr,
                    end: fechaFin,
                    color: '#ff4d4d'
                });
            }
        },
        eventClick: function(info) {
            if (!editMode) return;
            const accion = prompt("Escribe 'D' para eliminar o 'E' para editar:");
            if (accion?.toUpperCase() === 'D') {
                db.ref(`reservas/${id}/${info.event.id}`).remove();
            } else if (accion?.toUpperCase() === 'E') {
                const n = prompt("Nuevo nombre:", info.event.title);
                const i = prompt("Nueva entrada:", info.event.startStr);
                const f = prompt("Nueva salida:", info.event.endStr || info.event.startStr);
                if (n && i && f) {
                    db.ref(`reservas/${id}/${info.event.id}`).update({ title: n, start: i, end: f });
                }
            }
        }
    });
    cal.render();
    calendars[id] = cal;
}

function toggleAdmin() {
    const pass = prompt("Contraseña:");
    if (pass === "Casaverde-199") {
        editMode = !editMode;
        alert(editMode ? "MODO EDITOR ACTIVADO" : "MODO LECTURA ACTIVADO");
    } else {
        alert("Incorrecta");
    }
}

function showCabinDetails(id) {
    document.getElementById('main-content-wrapper').style.display='none';
    document.getElementById('cabin-details-wrapper').style.display='block';
    document.querySelectorAll('.cabin-detail-section').forEach(s=>s.style.display='none');
    document.getElementById('details-'+id).style.display='block';
    setTimeout(() => { if(calendars['calendar-'+id]) calendars['calendar-'+id].updateSize(); }, 200);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideCabinDetails() {
    document.getElementById('cabin-details-wrapper').style.display='none';
    document.getElementById('main-content-wrapper').style.display='block';
}

function updateCalendarsLanguage(lang) {
    for (let id in calendars) { calendars[id].setOption('locale', lang); }
}

