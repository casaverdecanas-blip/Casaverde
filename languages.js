const translations = {
    es: {
        welcome: "Bienvenido a CasaVerdeCanas Posada",
        "nav-about": "Sobre Nosotros",
        "nav-cabins": "Nuestras Cabañas",
        "nav-occupancy": "Disponibilidad",
        "nav-contact": "Contacto",
        "about-title": "Sobre CasaVerdeCanas",
        "about-text": "Tu alquiler vacacional perfecto para una escapada relajante en la naturaleza.",
        "cabins-title": "Nuestras Cabañas",
        "cabin-1": "Cabaña 1: Acogedora, hasta 4 personas",
        "cabin-2": "Cabaña 2: Espaciosa para familias",
        "cabin-3": "Cabaña 3: Escapada romántica para parejas",
        "occupancy-title": "Disponibilidad",
        "cabin-1-title": "Cabaña 1",
        "cabin-2-title": "Cabaña 2",
        "btn-check": "Consultar Disponibilidad",
        "footer-rights": "Todos los derechos reservados."
    },
    en: {
        welcome: "Welcome to CasaVerdeCanas Posada",
        "nav-about": "About Us",
        "nav-cabins": "Our Cabins",
        "nav-occupancy": "Availability",
        "nav-contact": "Contact",
        "about-title": "About CasaVerdeCanas",
        "about-text": "Your perfect vacation rental for a relaxing getaway in nature.",
        "cabins-title": "Our Cabins",
        "cabin-1": "Cabin 1: Cozy cabin for up to 4 guests",
        "cabin-2": "Cabin 2: Spacious family cabin",
        "cabin-3": "Cabin 3: Romantic getaway",
        "occupancy-title": "Availability",
        "cabin-1-title": "Cabin 1",
        "cabin-2-title": "Cabin 2",
        "btn-check": "Check Availability",
        "footer-rights": "All rights reserved."
    },
    pt: {
        welcome: "Bem-vindo à CasaVerdeCanas Posada",
        "nav-about": "Sobre Nós",
        "nav-cabins": "Nossas Cabanas",
        "nav-occupancy": "Disponibilidade",
        "nav-contact": "Contato",
        "about-title": "Sobre a CasaVerdeCanas",
        "about-text": "O seu aluguel de temporada perfeito para uma escapada relaxante na natureza.",
        "cabins-title": "Nossas Cabanas",
        "cabin-1": "Cabana 1: Cabana aconchegante para até 4 pessoas",
        "cabin-2": "Cabana 2: Espaçosa para famílias",
        "cabin-3": "Cabana 3: Refúgio romântico para casais",
        "occupancy-title": "Disponibilidade",
        "cabin-1-title": "Cabana 1",
        "cabin-2-title": "Cabana 2",
        "btn-check": "Verificar Disponibilidade",
        "footer-rights": "Todos os direitos reservados."
    }
};

function changeLanguage(lang) {
    console.log("Cambiando a:", lang);
    
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            if (el.tagName === 'INPUT' && el.type === 'submit') {
                el.value = translations[lang][key];
            } else {
                el.innerText = translations[lang][key];
            }
        }
    });
    
    document.documentElement.lang = lang;

    // Actualiza los calendarios si la función existe en occupancy.js
    if (typeof updateCalendarsLanguage === "function") {
        updateCalendarsLanguage(lang);
    }
}

// Detectar idioma al cargar la página (FUERA de changeLanguage)
window.addEventListener('DOMContentLoaded', () => {
    const userLang = navigator.language || navigator.userLanguage; 
    // Si el dominio es .com.br o el navegador es portugués, default PT
    if (window.location.hostname.includes('.br') || userLang.startsWith('pt')) {
        changeLanguage('pt');
    } else {
        changeLanguage('es'); 
    }
});

