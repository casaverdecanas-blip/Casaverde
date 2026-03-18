const firebaseConfig = {
    apiKey: "AIzaSyDYE7XIZ5ZhU6ky-A1sWGOeBmI67MOrj4g",
    authDomain: "casa-199.firebaseapp.com",
    databaseURL: "https://casa-199-default-rtdb.firebaseio.com",
    projectId: "casa-199",
    storageBucket: "casa-199.firebasestorage.app",
    messagingSenderId: "441572853741",
    appId: "1:441572853741:web:25e588b5161d7486e4c9e4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentCabin = null;
let editMode = localStorage.getItem('admin') === 'true';

// Carga inicial
document.addEventListener('DOMContentLoaded', () => {
    db.ref().on('value', snap => {
        const data = snap.val() || {};
        // Actualizar miniaturas
        ['cabin-1', 'cabin-2'].forEach(id => {
            const slot = document.getElementById(`thumb-${id}`);
            const url = data.fotos?.[id] ? Object.values(data.fotos[id])[0] : '';
            if(url) slot.innerHTML = `<img src="${url}">`;
        });
        if (currentCabin) renderDetails(currentCabin, data);
    });
    changeLanguage(currentLang);
});

function showCabinDetails(id) {
    currentCabin = id;
    document.getElementById('grid-wrapper').classList.add('hidden');
    document.getElementById('detail-wrapper').classList.remove('hidden');
}

function renderDetails(id, data) {
    document.getElementById('detail-title').innerText = translations[currentLang][`${id}-name`] || id;
    
    // Render Fotos
    const carousel = document.getElementById('carousel-photos');
    carousel.innerHTML = '';
    const fotos = data.fotos?.[id] || {};
    Object.keys(fotos).forEach(k => {
        carousel.innerHTML += `<img src="${fotos[k]}">`;
    });

    // Admin button
    document.getElementById('add-photo-btn').className = editMode ? '' : 'hidden';

    // Render Calendario
    const calEl = document.getElementById('calendar-render');
    calEl.innerHTML = '';
    const calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: currentLang,
        events: data.reservas?.[id] ? Object.values(data.reservas[id]) : [],
        dateClick: (info) => {
            if (!editMode) return;
            const guest = prompt("Nombre:");
            if (guest) db.ref(`reservas/${id}`).push({ title: guest, start: info.dateStr, allDay: true, color: 'red' });
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
    if (prompt("Clave:") === "Casaverde-199") {
        editMode = !editMode;
        localStorage.setItem('admin', editMode);
        location.reload();
    }
}
