document.addEventListener('DOMContentLoaded', function() {
    // --- CABAÑA 1 ---
    var calendarEl1 = document.getElementById('calendar-cabin-1');
    if (calendarEl1) {
        var calendar1 = new FullCalendar.Calendar(calendarEl1, {
            initialView: 'dayGridMonth',
            locale: 'es',
            height: 'auto', // Ajusta la altura al contenido
            events: [
                { title: 'Ocupado', start: '2026-03-20', end: '2026-03-25', color: '#ff4d4d' },
                { title: 'Reserva Familia', start: '2026-04-01', end: '2026-04-05', color: '#ff4d4d' }
            ]
        });
        calendar1.render();
    }

    // --- CABAÑA 2 ---
    var calendarEl2 = document.getElementById('calendar-cabin-2');
    if (calendarEl2) {
        var calendar2 = new FullCalendar.Calendar(calendarEl2, {
            initialView: 'dayGridMonth',
            locale: 'es',
            height: 'auto',
            events: [
                { title: 'Mantenimiento', start: '2026-03-15', end: '2026-03-17', color: '#ffa500' }
            ]
        });
        calendar2.render();
        
        // TRUCO: Forzamos el redibujado para evitar que salga en blanco
        setTimeout(() => { calendar2.updateSize(); }, 100);
    }
});
