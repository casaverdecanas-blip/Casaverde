/**
 * Casa Verde - Core Auth & Database Engine
 * Maneja: Configuración, Seguridad, Roles y Sesión de Usuario.
 */

const firebaseConfig = {
    apiKey: "AIzaSyDluIIBwIJVkO9DEX4ghJQYhzJAnXtQoKs",
    authDomain: "tatareas-d8a80.firebaseapp.com",
    projectId: "tatareas-d8a80",
    storageBucket: "tatareas-d8a80.firebasestorage.app",
    messagingSenderId: "709332495480",
    appId: "1:709332495480:web:7060b2c75984352354918d"
};

// Inicialización de Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

/**
 * OBSERVADOR DE ESTADO DE AUTENTICACIÓN
 * Se ejecuta automáticamente cada vez que un usuario entra, sale o recarga.
 */
auth.onAuthStateChanged(async (user) => {
    const currentPath = window.location.pathname;

    // 1. Si no hay usuario y no está en la página de login -> Expulsar al login
    if (!user && !currentPath.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    if (user) {
        try {
            // 2. Recuperar datos extendidos del usuario desde Firestore
            // Usamos el UID del Auth para encontrar su documento en la colección 'usuarios'
            const userDoc = await db.collection('usuarios').doc(user.uid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Guardamos datos en sessionStorage para acceso rápido sin peticiones extra a Firebase
                sessionStorage.setItem('userName', userData.nombre || 'Colaborador');
                sessionStorage.setItem('userRol', userData.rol || 'user');

                // 3. LÓGICA DE REDIRECCIÓN SEGÚN ROL
                // Si es ADMIN y está en la página de colaborador o login -> Al Dashboard
                if (userData.rol === 'admin') {
                    if (currentPath.includes('colaborador.html') || currentPath.includes('login.html')) {
                        window.location.href = 'dashboard.html';
                    }
                } 
                // Si es COLABORADOR (user) y NO está en su página -> Forzar entrada a colaborador.html
                else if (userData.rol === 'user') {
                    if (!currentPath.includes('colaborador.html')) {
                        window.location.href = 'colaborador.html';
                    }
                }
            } else {
                // Si el usuario existe en Auth pero no tiene documento en Firestore -> Seguridad
                console.error("Error: El usuario no tiene perfil configurado en la colección 'usuarios'.");
                if (!currentPath.includes('login.html')) {
                    auth.signOut();
                    window.location.href = 'login.html';
                }
            }
        } catch (error) {
            console.error("Error crítico en la verificación de rol:", error);
        }
    }
});

/**
 * FUNCIÓN DE SALIDA (LOGOUT)
 * Limpia la sesión local y desconecta de Firebase.
 */
function logout() {
    sessionStorage.clear();
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Error al cerrar sesión:", error);
    });
}

/**
 * UTILIDAD: Obtener el inicio del día (00:00:00) para filtros de "Día Calendario"
 */
function getStartOfToday() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return hoy;
}
