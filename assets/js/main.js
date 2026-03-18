// main.js - Funcionalidad principal del sitio

// Variables globales
let editMode = false;
let currentCabin = null;

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando sitio...');
    
    // Aplicar idioma guardado
    changeLanguage(localStorage.getItem('lang') || 'es');
    
    // Verificar modo admin
    checkAdminMode();
    
    // Cargar componentes según la página
    if (document.getElementById('cabins-container')) {
        await loadCabins();
    }
    
    if (document.getElementById('calendar')) {
        const cabinId = document.body.dataset.cabin;
        if (cabinId) {
            currentCabin = cabinId;
            await loadCabinPage(cabinId);
        }
    }
    
    // Inicializar botones de WhatsApp
    initWhatsAppButtons();
    
    console.log('✅ Sitio inicializado');
});

// Verificar modo admin
function checkAdminMode() {
    const adminStatus = localStorage.getItem('admin');
    if (adminStatus === 'true') {
        editMode = true;
        document.body.classList.add('admin-mode');
        console.log('👑 Modo administrador activado');
    }
}

// Cargar cabañas en el index
async function loadCabins() {
    const container = document.getElementById('cabins-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando cabañas...</div>';
    
    try {
        // Escuchar cambios en fotos
        FirebaseDB.getFotos().on('value', async (snapshot) => {
            const fotos = snapshot.val() || {};
            container.innerHTML = '';
            
            // Cargar cada cabaña
            for (let i = 1; i <= 4; i++) {
                const cabinId = `cabin-${i}`;
                const cabinInfo = t(`cabins.${cabinId}`);
                
                // Obtener foto principal
                const cabinFotos = fotos[cabinId] || {};
                const primeraFoto = Object.values(cabin
