// assets/js/firebase.js
const firebaseConfig = {
    apiKey: "AIzaSyDYE7XIZ5ZhU6ky-A1sWGOeBmI67MOrj4g",
    authDomain: "casa-199.firebaseapp.com",
    databaseURL: "https://casa-199-default-rtdb.firebaseio.com",
    projectId: "casa-199",
    storageBucket: "casa-199.firebasestorage.app",
    messagingSenderId: "441572853741",
    appId: "1:441572853741:web:25e588b5161d7486e4c9e4"
};

// Inicializar Firebase (solo una vez)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();

// Estructura ORGANIZADA de la base de datos
const DB = {
    // Referencias útiles
    cabins: db.ref('cabinas'),
    bookings: db.ref('reservas'),
    photos: db.ref('fotos'),
    prices: db.ref('precios'),
    settings: db.ref('configuracion'),
    
    // Funciones helper
    getCabin: (id) => db.ref(`cabinas/${id}`),
    getBookings: (cabinId) => db.ref(`reservas/${cabinId}`),
    getPhotos: (cabinId) => db.ref(`fotos/${cabinId}`),
    getPrices: (cabinId) => db.ref(`precios/${cabinId}`)
};
