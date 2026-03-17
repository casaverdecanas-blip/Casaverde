const translations = {
    es: {
        welcome: "Bienvenido a Casa Verde Posada",
        "nav-about": "Sobre Nosotros",
        "about-title": "Sobre Casa Verde",
        "about-text": "Tu alquiler vacacional perfecto para una escapada relajante en la naturaleza.",
        "cabins-title": "Nuestras Cabañas",
        "cabin-1": "Cabaña 1: Acogedora, hasta 4 personas"
    },
    en: {
        welcome: "Welcome to Casa Verde Posada",
        "nav-about": "About Us",
        "about-title": "About Casa Verde",
        "about-text": "Your perfect vacation rental for a relaxing getaway in nature.",
        "cabins-title": "Our Cabins",
        "cabin-1": "Cabin 1: Cozy cabin for up to 4 guests"
    },
    pt: {
        welcome: "Bem-vindo à Casa Verde Posada",
        "nav-about": "Sobre Nós",
        "about-title": "Sobre a Casa Verde",
        "about-text": "O seu aluguel de temporada perfeito para uma escapada relaxante na natureza.",
        "cabins-title": "Nossas Cabanas",
        "cabin-1": "Cabana 1: Cabana aconchegante para até 4 pessoas"
    }
};

function changeLanguage(lang) {
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) {
            el.innerText = translations[lang][key];
        }
    });
    // Opcional: Guardar la preferencia en el navegador
    localStorage.setItem('preferredLang', lang);
}
