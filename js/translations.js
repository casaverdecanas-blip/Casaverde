// translations.js
const TRANSLATIONS = {
    es: {
        backHome: "← Volver al inicio",
        bookWhatsApp: "📱 Reservar por WhatsApp",
        sharedSpaces: "🌳 Espacios comunes",
        sharedDesc: "Zona techada con asador, mesa, sillas, hamacas, living, TV, juegos de mesa y piscina. Entorno verde y fresco. WiFi y lavadero compartido.",
        calendarLegendAirbnb: "Reservas Airbnb",
        calendarLegendManual: "Reservas directas",
        adminMode: "Modo admin activado",
        adminModeOff: "Modo admin desactivado",
        newReservation: "Nueva Reserva Manual",
        guestName: "Nombre del huésped",
        checkIn: "Entrada",
        checkOut: "Salida",
        save: "Guardar",
        cancel: "Cancelar",
        viewOnAirbnb: "Ver en Airbnb"
    },
    pt: {
        backHome: "← Voltar ao início",
        bookWhatsApp: "📱 Reservar pelo WhatsApp",
        sharedSpaces: "🌳 Espaços comuns",
        sharedDesc: "Área coberta com churrasqueira, mesa, cadeiras, redes, sala, TV, jogos de tabuleiro e piscina. Ambiente verde e fresco. WiFi e lavanderia compartilhados.",
        calendarLegendAirbnb: "Reservas Airbnb",
        calendarLegendManual: "Reservas diretas",
        adminMode: "Modo admin ativado",
        adminModeOff: "Modo admin desativado",
        newReservation: "Nova Reserva Manual",
        guestName: "Nome do hóspede",
        checkIn: "Entrada",
        checkOut: "Saída",
        save: "Salvar",
        cancel: "Cancelar",
        viewOnAirbnb: "Ver no Airbnb"
    },
    en: {
        backHome: "← Back to home",
        bookWhatsApp: "📱 Book via WhatsApp",
        sharedSpaces: "🌳 Common areas",
        sharedDesc: "Covered area with BBQ, table, chairs, hammocks, living room, TV, board games and pool. Green and fresh environment. Shared WiFi and laundry.",
        calendarLegendAirbnb: "Airbnb bookings",
        calendarLegendManual: "Direct bookings",
        adminMode: "Admin mode activated",
        adminModeOff: "Admin mode deactivated",
        newReservation: "New Manual Reservation",
        guestName: "Guest name",
        checkIn: "Check-in",
        checkOut: "Check-out",
        save: "Save",
        cancel: "Cancel",
        viewOnAirbnb: "View on Airbnb"
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function t(key) {
    return TRANSLATIONS[currentLang][key] || key;
}

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[lang][key]) el.textContent = TRANSLATIONS[lang][key];
    });
    // Disparar evento para actualizar calendario
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}
