// Variable global para poder acceder a los calendarios desde el selector de idiomas
let calendars = {};

document.addEventListener('DOMContentLoaded', function() {
    
    // Función para inicializar un calendario
    function initCalendar(id, eventsData) {
        const calendarEl = document.getElementById(id);
        if (calendarEl) {
            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                locale: 'es', // Idioma inicial
                height: 'auto',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: '' 
                },
                events: eventsData
            });
            calendar.render();
            
            // Guardamos la instancia en nuestro objeto global
            calendars[id] = calendar;

            // Truco para evitar que el segundo salga en blanco
            setTimeout(() => { calendar.updateSize(); }, 200);
        }
    }

    // --- CABAÑA 1 ---
    initCalendar('calendar-cabin-1', [
        { title: 'Ocupado', start: '2026-03-20', end: '2026-03-25', color: '#ff4d4d' },
        { title: 'Reserva Familia', start: '2026-04-01', end: '2026-04-05', color: '#ff4d4d' }
    ]);

    // --- CABAÑA 2 ---
    initCalendar('calendar-cabin-2', [
        { title: 'Mantenimiento', start: '2026-03-15', end: '2026-03-17', color: '#ffa500' },
        { title: 'Reservado', start: '2026-03-22', end: '2026-03-28', color: '#ff4d4d' }
    ]);
});

/**
 * Esta función la llamaremos desde languages.js para actualizar los calendarios
 */
function updateCalendarsLanguage(lang) {
    for (let id in calendars) {
        calendars[id].setOption('locale', lang);
    }
}

