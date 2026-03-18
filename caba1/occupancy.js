const firebaseConfig = {
    apiKey: "AIzaSyDYE7XIZ5ZhU6ky-A1sWGOeBmI67MOrj4g",
    authDomain: "casa-199.firebaseapp.com",
    databaseURL: "https://casa-199-default-rtdb.firebaseio.com",
    projectId: "casa-199",
    storageBucket: "casa-199.firebasestorage.app",
    messagingSenderId: "441572853741",
    appId: "1:441572853741:web:25e588b5161d7486e4c9e4"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let editMode = localStorage.getItem('admin') === 'true';
const CABIN_ID = 'cabin-1'; // Cambiar a cabin-2 en la otra carpeta

document.addEventListener('DOMContentLoaded', () => {
    changeLanguage(currentLang);
    // Escuchar cambios en tiempo real
    db.ref().on('value', snap => {
        const data = snap.val() || {};
        renderGallery(data.fotos?.[CABIN_ID]);
        renderCalendar(data.reservas?.[CABIN_ID]);
    });
});

// --- GESTIÓN DE FOTOS ---
function renderGallery(fotos) {
    const gallery = document.getElementById('photo-gallery');
    gallery.innerHTML = '';
    if (!fotos) return;

    Object.keys(fotos).forEach(key => {
        const container = document.createElement('div');
        container.className = 'img-container';
        container.style.position = 'relative';
        container.innerHTML = `
            <img src="${fotos[key]}" style="height:200px; border-radius:10px;">
            ${editMode ? `<button onclick="deletePhoto('${key}')" style="position:absolute; top:5px; right:5px; background:red; color:white; border:none; border-radius:50%; cursor:pointer; width:25px; height:25px;">X</button>` : ''}
        `;
        gallery.appendChild(container);
    });
}

function deletePhoto(key) {
    if (confirm("¿Eliminar esta foto permanentemente?")) {
        db.ref(`fotos/${CABIN_ID}/${key}`).remove();
    }
}

// --- GESTIÓN DE CALENDARIO ---
function renderCalendar(reservas) {
    const calEl = document.getElementById('calendar');
    calEl.innerHTML = '';

    const events = reservas ? Object.keys(reservas).map(k => ({
        id: k,
        title: reservas[k].title,
        start: reservas[k].start,
        end: reservas[k].end, // FullCalendar usa 'end' para marcar rangos
        color: '#e74c3c',
        allDay: true
    })) : [];

    const calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: currentLang,
        events: events,
        height: 'auto',
        dateClick: (info) => {
            if (!editMode) return;
            
            const guest = prompt("Nombre del Huésped (Check-in: " + info.dateStr + "):");
            if (!guest) return;

            const checkOut = prompt("Fecha de Check-out (AAAA-MM-DD):", info.dateStr);
            if (checkOut) {
                // FullCalendar 'end' es exclusivo (no incluye el día final en el color), 
                // por eso a veces hay que sumar un día o avisar al usuario.
                db.ref(`reservas/${CABIN_ID}`).push({
                    title: guest,
                    start: info.dateStr,
                    end: checkOut, 
                    allDay: true
                });
            }
        },
        eventClick: (info) => {
            if (!editMode) return;

            const accion = prompt("Reserva: " + info.event.title + "\nEscriba 'E' para Editar nombre o 'D' para Borrar:").toUpperCase();
            
            if (accion === 'D') {
                if (confirm("¿Eliminar reserva?")) db.ref(`reservas/${CABIN_ID}/${info.event.id}`).remove();
            } else if (accion === 'E') {
                const nuevoNombre = prompt("Nuevo nombre del huésped:", info.event.title);
                if (nuevoNombre) db.ref(`reservas/${CABIN_ID}/${info.event.id}`).update({ title: nuevoNombre });
            }
        }
    });

    calendar.render();
}
