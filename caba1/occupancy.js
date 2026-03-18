const firebaseConfig = {
    apiKey: "AIzaSyDYE7XIZ5ZhU6ky-A1sWGOeBmI67MOrj4g",
    authDomain: "casa-199.firebaseapp.com",
    databaseURL: "https://casa-199-default-rtdb.firebaseio.com",
    projectId: "casa-199",
    storageBucket: "casa-199.firebasestorage.app",
    messagingSenderId: "441572853741",
    appId: "1:441572853741:web:25e588b5161d7486e4c9e4"
};

// Inicializar Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let editMode = localStorage.getItem('admin') === 'true';
window.currentCalendar = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Aplicar idioma inicial
    changeLanguage(currentLang);

    // 2. Escuchar datos de Firebase (Fotos y Reservas)
    db.ref().on('value', snap => {
        const data = snap.val() || {};
        renderCabin1(data);
    });

    // 3. Mostrar botón admin si está activo
    if (editMode) document.getElementById('add-img').classList.remove('hidden');
});

function renderCabin1(data) {
    const id = 'cabin-1';
    
    // Render de Fotos
    const gallery = document.getElementById('photo-gallery');
    gallery.innerHTML = '';
    const fotos = data.fotos?.[id] || {};
    Object.keys(fotos).forEach(k => {
        gallery.innerHTML += `<img src="${fotos[k]}" alt="Foto Cabaña">`;
    });

    // Render de Calendario
    const calEl = document.getElementById('calendar');
    calEl.innerHTML = ''; // Limpiar antes de re-dibujar
    
    const calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: currentLang,
        events: data.reservas?.[id] ? Object.values(data.reservas[id]) : [],
        height: 'auto',
        dateClick: (info) => {
            if (!editMode) return;
            const guest = prompt("Registrar Huésped (Bloquear fecha):");
            if (guest) {
                db.ref(`reservas/${id}`).push({ 
                    title: guest, 
                    start: info.dateStr, 
                    color: '#e74c3c', 
                    allDay: true 
                });
            }
        },
        eventClick: (info) => {
            if (editMode && confirm("¿Eliminar reserva de " + info.event.title + "?")) {
                db.ref(`reservas/${id}/${info.event.id}`).remove();
            }
        }
    });

    calendar.render();
    window.currentCalendar = calendar; // Guardar referencia global
}

function addPhoto() {
    const url = prompt("Pega el enlace directo de la imagen (.jpg o .png):");
    if (url) db.ref(`fotos/cabin-1`).push(url);
}

function toggleAdmin() {
    const pass = prompt("Clave de Administrador:");
    if (pass === "Casaverde-199") {
        editMode = !editMode;
        localStorage.setItem('admin', editMode);
        location.reload();
    } else if (pass !== null) {
        alert("Clave incorrecta");
    }
}
