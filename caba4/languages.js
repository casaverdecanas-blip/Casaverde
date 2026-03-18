const translations = {
    es: { 
        welcome: "CasaVerdeCanas", 
        "cabin-4-name": "Cabaña 4: Loft del Lago", 
        "cabin-4-desc": "Un espacio moderno con diseño industrial y vistas inmejorables.", 
        "cal-label": "Disponibilidad Cabaña 4", 
        "btn-book-wa": "Reservar por WhatsApp" 
    },
    en: { 
        welcome: "CasaVerdeCanas", 
        "cabin-4-name": "Cabin 4: Lake Loft", 
        "cabin-4-desc": "A modern space with industrial design and unbeatable views.", 
        "cal-label": "Cabin 4 Availability", 
        "btn-book-wa": "Book via WhatsApp" 
    },
    pt: { 
        welcome: "CasaVerdeCanas", 
        "cabin-4-name": "Cabana 4: Loft do Lago", 
        "cabin-4-desc": "Um espaço moderno com design industrial e vistas imbatíveis.", 
        "cal-label": "Disponibilidade da Cabana 4", 
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
}
