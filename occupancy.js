document.addEventListener('DOMContentLoaded', function() {
    // Configuración para la Cabaña 1
    var calendarEl1 = document.getElementById('calendar-cabin-1');
    var calendar1 = new FullCalendar.Calendar(calendarEl1, {
        initialView: 'dayGridMonth',
        locale: 'es', // Esto lo podemos cambiar dinámicamente luego
        events: [
            {
                title: 'Ocupado',
                start: '2026-03-20',
                end: '2026-03-25',
                color: '#ff4d4d' // Rojo para ocupado
            },
            {
                title: 'Reserva Familia',
                start: '2026-04-01',
                end: '2026-04-05',
                color: '#ff4d4d'
            }
        ]
    });
    calendar1.render();

    // Configuración para la Cabaña 2
    var calendarEl2 = document.getElementById('calendar-cabin-2');
    var calendar2 = new FullCalendar.Calendar(calendarEl2, {
        initialView: 'dayGridMonth',
        locale: 'es',
        events: [
            {
                title: 'Mantenimiento',
                start: '2026-03-15',
                end: '2026-03-17',
                color: '#ffa500' // Naranja
            }
        ]
    });
    calendar2.render();
});
