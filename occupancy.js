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
        // Configuración para que los eventos no ocupen todo el día y se vean mejor
        displayEventTime: false, 
        eventOrder: "start",
        
        // CUANDO HACES CLIC EN UN DÍA VACÍO (CREAR)
        dateClick: function(info) {
            if (!editMode) return;
            
            const nombre = prompt("Nombre del huésped:");
            if (!nombre) return;
            
            const fechaFin = prompt("Fecha de salida (AAAA-MM-DD):", info.dateStr);
            if (!fechaFin) return;

            guardarReserva(id, nombre, info.dateStr, fechaFin);
        },

        // CUANDO HACES CLIC EN UNA RESERVA EXISTENTE (EDITAR/ELIMINAR)
        eventClick: function(info) {
            if (!editMode) return;

            const accion = prompt("Escribe 'E' para editar, 'D' para eliminar o cancela para salir:");
            
            if (accion?.toUpperCase() === 'D') {
                if (confirm("¿Eliminar reserva de " + info.event.title + "?")) {
                    eliminarReserva(id, info.event.id);
                }
            } else if (accion?.toUpperCase() === 'E') {
                const nuevoNombre = prompt("Nuevo nombre:", info.event.title);
                const nuevoInicio = prompt("Nueva fecha entrada (AAAA-MM-DD):", info.event.startStr);
                const nuevoFin = prompt("Nueva fecha salida (AAAA-MM-DD):", info.event.endStr || info.event.startStr);
                
                if (nuevoNombre && nuevoInicio && nuevoFin) {
                    eliminarReserva(id, info.event.id); // Borramos la vieja
                    guardarReserva(id, nuevoNombre, nuevoInicio, nuevoFin); // Guardamos la nueva
                }
            }
        }
    });
    cal.render();
    calendars[id] = cal;
}

// FUNCIONES DE NUBE MEJORADAS
function guardarReserva(id, nombre, inicio, fin) {
    const ref = db.ref(`reservas/${id}`);
    const nuevaReservaRef = ref.push(); // Genera un ID único para la reserva
    
    nuevaReservaRef.set({
        id: nuevaReservaRef.key,
        title: nombre,
        start: inicio,
        end: fin, // FullCalendar trata el 'end' como exclusivo (no lo pinta), ideal para check-out
        color: '#ff4d4d',
        allDay: true
    });
}

function eliminarReserva(id, reservaId) {
    // Buscamos en el array y eliminamos por ID único
    const ref = db.ref(`reservas/${id}`);
    ref.once('value').then((snapshot) => {
        let actual = snapshot.val() || [];
        // Si es un objeto de objetos (push), lo manejamos así:
        db.ref(`reservas/${id}/${reservaId}`).remove();
    });
}

function toggleAdmin() {
    const pass = prompt("Contraseña de Admin:");
    if (pass === "Casaverde-199") {
        editMode = !editMode;
        alert(editMode ? "MODO GESTIÓN ACTIVADO\n- Clic en día vacío para Nueva Reserva\n- Clic en reserva para Editar/Borrar" : "MODO LECTURA ACTIVADO");
    } else { alert("Incorrecto"); }
}

// ... Mantener showCabinDetails, hideCabinDetails y updateCalendarsLanguage igual ...
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

