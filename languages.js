const translations = {
    es: { welcome: "Bienvenido", "cabins-title": "Cabañas", "cabin-1-name": "Cabaña 1", "cabin-1-desc": "Parejas.", "cabin-2-name": "Cabaña 2", "cabin-2-desc": "Familias.", "occupancy-title": "Disponibilidad", "btn-back": "Volver", wa_msg: "Hola! Consulta para " },
    en: { welcome: "Welcome", "cabins-title": "Cabins", "cabin-1-name": "Cabin 1", "cabin-1-desc": "Couples.", "cabin-2-name": "Cabin 2", "cabin-2-desc": "Families.", "occupancy-title": "Availability", "btn-back": "Back", wa_msg: "Hi! Inquiry for " },
    pt: { welcome: "Bem-vindo", "cabins-title": "Cabanas", "cabin-1-name": "Cabana 1", "cabin-1-desc": "Casais.", "cabin-2-name": "Cabana 2", "cabin-2-desc": "Famílias.", "occupancy-title": "Disponibilidade", "btn-back": "Voltar", wa_msg: "Olá! Consulta para " }
};

let currentLang = 'es';
function changeLanguage(l) {
    currentLang = l;
    document.querySelectorAll('[data-key]').forEach(el => {
        const k = el.getAttribute('data-key');
        if (translations[l][k]) el.innerText = translations[l][k];
    });
    document.documentElement.lang = l;
}

