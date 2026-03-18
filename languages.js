const translations = {
    es: {
        welcome: "Bienvenido a CasaVerdeCanas Posada",
        "nav-about": "Sobre Nosotros",
        "nav-cabins": "Nuestras Cabañas",
        "nav-booking": "Reservar",
        "nav-contact": "Contacto",
        "about-title": "Sobre CasaVerdeCanas",
        "about-text": "Tu alquiler vacacional perfecto para una escapada relajante en la naturaleza.",
        "cabins-title": "Nuestras Cabañas",
        "cabin-1": "Cabaña 1: Acogedora, hasta 4 personas",
        "btn-check": "Consultar Disponibilidad"
    },
    en: {
        welcome: "Welcome to CasaVerdeCanas Posada",
        "nav-about": "About Us",
        "nav-cabins": "Our Cabins",
        "nav-booking": "Book Now",
        "nav-contact": "Contact",
        "about-title": "About CasaVerdeCanas",
        "about-text": "Your perfect vacation rental for a relaxing getaway in nature.",
        "cabins-title": "Our Cabins",
        "cabin-1": "Cabin 1: Cozy cabin for up to 4 guests",
        "btn-check": "Check Availability"
    },
    pt: {
        welcome: "Bem-vindo à CasaVerdeCanas Posada",
        "nav-about": "Sobre Nós",
        "nav-cabins": "Nossas Cabanas",
        "nav-booking": "Reservar",
        "nav-contact": "Contato",
        "about-title": "Sobre a CasaVerdeCanas",
        "about-text": "O seu aluguel de temporada perfeito para uma escapada relaxante na natureza.",
        "cabins-title": "Nossas Cabanas",
        "cabin-1": "Cabana 1: Cabana aconchegante para até 4 pessoas",
        "btn-check": "Verificar Disponibilidade"
    }
};

function changeLanguage(lang) {
    console.log("Cambiando a:", lang); // Esto te dirá en la consola si el botón funciona
    
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang] && translations[lang][key]) {
            // Si es un botón o input, usamos .value o .innerText según corresponda
            if (el.tagName === 'INPUT' && el.type === 'submit') {
                el.value = translations[lang][key];
            } else {
                el.innerText = translations[lang][key];
            }
        }
    });
    
    // Cambia el atributo lang del HTML para accesibilidad
    document.documentElement.lang = lang;
    // Al final de tu script de idiomas
window.onload = function() {
    // Si el usuario entra desde Brasil o tiene el navegador en PT
    const userLang = navigator.language || navigator.userLanguage; 
    if (userLang.startsWith('pt')) {
        changeLanguage('pt');
    } else {
        changeLanguage('es'); // O el que prefieras por defecto
    }
};

}
