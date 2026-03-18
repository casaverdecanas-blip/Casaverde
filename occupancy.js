// Variable global para guardar los calendarios y poder cambiarles el idioma
let calendars = {};

document.addEventListener('DOMContentLoaded', function() {
    
    // Función interna para crear un calendario de FullCalendar
    function createCalendar(id, events) {
        var calendarEl = document.getElementById(id);
        if (calendarEl) {
            var calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                locale: 'es', // Idioma inicial
                height: 'auto',
                headerToolbar: {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                },
                events: events
            });
            calendar.render();
            // Guardamos la instancia
            calendars[id] = calendar;
            return calendar;
        }
    }

    // --- CABAÑA 1 ---
    createCalendar('calendar-cabin-1', [
        { title: 'Ocupado', start: '2026-03-20', end: '2026-03-25', color: '#ff4d4d' }
    ]);

    // --- CABAÑA 2 ---
    createCalendar('calendar-cabin-2', [
        { title: 'Mantenimiento', start: '2026-03-15', end: '2026-03-18', color: '#ffa500' },
        { title: 'Familia Cruz', start: '2026-04-01', end: '2026-04-05', color: '#ff4d4d' }
    ]);
});

/**
 * Función global para cambiar el idioma de los calendarios (llamada desde languages.js)
 */
function updateCalendarsLanguage(lang) {
    for (let id in calendars) {
        calendars[id].setOption('locale', lang);
    }
}

/**
 * Muestra los detalles de una cabaña específica
 */
function showCabinDetails(cabinId) {
    // 1. Ocultar el contenido principal (Sobre nosotros, lista de cabañas)
    document.getElementById('main-content-wrapper').style.display = 'none';
    
    // 2. Mostrar el contenedor de detalles
    document.getElementById('cabin-details-wrapper').style.display = 'block';
    
    // 3. Ocultar todas las secciones de detalles individuales por si acaso
    const detailSections = document.querySelectorAll('.cabin-detail-section');
    detailSections.forEach(section => section.style.display = 'none');
    
    // 4. Mostrar la sección específica solicitada
    const targetSection = document.getElementById('details-' + cabinId);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // 5. TRUCO IMPORTANTE: FullCalendar necesita recalculase si se muestra estando oculto
        if (calendars[cabinId.replace('cabin','calendar-cabin')]) {
             setTimeout(() => {
                 calendars[cabinId.replace('cabin','calendar-cabin')].updateSize();
             }, 100);
        }
    }
    
    // 6. Hacer scroll al inicio de la página automáticamente
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Vuelve a la vista de lista principal
 */
function hideCabinDetails() {
    // 1. Ocultar el contenedor de detalles y las secciones individuales
    document.getElementById('cabin-details-wrapper').style.display = 'none';
    const detailSections = document.querySelectorAll('.cabin-detail-section');
    detailSections.forEach(section => section.style.display = 'none');
    
    // 2. Mostrar el contenido principal
    document.getElementById('main-content-wrapper').style.display = 'block';
    
    // 3. Volver a la sección de cabañas
    location.hash = '#cabins';
}
