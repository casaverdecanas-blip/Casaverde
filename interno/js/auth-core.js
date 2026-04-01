const firebaseConfig = {
    apiKey: "AIzaSyDluIIBwIJVkO9DEX4ghJQYhzJAnXtQoKs",
    authDomain: "tatareas-d8a80.firebaseapp.com",
    projectId: "tatareas-d8a80",
    storageBucket: "tatareas-d8a80.firebasestorage.app",
    messagingSenderId: "709332495480",
    appId: "1:709332495480:web:7060b2c75984352354918d"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(async (user) => {
    const path = window.location.pathname;
    if (!user && !path.includes('login.html')) {
        window.location.href = 'login.html';
    } else if (user) {
        const doc = await db.collection('usuarios').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            sessionStorage.setItem('userName', data.nombre || 'Colaborador');
            sessionStorage.setItem('userRol', data.rol);

            if (data.rol === 'admin' && (path.includes('colaborador.html') || path.includes('login.html'))) {
                window.location.href = 'dashboard.html';
            } else if (data.rol === 'user' && !path.includes('colaborador.html')) {
                window.location.href = 'colaborador.html';
            }
        }
    }
});

function logout() { 
    sessionStorage.clear();
    auth.signOut().then(() => window.location.href = 'login.html'); 
}
