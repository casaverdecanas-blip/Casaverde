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

let currentCabin = null;
let editMode = localStorage.getItem('adminEnabled') === 'true';

// Inicio
document.addEventListener('DOMContentLoaded', () => {
    db.ref().on('value', snapshot => {
        const data = snapshot.val() || {};
        updateThumbs(data.fotos);
        if (currentCabin) refreshUI(currentCabin, data);
    });
    changeLanguage(currentLang);
});

function updateThumbs(fotos) {
    ['cabin-1', 'cabin-2'].forEach(id => {
        const el = document.getElementById(`thumb-${id}`);
        if (!el) return;
        const url = (fotos && fotos[id]) ? Object.values(fotos[id])[0] : 'https://via.placeholder.com/400x250';
        el.innerHTML = `<img src="${url}" alt="Cabaña">`;
    });
}

function showCabinDetails(id) {
    currentCabin = id;
    document.getElementById('grid-wrapper').classList.add('hidden');
    document.getElementById('detail-wrapper').classList.remove('hidden');
    db.ref().once('value', s => refreshUI(id, s.val() || {}));
}

function refreshUI(id, data) {
    document.getElementById('detail-title').innerText = translations[currentLang][`${id}-name`];
    document.getElementById('detail-desc').innerText = translations[currentLang][`${id}-desc`];
    document.getElementById('wa-booking').href = `https://wa.me/5548999999999?text=Hola, consulto por ${id}`;
    
    // Fotos
    const carousel = document.getElementById('carousel-photos');
    carousel.innerHTML = '';
    const fotos = data.fotos ? data.fotos[id] : null;
    if (fotos) {
        Object.keys(fotos).forEach(key => {
            const div = document.createElement('div');
            div.className = 'img-item';
            div.innerHTML = `<img src="${fotos[key]}">` + 
                (editMode ? `<button class="del-photo" onclick="deletePhoto('${id}','${key}')">×</button>` : '');
            carousel.appendChild(div);
        });
    }

    // Botones Admin
    const addBtn = document.getElementById('add-photo-btn');
    if (editMode) addBtn.classList.remove('hidden');
    else addBtn.classList.add('hidden');
    
    addBtn.onclick = () => {
        const url = prompt("Pega la URL de la imagen:");
        if (url) db.ref(`fotos/${id}`).push(url);
    };

    renderCalendar(id, data.reservas ? data.reservas[id] : null);
}

function renderCalendar(cabinId, eventsObj) {
    const events = eventsObj ? Object.keys(eventsObj).map(k => ({ id: k, ...eventsObj[k] })) : [];
    const calEl = document.getElementById('calendar-render');
    calEl.innerHTML = '';
    
    const calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: currentLang,
        events: events,
        dateClick: (info) => {
            if (!editMode) return;
            const guest = prompt("Nombre del huésped:");
            if (guest) {
                db.ref(`reservas/${cabinId}`).push({ 
                    title: guest, start: info.dateStr, color: '#ff4d4d', allDay: true 
                });
            }
        },
        eventClick: (info) => {
            if (editMode && confirm("¿Eliminar reserva?")) {
                db.ref(`reservas/${cabinId}/${info.event.id}`).remove();
            }
        }
    });
    calendar.render();
}

function hideCabinDetails() {
    currentCabin = null;
    document.getElementById('detail-wrapper').classList.add('hidden');
    document.getElementById('grid-wrapper').classList.remove('hidden');
}

function toggleAdmin() {
    const pass = prompt("Clave de Gestión:");
    if (pass === "Casaverde-199") {
        editMode = !editMode;
        localStorage.setItem('adminEnabled', editMode);
        alert(editMode ? "Modo Administrador Activo" : "Modo Lectura");
        location.reload();
    }
}

function deletePhoto(cabinId, key) {
    if (confirm("¿Eliminar foto?")) db.ref(`fotos/${cabinId}/${key}`).remove();
}
