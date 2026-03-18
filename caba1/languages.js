const translations = {
    es: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabaña 1: Vista Bosque", "btn-back": "Volver" },
    en: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabin 1: Forest View", "btn-back": "Back" },
    pt: { welcome: "CasaVerdeCanas", "cabin-1-name": "Cabana 1: Vista da Mata", "btn-back": "Voltar" }
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
