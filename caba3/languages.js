const translations = {
    es: { 
        welcome: "CasaVerdeCanas", 
        "cabin-3-name": "Cabaña 3: Refugio del Sol", 
        "cabin-3-desc": "Un espacio cálido y luminoso, perfecto para descansar.", 
        "cal-label": "Disponibilidad Cabaña 3", 
        "btn-book-wa": "Reservar por WhatsApp" 
    },
    en: { 
        welcome: "CasaVerdeCanas", 
        "cabin-3-name": "Cabin 3: Sun Retreat", 
        "cabin-3-desc": "A warm and bright space, perfect for relaxing.", 
        "cal-label": "Cabin 3 Availability", 
        "btn-book-wa": "Book via WhatsApp" 
    },
    pt: { 
        welcome: "CasaVerdeCanas", 
        "cabin-3-name": "Cabana 3: Refúgio do Sol", 
        "cabin-3-desc": "Um espaço aconchegante e iluminado, perfeito para descansar.", 
        "cal-label": "Disponibilidade da Cabana 3", 
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
