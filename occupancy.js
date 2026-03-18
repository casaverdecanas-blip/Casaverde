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

let calendars = {};
let editMode = false;
let currentCabin = null;

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar cambios globales (Reservas y Fotos)
    db.ref().on('value', (snapshot) => {
        const data = snapshot.val() || {};
        renderThumbs(data.fotos);
        if (currentCabin) {
            actualizarDetalles(currentCabin, data);
        }
    });
});

// --- GESTIÓN DE FOTOS ---
function renderThumbs(fotos) {
    ['cabin-1', 'cabin-2'].forEach(id => {
        const container = document.getElementById(`thumb-${id}`);
        if (!container) return;
        const primeraFoto = fotos && fotos[id] ? Object.values(fotos[id])[0] : 'https://via.placeholder.com/400x250?text=Sin+Foto';
        container.innerHTML = `<img src="${primeraFoto}" style="width:100%; height:200px; object-fit:cover;">`;
    });
}

function renderCarousel(cabinId, fotosObj) {
    const container = document.getElementById('carousel-photos');
    container.innerHTML = '';
    if (!fotosObj) return;

    Object.keys(fotosObj).forEach(key => {
        const div = document.createElement('div');
        div.className = 'img-item';
        div.innerHTML = `
            <img src="${fotosObj[key]}">
            ${editMode ? `<button class="del-photo" onclick="eliminarFoto('${cabinId}','${key}')">X</button>` : ''}
        `;
        container.appendChild(div);
    });
}

function eliminarFoto(cabinId, key) {
    if (confirm("¿Eliminar foto?")) db.ref(`fotos/${cabinId}/${key}`).remove();
}

// --- GESTIÓN DE CALENDARIO ---
function renderCal(cabinId, eventosObj) {
    const events = eventosObj ? Object.keys(eventosObj).map(k => ({ id: k, ...eventosObj[k] })) : [];
    const el = document.getElementById('calendar-render');
    el.innerHTML = ''; // Reset

    const cal = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: document.documentElement.lang || 'es',
        events: events,
        dateClick: (info) => {
            if (!editMode) return;
            const nom = prompt("Nombre del huésped:");
            const fin = prompt("Salida (AAAA-MM-DD):", info.dateStr);
            if (nom && fin) {
                db.ref(`reservas/${cabinId}`).push({ title: nom, start: info.dateStr, end: fin, color: '#ff4d4d', allDay: true });
            }
        },
        eventClick: (info) => {
            if (!editMode) return;
            const acc = prompt("¿(D) Eliminar o (E) Editar?");
            if (acc?.toUpperCase() === 'D') db.ref(`reservas/${cabinId}/${info.event.id}`).remove();
        }
    });
    cal.render();
}

// --- NAVEGACIÓN ---
function showCabinDetails(id) {
    currentCabin = id;
    document.getElementById('main-content-wrapper').style.display = 'none';
    document.getElementById('cabin-details-wrapper').style.display = 'block';
    
    db.ref().once('value', snapshot => {
        const data = snapshot.val() || {};
        actualizarDetalles(id, data);
    });
}

function actualizarDetalles(id, data) {
    document.getElementById('detail-title').innerText = translations[currentLang][`${id}-name`];
    document.getElementById('detail-desc').innerText = translations[currentLang][`${id}-desc`];
    
    // Fotos
    renderCarousel(id, data.fotos ? data.fotos[id] : null);
    
    // Botón agregar foto
    const addBtn = document.getElementById('add-photo-btn');
    addBtn.style.display = editMode ? 'block' : 'none';
    addBtn.onclick = () => {
        const url = prompt("Pega la URL de la imagen:");
        if (url) db.ref(`fotos/${id}`).push(url);
    };

    // Calendario
    renderCal(id, data.reservas ? data.reservas[id] : null);
}

function hideCabinDetails() {
    currentCabin = null;
    document.getElementById('cabin-details-wrapper').style.display = 'none';
    document.getElementById('main-content-wrapper').style.display = 'block';
}

function toggleAdmin() {
    const p = prompt("Clave:");
    if (p === "Casaverde-199") {
        editMode = !editMode;
        alert(editMode ? "MODO GESTIÓN ON" : "MODO LECTURA");
        location.reload();
    }
}

}

