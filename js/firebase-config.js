// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4",
    authDomain: "casaverdecanas-199.firebaseapp.com",
    databaseURL: "https://casaverdecanas-199-default-rtdb.firebaseio.com",
    projectId: "casaverdecanas-199",
    storageBucket: "casaverdecanas-199.firebasestorage.app",
    messagingSenderId: "417825635316",
    appId: "1:417825635316:web:ff7f4fe52edcab43d8d7a1"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Ruta base para los datos (siteData)
const DB_PATH = 'siteData';