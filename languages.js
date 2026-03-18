const translations = {
    es: {
        welcome: "Bienvenido a CasaVerdeCanas Posada",
        "nav-about": "Sobre Nosotros",
        "nav-cabins": "Cabañas",
        "nav-contact": "Contacto",
        "about-title": "Sobre CasaVerdeCanas",
        "about-text": "Tu alquiler vacacional perfecto en la naturaleza.",
        "cabins-title": "Nuestras Cabañas",
        "cabin-1-name": "Cabaña 1: Vista al Bosque",
        "cabin-2-name": "Cabaña 2: Familiar Premium",
        "cabin-1-desc": "Ideal para parejas que buscan paz y vistas increíbles.",
        "cabin-2-desc": "Espaciosa, moderna y equipada para toda la familia.",
        "occupancy-title": "Disponibilidad",
        "btn-book-wa": "Reservar por WhatsApp",
        "btn-back": "Volver a la lista",
        "footer-rights": "Todos los derechos reservados.",
        wa_msg: "Hola! Quisiera consultar disponibilidad para "
    },
    pt: {
        welcome: "Bem-vindo à CasaVerdeCanas Posada",
        "nav-about": "Sobre Nós",
        "nav-cabins": "Nossas Cabanas",
        "nav-contact": "Contato",
        "about-title": "Sobre a CasaVerdeCanas",
        "about-text": "O seu aluguel de temporada perfeito na natureza.",
        "cabins-title": "Nossas Cabanas",
        "cabin-1-name": "Cabana 1: Vista para a Floresta",
        "cabin-2-name": "Cabana 2: Familiar Premium",
        "cabin-1-desc": "Ideal para casais que buscam paz e vistas incríveis.",
        "cabin-2-desc": "Espaçosa, moderna e equipada para toda a família.",
        "occupancy-title": "Disponibilidade",
        "btn-book-wa": "Reservar pelo WhatsApp",
        "btn-back": "Voltar para a lista",
        "footer-rights": "Todos os direitos reservados.",
        wa_msg: "Olá! Gostaria de consultar a disponibilidade para "
    },
    en: {
        welcome: "Welcome to CasaVerdeCanas Posada",
        "nav-about": "About Us",
        "nav-cabins": "Our Cabins",
        "nav-contact": "Contact",
        "about-title": "About CasaVerdeCanas",
        "about-text": "Your perfect vacation rental in nature.",
        "cabins-title": "Our Cabins",
        "cabin-1-name": "Cabin 1: Forest View",
        "cabin-2-name": "Cabin 2: Family Premium",
        "cabin-1-desc": "Ideal for couples seeking peace and amazing views.",
        "cabin-2-desc": "Spacious, modern, and fully equipped for the whole family.",
        "occupancy-title": "Availability",
        "btn-book-wa": "Book via WhatsApp",
        "btn-back": "Back to list",
        "footer-rights": "All rights reserved.",
        wa_msg: "Hi! I would like to check availability for "
    }
};

let currentLang = 'es';

function changeLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) el.innerText = translations[lang][key];
    });
    updateWhatsAppLinks();
    if (typeof updateCalendarsLanguage === "function") updateCalendarsLanguage(lang);
}

function updateWhatsAppLinks() {
    const phone = "5548991720737"; // CAMBIA ESTO POR TU NÚMERO (Código país + Ciudad + Número)
    const msg = translations[currentLang].wa_msg;
    
    document.getElementById('wa-cabin-1').href = `https://wa.me/${phone}?text=${encodeURIComponent(msg + "Cabaña 1")}`;
    document.getElementById('wa-cabin-2').href = `https://wa.me/${phone}?text=${encodeURIComponent(msg + "Cabaña 2")}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const userLang = navigator.language || navigator.userLanguage;
    changeLanguage(userLang.startsWith('pt') ? 'pt' : userLang.startsWith('en') ? 'en' : 'es');
});

