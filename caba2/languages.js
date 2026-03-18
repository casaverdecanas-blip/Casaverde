const translations = {
    es: { 
        welcome: "CasaVerdeCanas", 
        "cabin-2-name": "Cabaña 2: Familiar Premium", 
        "cabin-2-desc": "Espacio ideal para familias con todas las comodidades.", 
        "cal-label": "Disponibilidad Cabaña 2", 
        "btn-book-wa": "Reservar por WhatsApp" 
    },
    en: { 
        welcome: "CasaVerdeCanas", 
        "cabin-2-name": "Cabin 2: Family Premium", 
        "cabin-2-desc": "Ideal space for families with all amenities.", 
        "cal-label": "Cabin 2 Availability", 
        "btn-book-wa": "Book via WhatsApp" 
    },
    pt: { 
        welcome: "CasaVerdeCanas", 
        "cabin-2-name": "Cabana 2: Familiar Premium", 
        "cabin-2-desc": "Espaço ideal para famílias com todas as comodidades.", 
        "cal-label": "Disponibilidade da Cabana 2", 
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
