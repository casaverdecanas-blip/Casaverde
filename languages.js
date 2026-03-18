const translations = {
    es: {
        welcome: "Bienvenido a CasaVerdeCanas Posada",
        "nav-about": "Sobre Nosotros", "nav-cabins": "Cabañas", "nav-contact": "Contacto",
        "about-title": "Sobre CasaVerdeCanas", "about-text": "Tu lugar en la naturaleza.",
        "cabins-title": "Nuestras Cabañas",
        "cabin-1-name": "Cabaña 1: Vista al Bosque", "cabin-1-desc": "Perfecta para parejas.",
        "cabin-2-name": "Cabaña 2: Familiar Premium", "cabin-2-desc": "Espaciosa para familias.",
        "occupancy-title": "Disponibilidad", "btn-book-wa": "Reservar por WhatsApp",
        "btn-back": "Volver", "footer-rights": "Todos los derechos reservados.",
        wa_msg: "Hola! Quisiera consultar disponibilidad para "
    },
    pt: {
        welcome: "Bem-vindo à CasaVerdeCanas Posada",
        "nav-about": "Sobre Nós", "nav-cabins": "Cabanas", "nav-contact": "Contato",
        "about-title": "Sobre a CasaVerdeCanas", "about-text": "O seu lugar na natureza.",
        "cabins-title": "Nossas Cabanas",
        "cabin-1-name": "Cabana 1: Vista Floresta", "cabin-1-desc": "Perfeita para casais.",
        "cabin-2-name": "Cabana 2: Familiar Premium", "cabin-2-desc": "Espaçosa para famílias.",
        "occupancy-title": "Disponibilidade", "btn-book-wa": "Reservar pelo WhatsApp",
        "btn-back": "Voltar", "footer-rights": "Todos os direitos reservados.",
        wa_msg: "Olá! Gostaria de consultar a disponibilidade para "
    },
    en: {
        welcome: "Welcome to CasaVerdeCanas Posada",
        "nav-about": "About Us", "nav-cabins": "Cabins", "nav-contact": "Contact",
        "about-title": "About CasaVerdeCanas", "about-text": "Your place in nature.",
        "cabins-title": "Our Cabins",
        "cabin-1-name": "Cabin 1: Forest View", "cabin-1-desc": "Perfect for couples.",
        "cabin-2-name": "Cabin 2: Family Premium", "cabin-2-desc": "Spacious for families.",
        "occupancy-title": "Availability", "btn-book-wa": "Book via WhatsApp",
        "btn-back": "Back", "footer-rights": "All rights reserved.",
        wa_msg: "Hi! I'd like to check availability for "
    }
};

let currentLang = 'es';

function changeLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) el.innerText = translations[lang][key];
    });
    document.documentElement.lang = lang;
    updateWhatsAppLinks();
    if (typeof updateCalendarsLanguage === "function") updateCalendarsLanguage(lang);
}

function updateWhatsAppLinks() {
    const phone = "5548999999999"; // TU TELÉFONO AQUÍ
    const msg = translations[currentLang].wa_msg;
    document.getElementById('wa-cabin-1').href = `https://wa.me/${phone}?text=${encodeURIComponent(msg + "Cabaña 1")}`;
    document.getElementById('wa-cabin-2').href = `https://wa.me/${phone}?text=${encodeURIComponent(msg + "Cabaña 2")}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const userLang = navigator.language || navigator.userLanguage;
    changeLanguage(userLang.startsWith('pt') ? 'pt' : userLang.startsWith('en') ? 'en' : 'es');
});


