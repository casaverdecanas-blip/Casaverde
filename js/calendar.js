// calendar.js
let calendar = null;
let editMode = false;

async function importAirbnbCalendar(cabinId, icalUrl) {
    console.log(`🔄 Importando calendario Airbnb para ${cabinId}...`);
    try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const response = await fetch(proxyUrl + encodeURIComponent(icalUrl));
        const icalData = await response.text();
        
        const jcalData = ICAL.parse(icalData);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        console.log(`📅 Encontrados ${vevents.length} eventos en Airbnb`);
        
        const snapshot = await db.ref(`reservas/${cabinId}`).once('value');
        const existingReservas = snapshot.val() || {};
        
        const existingKeys = new Set();
        Object.entries(existingReservas).forEach(([key, reserva]) => {
            if (reserva.source === 'airbnb') {
                existingKeys.add(`${reserva.start}_${reserva.end}`);
            }
        });
        
        let nuevasReservas = 0;
        for (const vevent of vevents) {
            const event = new ICAL.Event(vevent);
            const startDate = event.startDate.toJSDate();
            const endDate = event.endDate.toJSDate();
            const endAdjusted = new Date(endDate);
            endAdjusted.setDate(endAdjusted.getDate() - 1);
            
            const start = startDate.toISOString().split('T')[0];
            const end = endAdjusted.toISOString().split('T')[0];
            const eventKey = `${start}_${end}`;
            
            if (existingKeys.has(eventKey)) continue;
            
            let guestName = 'Airbnb';
            if (event.summary) {
                guestName = event.summary.replace(/Reservado:|Reserved:|Réservé:/i, '').trim();
                if (guestName.length > 25) guestName = guestName.substring(0, 25) + '...';
                if (guestName === '') guestName = 'Airbnb';
            }
            
            await db.ref(`reservas/${cabinId}`).push({
                guest: guestName,
                start: start,
                end: end,
                source: 'airbnb',
                importedAt: new Date().toISOString()
            });
            nuevasReservas++;
        }
        
        console.log(`✅ Importadas ${nuevasReservas} nuevas reservas de Airbnb`);
        if (calendar) setTimeout(() => calendar.refetchEvents(), 1000);
        
    } catch (error) {
        console.error('❌ Error importando:', error);
    }
}

function initCalendar(calendarEl, cabinId, lang, onDateClick, onEventClick) {
    db.ref(`reservas/${cabinId}`).on('value', (snapshot) => {
        const reservas = snapshot.val() || {};
        const events = Object.keys(reservas).map(key => ({
            id: key,
            title: reservas[key].guest || 'Reservado',
            start: reservas[key].start,
            end: reservas[key].end,
            color: reservas[key].source === 'airbnb' ? '#FF9800' : '#e74c3c',
            allDay: true
        }));
        
        if (calendar) {
            calendar.removeAllEvents();
            calendar.addEventSource(events);
        } else {
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                locale: lang,
                events: events,
                height: 'auto',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth'
                },
                buttonText: {
                    today: lang === 'es' ? 'Hoy' : (lang === 'pt' ? 'Hoje' : 'Today'),
                    month: lang === 'es' ? 'Mes' : (lang === 'pt' ? 'Mês' : 'Month')
                },
                dateClick: onDateClick,
                eventClick: onEventClick
            });
            calendar.render();
        }
    });
    return calendar;
}

function saveBooking(cabinId, guest, start, end) {
    return db.ref(`reservas/${cabinId}`).push({
        guest, start, end, source: 'manual',
        createdAt: new Date().toISOString()
    });
}

function deleteBooking(cabinId, bookingId) {
    return db.ref(`reservas/${cabinId}/${bookingId}`).remove();
}

function setupCalendarSync(cabinId, icalUrl) {
    // Importación inicial
    importAirbnbCalendar(cabinId, icalUrl);
    // Programar importación cada 3 horas
    setInterval(() => importAirbnbCalendar(cabinId, icalUrl), 3 * 60 * 60 * 1000);
}
