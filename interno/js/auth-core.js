// ============================================
// CONFIGURACIÓN CENTRAL DE FIREBASE
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyDluIIBwIJVkO9DEX4ghJQYhzJAnXtQoKs",
    authDomain: "tatareas-d8a80.firebaseapp.com",
    projectId: "tatareas-d8a80",
    storageBucket: "tatareas-d8a80.firebasestorage.app",
    messagingSenderId: "709332495480",
    appId: "1:709332495480:web:7060b2c75984352354918d"
};

// Inicializar Firebase si no está ya inicializado
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ============================================
// FUNCIONES DE AUTENTICACIÓN
// ============================================

let currentUser = null;

async function checkAdmin() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userDoc = await db.collection('usuarios').doc(user.uid).get();
                    if (userDoc.exists && userDoc.data().rol === 'admin') {
                        currentUser = user;
                        resolve(true);
                    } else {
                        await auth.signOut();
                        resolve(false);
                    }
                } catch (error) {
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        });
    });
}

async function loginAdmin(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const userDoc = await db.collection('usuarios').doc(userCredential.user.uid).get();
        if (!userDoc.exists || userDoc.data().rol !== 'admin') {
            await auth.signOut();
            throw new Error('Acceso solo para administradores');
        }
        currentUser = userCredential.user;
        return { success: true, user: currentUser };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function logoutAdmin() {
    return auth.signOut();
}

// ============================================
// FUNCIONES COMUNES
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

function formatDate(date) {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-ES');
}

function formatDateTime(date) {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('es-ES');
}

function formatCurrency(value, currency = 'BRL') {
    if (currency === 'USD') return `USD ${value.toFixed(2)}`;
    return `R$ ${value.toFixed(2)}`;
}

// ============================================
// VARIABLES GLOBALES
// ============================================

// Configuración de Google Calendar (la que funciona)
const GOOGLE_API_KEY = 'AIzaSyDluIIBwIJVkO9DEX4ghJQYhzJAnXtQoKs';
const GOOGLE_CALENDARS = [
    { id: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com', color: '#FF9800', title: 'Cabaña 1 - Frente', cabaña: '1' },
    { id: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com', color: '#3498db', title: 'Cabaña 2 - Depa abajo', cabaña: '2' },
    { id: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com', color: '#2ecc71', title: 'Cabaña 3 - Loft', cabaña: '3' }
];

// Mapeo de cabañas
const cabañaNombre = { '1': 'Cabaña 1 (Frente)', '2': 'Cabaña 2 (Depa abajo)', '3': 'Cabaña 3 (Loft)' };
const cabañaColor = { '1': '#FF9800', '2': '#3498db', '3': '#2ecc71' };