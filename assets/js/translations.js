// translations.js
const TRANSLATIONS = {
    es: {
        // Generales
        siteName: "CasaVerdeCanas",
        subtitle: "Tu refugio en Canasvieiras, Florianópolis",
        backHome: "← Volver al inicio",
        viewDetails: "Ver detalles",
        bookNow: "Reservar ahora",
        loading: "Cargando...",
        error: "Error al cargar",
        
        // Navegación
        nav: {
            home: "Inicio",
            cabins: "Cabañas",
            location: "Ubicación",
            contact: "Contacto"
        },
        
        // Secciones
        sections: {
            whyUs: "¿Por qué elegirnos?",
            cabins: "Nuestras Cabañas",
            location: "¿Dónde estamos?",
            testimonials: "Lo que dicen nuestros huéspedes"
        },
        
        // Características
        features: {
            beach: "A 200m de la playa",
            parking: "Estacionamiento gratis",
            breakfast: "Desayuno incluido",
            wifi: "WiFi gratis",
            nature: "Rodeado de naturaleza",
            confort: "Máximo confort"
        },
        
        // Cabañas
        cabins: {
            "cabin-1": {
                name: "Cabaña Vista al Bosque",
                shortDesc: "Tranquilidad y naturaleza",
                longDesc: "Rodeada de árboles nativos, esta cabaña ofrece paz y conexión con la naturaleza. Ideal para parejas que buscan desconectarse.",
                capacity: "2 personas",
                features: ["Cama Queen", "Baño privado", "Cocina básica", "Balcón con vista"],
                price: "R$ 250/noche"
            },
            "cabin-2": {
                name: "Cabaña Familiar Premium",
                shortDesc: "Espacio para toda la familia",
                longDesc: "Amplia cabaña con todas las comodidades para familias con niños. Zona de juegos y espacio exterior.",
                capacity: "4 personas (2+2)",
                features: ["2 habitaciones", "Baño completo", "Cocina equipada", "Living", "Estacionamiento", "Parrilla"],
                price: "R$ 450/noche"
            },
            "cabin-3": {
                name: "Refugio del Sol",
                shortDesc: "Calidez y confort",
                longDesc: "La cabaña más soleada, perfecta para parejas que buscan romance. Atardeceres inolvidables desde la terraza.",
                capacity: "2 personas",
                features: ["Cama King", "Baño con hidromasaje", "Terraza privada", "Vista al atardecer"],
                price: "R$ 380/noche"
            },
            "cabin-4": {
                name: "Loft Moderno",
                shortDesc: "Estilo y diseño",
                longDesc: "Diseño contemporáneo con todas las tecnologías para el huésped moderno. Ideal para trabajo remoto.",
                capacity: "2 personas",
                features: ["Smart TV 50\"", "WiFi fibra", "Cocina integrada", "Home office", "Aire acondicionado"],
                price: "R$ 320/noche"
            }
        },
        
        // Calendario y reservas
        calendar: {
            title: "Disponibilidad",
            available: "Disponible",
            booked: "Ocupado",
            selectDates: "Selecciona las fechas",
            checkIn: "Entrada",
            checkOut: "Salida",
            bookNow: "Reservar por WhatsApp",
            from: "Desde",
            to: "Hasta",
            perNight: "por noche"
        },
        
        // Ubicación
        location: {
            address: "Canasvieiras, Florianópolis - SC, Brasil",
            nearby: "Cerca de:",
            places: ["Supermercado (2 cuadras)", "Restaurantes (3 cuadras)", "Parada de bus (1 cuadra)"]
        },
        
        // Testimonios
        testimonials: [
            {
                text: "Excelente atención, muy limpio y cerca de la playa. Volveremos!",
                author: "María",
                country: "Argentina",
                rating: 5
            },
            {
                text: "Lugar tranquilo, cabañas cómodas. El desayuno es increíble.",
                author: "João",
                country: "Brasil",
                rating: 5
            },
            {
                text: "Perfecto para desconectar. La vista al bosque es mágica.",
                author: "Carlos",
                country: "Uruguay",
                rating: 5
            }
        ],
        
        // Admin
        admin: {
            login: "Acceso administrador",
            logout: "Cerrar sesión",
            addPhoto: "Agregar foto",
            deletePhoto: "Eliminar",
            blockDates: "Bloquear fechas",
            setPrice: "Fijar precio",
            guestName: "Nombre del huésped",
            save: "Guardar",
            cancel: "Cancelar",
            confirmDelete: "¿Estás seguro?"
        },
        
        // Footer
        footer: {
            rights: "Todos los derechos reservados",
            developed: "Posada familiar en Canasvieiras",
            contact: "Contacto"
        }
    },
    
    pt: {
        // Português
        siteName: "CasaVerdeCanas",
        subtitle: "Seu refúgio em Canasvieiras, Florianópolis",
        backHome: "← Voltar ao início",
        viewDetails: "Ver detalhes",
        bookNow: "Reservar agora",
        
        sections: {
            whyUs: "Por que nos escolher?",
            cabins: "Nossas Cabanas",
            location: "Onde estamos?",
            testimonials: "O que nossos hóspedes dizem"
        },
        
        features: {
            beach: "A 200m da praia",
            parking: "Estacionamento grátis",
            breakfast: "Café da manhã incluso",
            wifi: "WiFi grátis",
            nature: "Cercado pela natureza",
            confort: "Máximo conforto"
        },
        
        cabins: {
            "cabin-1": {
                name: "Cabana Vista da Mata",
                shortDesc: "Tranquilidade e natureza",
                longDesc: "Cercada por árvores nativas, esta cabana oferece paz e conexão com a natureza.",
                capacity: "2 pessoas",
                features: ["Cama Queen", "Banheiro privativo", "Cozinha básica", "Varanda com vista"],
                price: "R$ 250/noite"
            },
            "cabin-2": {
                name: "Cabana Familiar Premium",
                shortDesc: "Espaço para toda família",
                longDesc: "Ampla cabana com todas as comodidades para famílias com crianças.",
                capacity: "4 pessoas (2+2)",
                features: ["2 quartos", "Banheiro completo", "Cozinha equipada", "Sala", "Estacionamento", "Churrasqueira"],
                price: "R$ 450/noite"
            },
            "cabin-3": {
                name: "Refúgio do Sol",
                shortDesc: "Calor e conforto",
                longDesc: "A cabana mais ensolarada, perfeita para casais que buscam romance.",
                capacity: "2 pessoas",
                features: ["Cama King", "Banheiro com hidromassagem", "Terraço privativo", "Vista para o pôr do sol"],
                price: "R$ 380/noite"
            },
            "cabin-4": {
                name: "Loft Moderno",
                shortDesc: "Estilo e design",
                longDesc: "Design contemporâneo com todas as tecnologias para o hóspede moderno.",
                capacity: "2 pessoas",
                features: ["Smart TV 50\"", "WiFi fibra", "Cozinha integrada", "Home office", "Ar condicionado"],
                price: "R$ 320/noite"
            }
        },
        
        calendar: {
            title: "Disponibilidade",
            available: "Disponível",
            booked: "Ocupado",
            selectDates: "Selecione as datas",
            checkIn: "Entrada",
            checkOut: "Saída",
            bookNow: "Reservar pelo WhatsApp"
        },
        
        footer: {
            rights: "Todos os direitos reservados",
            developed: "Pousada familiar em Canasvieiras"
        }
    },
    
    en: {
        // English
        siteName: "CasaVerdeCanas",
        subtitle: "Your refuge in Canasvieiras, Florianópolis",
        backHome: "← Back to home",
        viewDetails: "View details",
        bookNow: "Book now",
        
        sections: {
            whyUs: "Why choose us?",
            cabins: "Our Cabins",
            location: "Where we are",
            testimonials: "What our guests say"
        },
        
        features: {
            beach: "200m from the beach",
            parking: "Free parking",
            breakfast: "Breakfast included",
            wifi: "Free WiFi",
            nature: "Surrounded by nature",
            confort: "Maximum comfort"
        },
        
        cabins: {
            "cabin-1": {
                name: "Forest View Cabin",
                shortDesc: "Peace and nature",
                longDesc: "Surrounded by native trees, this cabin offers peace and connection with nature.",
                capacity: "2 people",
                features: ["Queen Bed", "Private bathroom", "Basic kitchen", "Balcony with view"],
                price: "R$ 250/night"
            },
            "cabin-2": {
                name: "Family Premium Cabin",
                shortDesc: "Space for the whole family",
                longDesc: "Spacious cabin with all comforts for families with children.",
                capacity: "4 people (2+2)",
                features: ["2 bedrooms", "Full bathroom", "Equipped kitchen", "Living room", "Parking", "BBQ"],
                price: "R$ 450/night"
            },
            "cabin-3": {
                name: "Sun Refuge",
                shortDesc: "Warmth and comfort",
                longDesc: "The sunniest cabin, perfect for couples seeking romance.",
                capacity: "2 people",
                features: ["King Bed", "Bathroom with jacuzzi", "Private terrace", "Sunset view"],
                price: "R$ 380/night"
            },
            "cabin-4": {
                name: "Modern Loft",
                shortDesc: "Style and design",
                longDesc: "Contemporary design with all technologies for the modern guest.",
                capacity: "2 people",
                features: ["Smart TV 50\"", "Fiber WiFi", "Integrated kitchen", "Home office", "Air conditioning"],
                price: "R$ 320/night"
            }
        },
        
        calendar: {
            title: "Availability",
            available: "Available",
            booked: "Booked",
            selectDates: "Select dates",
            checkIn: "Check-in",
            checkOut: "Check-out",
            bookNow: "Book via WhatsApp"
        }
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function t(key) {
    const keys = key.split('.');
    let value = TRANSLATIONS[currentLang];
    for (let k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            console.warn(`Translation missing for: ${key}`);
            return key;
        }
    }
    return value;
}

function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    
    // Actualizar todos los elementos con data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    
    // Actualizar placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    
    // Disparar evento para que otros scripts se actualicen
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}
