let calendars = {};

document.addEventListener('DOMContentLoaded', function() {
    function initCal(id, events) {
        const el = document.getElementById(id);
        if (el) {
            const cal = new FullCalendar.Calendar(el, {
                initialView: 'dayGridMonth',
                locale: 'es',
                height: 'auto',
                events: events
            });
            cal.render();
            calendars[id] = cal;
        }
    }

    initCal('calendar-cabin-1', [{ title: 'Ocupado', start: '2026-03-20', end: '2026-03-25', color: '#ff4d4d' }]);
    initCal('calendar-cabin-2', [{ title: 'Reservado', start: '2026-03-25', end: '2026-03-28', color: '#ff4d4d' }]);
});

function updateCalendarsLanguage(lang) {
    for (let id in calendars) { calendars[id].setOption('locale', lang); }
}

function showCabinDetails(cabinId) {
    document.getElementById('main-content-wrapper').style.display = 'none';
    document.getElementById('cabin-details-wrapper').style.display = 'block';
    document.querySelectorAll('.cabin-detail-section').forEach(s => s.style.display = 'none');
    document.getElementById('details-' + cabinId).style.display = 'block';
    
    setTimeout(() => {
        const calId = 'calendar-' + cabinId;
        if (calendars[calId]) calendars[calId].updateSize();
    }, 100);
    window.scrollTo(0,0);
}

function hideCabinDetails() {
    document.getElementById('cabin-details-wrapper').style.display = 'none';
    document.getElementById('main-content-wrapper').style.display = 'block';
}
