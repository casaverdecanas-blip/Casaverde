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
const CABIN_ID = 'cabin-4'; // Identificador único para Cabaña 4
let selectedDate = null;

document.addEventListener('DOMContentLoaded', () => {
    changeLanguage(currentLang);
    db.ref().on('value', snap => {
        const data = snap.val() || {};
        renderGallery(data.fotos?.[CABIN_ID]);
        renderCalendar(data.reservas?.[CABIN_ID]);
    });
    if(editMode) document.getElementById('add-img-btn').classList.remove('hidden');
});

function renderGallery(fotos) {
    const gallery = document.getElementById('photo-gallery');
    gallery.innerHTML = '';
    if (!fotos) return;
    Object.keys(fotos).forEach(k => {
        const url = (typeof fotos[k] === 'string') ? fotos[k] : fotos[k].url;
        if(!url) return;
        const div = document.createElement('div');
        div.innerHTML = `<img src="${url}">` + (editMode ? `<button onclick="deletePhoto('${k}')" style="position:absolute;top:5px;right:5px;background:red;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;">X</button>` : '');
        gallery.appendChild(div);
    });
}

function addPhotoUrl() {
    const url = prompt("Pega la URL de la imagen para Cabaña 4:");
    if(url) db.ref(`fotos/${CABIN_ID}`).push(url);
}

function deletePhoto(key) { if(confirm("¿Eliminar foto de Cabaña 4?")) db.ref(`fotos/${CABIN_ID}/${key}`).remove(); }

function renderCalendar(reservas) {
    const events = reservas ? Object.keys(reservas).map(k => ({ id: k, title: reservas[k].title, start: reservas[k].start, end: reservas[k].end, color: '#e74c3c', allDay: true })) : [];
    const calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth',
        locale: currentLang,
        events: events,
        dateClick: (info) => {
            if (!editMode) return;
            selectedDate = info.dateStr;
            document.getElementById('modal-date-label').innerText = "Reserva desde: " + selectedDate;
            document.getElementById('checkout-date').value = selectedDate;
            document.getElementById('booking-modal').classList.remove('hidden');
        },
        eventClick: (info) => {
            if (!editMode) return;
            const op = prompt("Reserva: " + info.event.title + "\n(D) Eliminar o (E) Editar Nombre:").toUpperCase();
            if (op === 'D') db.ref(`reservas/${CABIN_ID}/${info.event.id}`).remove();
            if (op === 'E') {
                const n = prompt("Nuevo nombre:", info.event.title);
                if(n) db.ref(`reservas/${CABIN_ID}/${info.event.id}`).update({ title: n });
            }
        }
    });
    calendar.render();
}

function saveBooking() {
    const name = document.getElementById('guest-name').value;
    const end = document.getElementById('checkout-date').value;
    if (name && end) {
        db.ref(`reservas/${CABIN_ID}`).push({ title: name, start: selectedDate, end: end, allDay: true });
        closeModal('booking-modal');
        document.getElementById('guest-name').value = '';
    }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function openAdminModal() {
    const p = prompt("Clave de Cabaña 4:");
    if (p === "Casaverde-199") {
        editMode = !editMode;
        localStorage.setItem('admin', editMode);
        location.reload();
    }
}
