// firebase-config.js
// Configuración para el proyecto NUEVO: casaverdecanas-199

const firebaseConfig = {
  apiKey: "AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4",
  authDomain: "casaverdecanas-199.firebaseapp.com",
  databaseURL: "https://casaverdecanas-199-default-rtdb.firebaseio.com",
  projectId: "casaverdecanas-199",
  storageBucket: "casaverdecanas-199.firebasestorage.app",
  messagingSenderId: "417825635316",
  appId: "1:417825635316:web:ff7f4fe52edcab43d8d7a1"
};

// Inicializar Firebase SOLO UNA VEZ
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase inicializado con proyecto: casaverdecanas-199');
}

// Referencia a la base de datos
const db = firebase.database();

// Helper functions para acceder a nodos específicos
const FirebaseDB = {
  // Obtener todas las fotos
  getFotos: () => db.ref('fotos'),
  
  // Obtener fotos de una cabaña específica
  getFotosCabin: (cabinId) => db.ref(`fotos/${cabinId}`),
  
  // Obtener todas las reservas
  getReservas: () => db.ref('reservas'),
  
  // Obtener reservas de una cabaña específica
  getReservasCabin: (cabinId) => db.ref(`reservas/${cabinId}`),
  
  // Crear una nueva reserva
  crearReserva: (cabinId, reservaData) => {
    return db.ref(`reservas/${cabinId}`).push(reservaData);
  },
  
  // Eliminar una reserva
  eliminarReserva: (cabinId, reservaId) => {
    return db.ref(`reservas/${cabinId}/${reservaId}`).remove();
  },
  
  // Agregar una foto
  agregarFoto: (cabinId, fotoUrl) => {
    return db.ref(`fotos/${cabinId}`).push(fotoUrl);
  },
  
  // Eliminar una foto
  eliminarFoto: (cabinId, fotoId) => {
    return db.ref(`fotos/${cabinId}/${fotoId}`).remove();
  }
};
