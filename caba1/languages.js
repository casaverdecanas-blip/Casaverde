const translations = {
    es: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabaña 1: Vista al Bosque",
        "cabin-1-desc": "Un refugio acogedor ideal para parejas o pequeñas familias en el corazón de Canasvieiras.",
        "cal-label": "Disponibilidad de la Cabaña 1",
        "btn-book-wa": "Reservar por WhatsApp"
    },
    en: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabin 1: Forest View",
        "cabin-1-desc": "A cozy retreat perfect for couples or small families in the heart of Canasvieiras.",
        "cal-label": "Cabin 1 Availability",
        "btn-book-wa": "Book via WhatsApp"
    },
    pt: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabana 1: Vista da Mata",
        "cabin-1-desc": "Um refúgio aconchegante ideal para casais ou pequenas famílias no coração de Canasvieiras.",
        "cal-label": "Disponibilidade da Cabana 1",
        "btn-book-wa": "Reservar pelo WhatsApp"
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) el.innerText = translations[lang][key];
    });
    // Si el calendario ya existe, intentamos avisarle del cambio de idioma
    if (window.currentCalendar) {
        window.currentCalendar.setOption('locale', lang);
    }
}
