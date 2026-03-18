const translations = {
    es: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabaña 1: Vista al Bosque",
        "cabin-1-desc": "Un refugio acogedor ideal para parejas.",
        "cabin-2-name": "Cabaña 2: Familiar Premium",
        "cabin-2-desc": "Espacio y confort para toda la familia.",
        "btn-view": "Ver Detalles", "btn-back": "Volver",
        "btn-book-wa": "Reservar por WhatsApp", "calendar-title": "Disponibilidad"
    },
    en: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabin 1: Forest View",
        "cabin-1-desc": "A cozy retreat perfect for couples.",
        "cabin-2-name": "Cabin 2: Family Premium",
        "cabin-2-desc": "Space and comfort for the whole family.",
        "btn-view": "View Details", "btn-back": "Back",
        "btn-book-wa": "Book via WhatsApp", "calendar-title": "Availability"
    },
    pt: {
        welcome: "CasaVerdeCanas",
        "cabin-1-name": "Cabana 1: Vista da Floresta",
        "cabin-1-desc": "Um refúgio aconchegante ideal para casais.",
        "cabin-2-name": "Cabana 2: Familiar Premium",
        "cabin-2-desc": "Espaço e conforto para toda a família.",
        "btn-view": "Ver Detalhes", "btn-back": "Voltar",
        "btn-book-wa": "Reservar pelo WhatsApp", "calendar-title": "Disponibilidade"
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) el.innerText = translations[lang][key];
    });
    if (typeof currentCabin !== 'undefined' && currentCabin) {
        document.getElementById('detail-title').innerText = translations[lang][`${currentCabin}-name`];
        document.getElementById('detail-desc').innerText = translations[lang][`${currentCabin}-desc`];
    }
}
