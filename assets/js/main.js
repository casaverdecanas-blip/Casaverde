// main.js - Funcionalidad principal del sitio

// Variables globales
let editMode = false;
let currentCabin = null;

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando sitio...');
    
    // Aplicar idioma guardado
    changeLanguage(localStorage.getItem('lang') || 'es');
    
    // Verificar modo admin
    checkAdminMode();
    
    // Cargar componentes según la página
    if (document.getElementById('cabins-container')) {
        await loadCabins();
    }
    
    if (document.getElementById('calendar')) {
        const cabinId = document.body.dataset.cabin;
        if (cabinId) {
            currentCabin = cabinId;
            await loadCabinPage(cabinId);
        }
    }
    
    // Inicializar botones de WhatsApp
    initWhatsAppButtons();
    
    console.log('✅ Sitio inicializado');
});

// Verificar modo admin
function checkAdminMode() {
    const adminStatus = localStorage.getItem('admin');
    if (adminStatus === 'true') {
        editMode = true;
        document.body.classList.add('admin-mode');
        console.log('👑 Modo administrador activado');
    }
}

// Cargar cabañas en el index
async function loadCabins() {
    const container = document.getElementById('cabins-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando cabañas...</div>';
    
    try {
        // Escuchar cambios en fotos
        FirebaseDB.getFotos().on('value', async (snapshot) => {
            const fotos = snapshot.val() || {};
            container.innerHTML = '';
            
            // Cargar cada cabaña
            for (let i = 1; i <= 4; i++) {
                const cabinId = `cabin-${i}`;
                const cabinInfo = t(`cabins.${cabinId}`);
                
                // Obtener foto principal
                const cabinFotos = fotos[cabinId] || {};
                const primeraFoto = Object.values(cabinFotos)[0] || '/assets/images/default/cabin.jpg';
                
                // Verificar disponibilidad
                const disponible = await checkAvailability(cabinId);
                
                // Crear tarjeta
                const card = createCabinCard(cabinId, cabinInfo, primeraFoto, disponible);
                container.appendChild(card);
            }
        });
    } catch (error) {
        console.error('Error cargando cabañas:', error);
        container.innerHTML = '<div class="error">Error al cargar las cabañas</div>';
    }
}

// Crear tarjeta de cabaña
function createCabinCard(cabinId, info, foto, disponible) {
    const card = document.createElement('a');
    card.href = `/cabanas/cabana-${cabinId.split('-')[1]}.html`;
    card.className = 'cabin-card';
    
    const statusClass = disponible ? 'available' : 'booked';
    const statusText = disponible ? t('calendar.available') : t('calendar.booked');
    
    card.innerHTML = `
        <div class="cabin-card-image">
            <img src="${foto}" alt="${info.name}" loading="lazy">
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="cabin-card-content">
            <h3>${info.name}</h3>
            <p>${info.shortDesc}</p>
            <div class="capacity">👥 ${info.capacity}</div>
            <div class="price">${info.price || 'Consultar'}</div>
            <span class="btn btn-small">${t('viewDetails')}</span>
        </div>
    `;
    
    return card;
}

// Verificar disponibilidad de una cabaña
async function checkAvailability(cabinId) {
    try {
        const snapshot = await FirebaseDB.getReservasCabin(cabinId).once('value');
        const reservas = snapshot.val() || {};
        
        const today = new Date().toISOString().split('T')[0];
        
        for (let key in reservas) {
            const reserva = reservas[key];
            if (reserva.start <= today && reserva.end >= today) {
                return false; // Ocupada hoy
            }
        }
        return true; // Disponible
    } catch (error) {
        console.error('Error verificando disponibilidad:', error);
        return true; // Por defecto asumimos disponible
    }
}

// Cargar página de cabaña individual
async function loadCabinPage(cabinId) {
    console.log(`Cargando cabaña: ${cabinId}`);
    
    // Actualizar título
    document.title = `${t(`cabins.${cabinId}.name`)} - CasaVerdeCanas`;
    
    // Cargar información básica
    document.getElementById('cabin-title').textContent = t(`cabins.${cabinId}.name`);
    document.getElementById('cabin-description').textContent = t(`cabins.${cabinId}.longDesc`);
    
    // Cargar características
    const featuresList = document.getElementById('features-list');
    if (featuresList) {
        const features = t(`cabins.${cabinId}.features`);
        if (Array.isArray(features)) {
            featuresList.innerHTML = features.map(f => `<li>${f}</li>`).join('');
        }
    }
    
    // Cargar fotos
    await loadCabinPhotos(cabinId);
    
    // Inicializar calendario
    await initCalendar(cabinId);
    
    // Configurar botón de WhatsApp
    setupWhatsAppButton(cabinId);
}

// Cargar fotos de la cabaña
async function loadCabinPhotos(cabinId) {
    const mainPhoto = document.getElementById('main-photo');
    const thumbnails = document.getElementById('thumbnails');
    
    if (!mainPhoto || !thumbnails) return;
    
    try {
        FirebaseDB.getFotosCabin(cabinId).on('value', (snapshot) => {
            const fotos = snapshot.val() || {};
            const fotosArray = Object.values(fotos);
            
            if (fotosArray.length === 0) {
                // Foto por defecto
                mainPhoto.innerHTML = '<img src="/assets/images/default/cabin.jpg" alt="Cabaña">';
                return;
            }
            
            // Mostrar primera foto
            mainPhoto.innerHTML = `<img src="${fotosArray[0]}" alt="Cabaña">`;
            
            // Mostrar thumbnails
            thumbnails.innerHTML = fotosArray.map((foto, index) => `
                <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="changeMainPhoto('${foto}', this)">
                    <img src="${foto}" alt="Thumbnail ${index + 1}">
                </div>
            `).join('');
        });
    } catch (error) {
        console.error('Error cargando fotos:', error);
    }
}

// Cambiar foto principal (global para usar desde HTML)
window.changeMainPhoto = function(fotoUrl, element) {
    const mainPhoto = document.getElementById('main-photo');
    if (mainPhoto) {
        mainPhoto.innerHTML = `<img src="${fotoUrl}" alt="Cabaña">`;
    }
    
    // Actualizar active class
    document.querySelectorAll('.thumbnail').forEach(el => {
        el.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }
};

// Inicializar calendario
async function initCalendar(cabinId) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    // Cargar FullCalendar si no está cargado
    if (typeof FullCalendar === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js');
    }
    
    FirebaseDB.getReservasCabin(cabinId).on('value', (snapshot) => {
        const reservas = snapshot.val() || {};
        
        const events = Object.keys(reservas).map(key => ({
            id: key,
            title: reservas[key].guest || 'Reservado',
            start: reservas[key].start,
            end: reservas[key].end,
            color: '#e74c3c',
            allDay: true,
            extendedProps: {
                guest: reservas[key].guest
            }
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
            },
            buttonText: {
                today: currentLang === 'es' ? 'Hoy' : (currentLang === 'pt' ? 'Hoje' : 'Today'),
                month: currentLang === 'es' ? 'Mes' : (currentLang === 'pt' ? 'Mês' : 'Month'),
                week: currentLang === 'es' ? 'Semana' : (currentLang === 'pt' ? 'Semana' : 'Week')
            },
            dateClick: (info) => {
                if (editMode) {
                    showBookingModal(info.dateStr);
                }
            },
            eventClick: (info) => {
                if (editMode) {
                    if (confirm(`¿Eliminar reserva de ${info.event.extendedProps.guest}?`)) {
                        FirebaseDB.eliminarReserva(cabinId, info.event.id);
                    }
                }
            }
        });
        
        calendar.render();
    });
}

// Cargar script dinámicamente
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Configurar botón de WhatsApp
function setupWhatsAppButton(cabinId) {
    const waButton = document.getElementById('whatsapp-book');
    if (!waButton) return;
    
    waButton.addEventListener('click', (e) => {
        e.preventDefault();
        bookViaWhatsApp(cabinId);
    });
}

// Reservar por WhatsApp
function bookViaWhatsApp(cabinId, checkIn = '', checkOut = '') {
    const cabinName = t(`cabins.${cabinId}.name`);
    let message = `Hola! Quiero reservar ${cabinName}`;
    
    if (checkIn && checkOut) {
        message += ` desde el ${checkIn} hasta el ${checkOut}`;
    }
    
    const phone = '5548999999999'; // Tu número de WhatsApp
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// Inicializar botones de WhatsApp
function initWhatsAppButtons() {
    document.querySelectorAll('.whatsapp-book-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cabinId = btn.dataset.cabin;
            if (cabinId) {
                bookViaWhatsApp(cabinId);
            }
        });
    });
}

