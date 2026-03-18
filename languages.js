const translations = {
    es: {
        welcome: "CasaVerdeCanas",
        "nav-about": "Sobre Nosotros", "nav-cabins": "Cabañas",
        "cabin-1-name": "Cabaña 1: Vista al Bosque",
        "cabin-1-desc": "Un refugio acogedor ideal para parejas que buscan paz.",
        "cabin-2-name": "Cabaña 2: Familiar Premium",
        "cabin-2-desc": "Amplia, moderna y con todas las comodidades para tu familia.",
        "btn-view": "Ver Detalles", "btn-back": "Volver a Cabañas",
        "btn-book-wa": "Reservar por WhatsApp", "calendar-title": "Disponibilidad de la Cabaña"
    },
    en: {
        welcome: "CasaVerdeCanas",
        "nav-about": "About Us", "nav-cabins": "Our Cabins",
        "cabin-1-name": "Cabin 1: Forest View",
        "cabin-1-desc": "A cozy retreat perfect for couples seeking peace.",
        "cabin-2-name": "Cabin 2: Family Premium",
        "cabin-2-desc": "Spacious, modern, and with all comforts for your family.",
        "btn-view": "View Details", "btn-back": "Back to Cabins",
        "btn-book-wa": "Book via WhatsApp", "calendar-title": "Cabin Availability"
    },
    pt: {
        welcome: "CasaVerdeCanas",
        "nav-about": "Sobre Nós", "nav-cabins": "Nossas Cabanas",
        "cabin-1-name": "Cabana 1: Vista da Floresta",
        "cabin-1-desc": "Um refúgio aconchegante ideal para casais.",
        "cabin-2-name": "Cabana 2: Familiar Premium",
        "cabin-2-desc": "Espaçosa, moderna e com todo o conforto para sua família.",
        "btn-view": "Ver Detalhes", "btn-back": "Voltar",
        "btn-book-wa": "Reservar pelo WhatsApp", "calendar-title": "Disponibilidade da Cabana"
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

    // Actualizar textos si estamos en la vista de detalle
    if (typeof currentCabin !== 'undefined' && currentCabin) {
        document.getElementById('detail-title').innerText = translations[lang][`${currentCabin}-name`];
        document.getElementById('detail-desc').innerText = translations[lang][`${currentCabin}-desc`];
    }
}
