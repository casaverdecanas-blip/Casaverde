const translations = {
    es: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabaña 1: Vista al Bosque", "cabin-1-desc": "Refugio acogedor en Canasvieiras.", "cal-label": "Disponibilidad", "btn-book-wa": "Reservar por WhatsApp" },
    en: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabin 1: Forest View", "cabin-1-desc": "Cozy retreat in Canasvieiras.", "cal-label": "Availability", "btn-book-wa": "Book via WhatsApp" },
    pt: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabana 1: Vista da Mata", "cabin-1-desc": "Refúgio aconchegante em Canasvieiras.", "cal-label": "Disponibilidade", "btn-book-wa": "Reservar pelo WhatsApp" }
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