// Mostrar modal de reserva (admin)
function showBookingModal(dateStr) {
    const modal = document.getElementById('booking-modal');
    if (!modal) return;
    
    document.getElementById('booking-date').textContent = dateStr;
    document.getElementById('checkin-date').value = dateStr;
    document.getElementById('checkout-date').value = dateStr;
    
    modal.classList.remove('hidden');
}

// Cerrar modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Guardar reserva (admin)
function saveBooking() {
    if (!currentCabin) return;
    
    const guestName = document.getElementById('guest-name').value;
    const checkin = document.getElementById('checkin-date').value;
    const checkout = document.getElementById('checkout-date').value;
    
    if (!guestName || !checkin || !checkout) {
        alert('Completa todos los campos');
        return;
    }
    
    if (checkin > checkout) {
        alert('La fecha de salida debe ser posterior a la entrada');
        return;
    }
    
    const reservaData = {
        start: checkin,
        end: checkout,
        guest: guestName,
        title: guestName,
        timestamp: Date.now()
    };
    
    FirebaseDB.crearReserva(currentCabin, reservaData)
        .then(() => {
            closeModal('booking-modal');
            document.getElementById('guest-name').value = '';
        })
        .catch(error => {
            console.error('Error guardando reserva:', error);
            alert('Error al guardar la reserva');
        });
}

// Toggle admin
function toggleAdmin() {
    const password = prompt('Ingresa la contraseña de administrador:');
    
    // En un sitio real, esto debería validarse contra Firebase Auth
    if (password === 'Casaverde-199') {
        editMode = !editMode;
        localStorage.setItem('admin', editMode);
        
        if (editMode) {
            document.body.classList.add('admin-mode');
            alert('✅ Modo administrador activado');
        } else {
            document.body.classList.remove('admin-mode');
            alert('👋 Modo administrador desactivado');
        }
        
        // Recargar para aplicar cambios
        location.reload();
    } else if (password !== null) {
        alert('❌ Contraseña incorrecta');
    }
}

// Exponer funciones globales
window.changeLanguage = changeLanguage;
window.toggleAdmin = toggleAdmin;
window.closeModal = closeModal;
window.saveBooking = saveBooking;
