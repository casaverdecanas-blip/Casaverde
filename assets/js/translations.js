// assets/js/translations.js
const TRANSLATIONS = {
    es: {
        // Generales
        siteName: "CasaVerdeCanas",
        subtitle: "Tu refugio en Canasvieiras",
        backHome: "← Volver al inicio",
        viewDetails: "Ver detalles",
        bookNow: "Reservar ahora",
        
        // Cabañas
        cabins: {
            "cabin-1": {
                name: "Cabaña Vista al Bosque",
                shortDesc: "Tranquilidad y naturaleza",
                longDesc: "Rodeada de árboles nativos, esta cabaña ofrece paz y conexión con la naturaleza.",
                capacity: "2 personas",
                features: ["Cama Queen", "Baño privado", "Pequeña cocina", "Balcón"]
            },
            "cabin-2": {
                name: "Cabaña Familiar Premium",
                shortDesc: "Espacio para toda la familia",
                longDesc: "Amplia cabaña con todas las comodidades para familias con niños.",
                capacity: "4 personas (2 + 2)",
                features: ["2 habitaciones", "Baño completo", "Cocina equipada", "Living", "Estacionamiento"]
            },
            "cabin-3": {
                name: "Refugio del Sol",
                shortDesc: "Calidez y confort",
                longDesc: "La cabaña más soleada, perfecta para parejas que buscan romance.",
                capacity: "2 personas",
                features: ["Cama King", "Baño con hidromasaje", "Terraza privada", "Vista al atardecer"]
            },
            "cabin-4": {
                name: "Loft Moderno",
                shortDesc: "Estilo y diseño",
                longDesc: "Diseño contemporáneo con todas las tecnologías para el huésped moderno.",
                capacity: "2 personas",
                features: ["Smart TV", "WiFi rápido", "Cocina integrada", "Home office"]
            }
        },
        
        // Calendario
        calendar: {
            available: "Disponible",
            booked: "Ocupado",
            selectDates: "Selecciona las fechas",
            checkIn: "Entrada",
            checkOut: "Salida"
        },
        
        // Admin
        admin: {
            login: "Acceso administrador",
            addPhoto: "Agregar foto",
            deletePhoto: "Eliminar",
            blockDates: "Bloquear fechas",
            setPrice: "Fijar precio"
        }
    },
    pt: {
        // ... traducción al portugués
        siteName: "CasaVerdeCanas",
        subtitle: "Seu refúgio em Canasvieiras",
        cabins: {
            "cabin-1": {
                name: "Cabana Vista da Mata",
                shortDesc: "Tranquilidade e natureza"
            }
        }
    },
    en: {
        // ... traducción al inglés
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function t(key) {
    const keys = key.split('.');
    let value = TRANSLATIONS[currentLang];
    for (let k of keys) {
        if (value && value[k]) value = value[k];
        else return key; // fallback al key si no encuentra
    }
    return value;
}

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    // Actualizar todos los elementos con data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
}
