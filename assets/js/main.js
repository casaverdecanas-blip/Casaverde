// assets/js/main.js

// Cargar cabañas dinámicamente
function loadCabins() {
    const container = document.getElementById('cabins-container');
    
    // Escuchar cambios en Firebase
    DB.cabins.on('value', (snapshot) => {
        const cabinsData = snapshot.val() || {};
        container.innerHTML = '';
        
        // Para cada cabaña (1-4)
        for (let i = 1; i <= 4; i++) {
            const cabinId = `cabin-${i}`;
            const cabinInfo = t(`cabins.${cabinId}`);
            
            // Obtener foto principal
            DB.getPhotos(cabinId).once('value', (photoSnap) => {
                const photos = photoSnap.val() || {};
                const mainPhoto = Object.values(photos)[0] || '/assets/images/default/cabin.jpg';
                
                // Obtener disponibilidad (para badge)
                DB.getBookings(cabinId).once('value', (bookingSnap) => {
                    const bookings = bookingSnap.val() || {};
                    const isAvailable = checkAvailability(bookings);
                    
                    const card = createCabinCard(cabinId, cabinInfo, mainPhoto, isAvailable);
                    container.appendChild(card);
                });
            });
        }
    });
}

// Crear tarjeta de cabaña
function createCabinCard(cabinId, info, photo, available) {
    const card = document.createElement('a');
    card.href = `/cabanas/cabana-${cabinId.split('-')[1]}.html`;
    card.className = 'cabin-card';
    
    const statusClass = available ? 'available' : 'booked';
    const statusText = available ? 'Disponible' : 'Consultar';
    
    card.innerHTML = `
        <div class="cabin-card-img">
            <img src="${photo}" alt="${info.name}" loading="lazy">
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="cabin-card-content">
            <h3>${info.name}</h3>
            <p>${info.shortDesc}</p>
            <p class="capacity">👥 ${info.capacity}</p>
            <span class="btn">${t('viewDetails')}</span>
        </div>
    `;
    
    return card;
}

// Verificar disponibilidad general
function checkAvailability(bookings) {
    const today = new Date().toISOString().split('T')[0];
    
    for (let key in bookings) {
        const booking = bookings[key];
        if (booking.start <= today && booking.end >= today) {
            return false; // Ocupado hoy
        }
    }
    return true; // Disponible
}

// Página de cabaña individual (template)
function loadCabinPage(cabinId) {
    // Cargar info de la cabaña
    document.title = `${t(`cabins.${cabinId}.name`)} - CasaVerdeCanas`;
    
    // Cargar fotos
    DB.getPhotos(cabinId).on('value', (snap) => {
        const photos = snap.val() || {};
        renderGallery(photos);
    });
    
    // Cargar precios
    DB.getPrices(cabinId).on('value', (snap) => {
        const prices = snap.val() || {};
        renderPrices(prices);
    });
    
    // Inicializar calendario
    initCalendar(cabinId);
}

// Inicializar calendario con FullCalendar
function initCalendar(cabinId) {
    const calendarEl = document.getElementById('calendar');
    
    DB.getBookings(cabinId).on('value', (snap) => {
        const bookings = snap.val() || {};
        const events = Object.keys(bookings).map(key => ({
            id: key,
            title: bookings[key].guest,
            start: bookings[key].start,
            end: bookings[key].end,
            color: '#ff4d4d',
            allDay: true
        }));
        
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: currentLang,
            events: events,
            height: 'auto',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek'
            }
        });
        
        calendar.render();
    });
}

// WhatsApp con mensaje pre-hecho
function bookViaWhatsApp(cabinId, checkIn, checkOut) {
    const cabinName = t(`cabins.${cabinId}.name`);
    const message = `Hola! Quiero reservar ${cabinName} desde ${checkIn} hasta ${checkOut}`;
    const url = `https://wa.me/5548999999999?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    changeLanguage(currentLang);
    
    // Si estamos en index, cargar cabañas
    if (document.getElementById('cabins-container')) {
        loadCabins();
    }
    
    // Si estamos en página de cabaña
    if (document.getElementById('calendar')) {
        const cabinId = document.body.dataset.cabin;
        if (cabinId) loadCabinPage(cabinId);
    }
});
