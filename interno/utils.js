// ============================================================
//  utils.js — Casa Verde Canas  v4.11 (puente de compatibilidad)
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.11:
//  - Nuevo "Análisis de gastos" (analisis-gastos.html) en la capa Reportar
//    del menú admin (solo-admin). Resumen de gastos por categoría con
//    filtro de año/mes y país, con detalle desplegable por categoría.
//
//  CAMBIOS v4.10:
//  - [RESTAURADO] subirComprobante(file, carpeta, docId) y abrirComprobante(url),
//    que las páginas vivas (pagos/gastos/informes-airbnb) invocan desde CVC
//    y que la reconstrucción había perdido. Subida a Cloudinary sin firma
//    (preset-comprobantes). abrirComprobante también queda en window para
//    los onclick. Esto repara la subida de comprobantes del admin.
//
//  CAMBIOS v4.9:
//  - Nuevo módulo Comunicación (comunicacion.html) agregado a la nav de
//    ambos roles. Hilos con audiencia, prioridad (semáforo), referencia
//    a secciones del sitio, no-leídos y mensajes. Sugerencias = filtro.
//
//  CAMBIOS v4.8:
//  - Nav del colaborador: agregado "Gastos" (gastos-mantenimiento.html)
//    para registro de gastos de mantenimiento con foto IA / manual y
//    lógica de reembolso (genera honorario tipo 'reembolso' si paga
//    con fondos propios).
//  - PENDIENTE: restaurar CVC.subirComprobante / abrirComprobante, que
//    las páginas vivas (pagos/gastos/informes-airbnb) invocan desde CVC
//    pero faltan en esta reconstrucción. Requiere el utils.js del servidor.
//
//  CAMBIOS v4.7:
//  - Nav del colaborador ampliada: Inicio, Tareas, Pendientes, Reservas,
//    Presupuestos, Calendario, Mis cobros, Manual (antes solo 3 items).
//  - [NUEVO] CVC.puede(seccion, rol): control de acceso centralizado.
//    Secciones solo-admin: fiscal, cuentas, movimientos, BTG, panel
//    financiero, categorías, pagos, informes, gastos, config y gestión.
//
//  CAMBIOS v4.6:
//  - Nav Finanzas en 3 capas: Registrar (ingresos/gastos/honorarios),
//    Conciliar (cuentas/movimientos/BTG/categorías), Reportar (panel/informes).
//  - pagos.html dividida en pagos + gastos + honorarios. 'Mis cobros' -> honorarios.html
//  CAMBIOS v4.5:
//  - [NUEVO] Integración pendientes ↔ tareas: al finalizar o verificar una
//            tarea vinculada a un pendiente (campo pendienteId), el pendiente
//            se marca automáticamente como realizado, sin importar desde qué
//            pantalla se finalice.
//
//  CAMBIOS v4.4:
//  - [CRÍTICO] Restaurado el sistema completo de cronómetros de tareas:
//              iniciarTarea/pausarTarea/finalizarTarea/verificarTarea ahora
//              manejan sesiones (subcolección), sesionesActivas (array),
//              reparto proporcional de honorarios y registro en
//              historial_tareas + honorarios. finalizarTarea retorna el
//              array de colaboradores que espera tareas.html.
//              Las tareas "huérfanas" (iniciadas con la versión anterior,
//              sin sesiones) se pueden finalizar igual — autosanado.
//              Las tareas recurrentes se reprograman automáticamente.
//
//  CAMBIOS v4.3 (sobre la base estable v4.2):
//  - [CRÍTICO] verificarAuth() ahora retorna Promise<{user, userData}>
//              compatible con el patrón moderno de las páginas:
//              const { user, userData } = await CVC.verificarAuth(roles)
//              · Lee el campo correcto "rol" (v4.2 leía "role" — inexistente)
//              · Verifica activo === false
//              · Timeout de seguridad 15s — nunca queda colgado
//              · Redirige a index.html (que decide login o dashboard)
//  - [NUEVO]  showEmpty() y showError() — las páginas las requieren
//  - [NUEVO]  Sistema de ayuda contextual: initAyuda, mostrarAyuda,
//             mostrarCelula, AYUDA_ITEMS — lee células de config/ayuda
//             (campos planos "celulas.x.y"). Si falla, no bloquea nada.
//  - [FIX]    showToast() usa las clases reales de design-system.css
//  - [FIX]    badgeEstado() acepta un solo argumento (estado) — firma dual
//  - [FIX]    formatHoras() acepta número decimal de horas — firma dual
//  - [FIX]    urgenciaTarea(t) calcula {color,label} para el dashboard
//             — firma dual (mantiene el modo legacy id+boolean)
//  - [NAV]    Menús restaurados a las páginas reales del sistema
//  - [NOTA]   sincronizarDesdeGCal es stub informativo — pendiente de
//             restaurar la sincronización real con Google Calendar
//
//  REGLAS DEL PROYECTO RESPETADAS:
//  - Sin template literals (backticks) — solo concatenación
//  - Un solo window.CVC al final
//  - db.settings() una sola vez (fix Firefox WebChannel)
// ============================================================


// ── FIREBASE ──────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey:     'AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4',
    authDomain: 'casaverdecanas-199.firebaseapp.com',
    projectId:  'casaverdecanas-199'
};
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
db.settings({ experimentalForceLongPolling: true, merge: true });
const auth = firebase.auth();


// ── CONSTANTES ────────────────────────────────────────────────────────────────
const ESTADOS_RESERVA = {
    pendiente:     { label: 'Pendiente',  cssClass: 'badge-pendiente'  },
    confirmada:    { label: 'Confirmada', cssClass: 'badge-confirmada' },
    airbnb_activa: { label: 'Airbnb',     cssClass: 'badge-confirmada' },
    anulada:       { label: 'Anulada',    cssClass: 'badge-anulada'    },
    finalizada:    { label: 'Finalizada', cssClass: 'badge-finalizada' }
};

const ESTADOS_TAREA = {
    pendiente:  { label: 'Pendiente',  cssClass: 'badge-pendiente'  },
    en_curso:   { label: 'En curso',   cssClass: 'badge-en_curso'   },
    pausada:    { label: 'Pausada',    cssClass: 'badge-neutral'    },
    finalizada: { label: 'Finalizada', cssClass: 'badge-completada' }
};

const PRIORIDADES = {
    alta:  { label: 'Alta',  cssClass: 'badge-alta'  },
    media: { label: 'Media', cssClass: 'badge-media' },
    baja:  { label: 'Baja',  cssClass: 'badge-baja'  }
};

// Estados que bloquean disponibilidad en el calendario público
// NOTA: "pendiente" NO bloquea — solo las confirmadas reales
const ESTADOS_BLOQUEANTES = ['confirmada', 'airbnb_activa'];

const CALENDAR_IDS = {
    1: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com',
    2: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com',
    3: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com'
};


// ── MENÚS DE NAVEGACIÓN ───────────────────────────────────────────────────────
const NAV_ADMIN_ITEMS = [

    // Items directos
    { href: 'dashboard.html',  icon: 'dashboard',      label: 'Dashboard'  },
    { href: 'calendario.html', icon: 'calendar_month', label: 'Calendario' },
    { href: 'comunicacion.html', icon: 'forum',        label: 'Comunicación' },

    // Grupo: Reservas
    {
        group: 'Reservas',
        icon:  'event',
        items: [
            { href: 'reservas.html',     icon: 'event',         label: 'Reservas'     },
            { href: 'presupuestos.html', icon: 'request_quote', label: 'Presupuestos' },
            { href: 'clientes.html',     icon: 'people',        label: 'Clientes'     }
        ]
    },

    // Grupo: Finanzas
    {
        group: 'Finanzas',
        icon:  'payments',
        items: [
            { href: 'pagos.html',            icon: 'trending_up',     label: 'Ingresos reservas'  },
            { href: 'gastos.html',           icon: 'trending_down',   label: 'Gastos y retiros'   },
            { href: 'honorarios.html',       icon: 'engineering',     label: 'Honorarios'         },
            { sep: true },
            { href: 'cuentas.html',          icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',      icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'herramientas-btg.html', icon: 'compare_arrows',  label: 'BTG / Conciliación' },
            { href: 'categorias.html',       icon: 'label',           label: 'Categorías'         },
            { href: 'destinos.html',         icon: 'flag',            label: 'Destinos'           },
            { sep: true },
            { href: 'panel-financiero.html', icon: 'monitoring',      label: 'Panel financiero'   },
            { href: 'analisis-gastos.html',  icon: 'insights',        label: 'Análisis de gastos' },
            { href: 'informes-airbnb.html',  icon: 'summarize',       label: 'Informes Airbnb'    }
        ]
    },

    // Grupo: Operaciones
    {
        group: 'Operaciones',
        icon:  'checklist',
        items: [
            { href: 'tareas.html',         icon: 'checklist',            label: 'Tareas'             },
            { href: 'tareas-admin.html',   icon: 'admin_panel_settings', label: 'Gestión tareas'     },
            { href: 'pendientes.html',     icon: 'playlist_add_check',   label: 'Pendientes'         },
            { sep: true },
            { href: 'limpieza-stats.html', icon: 'cleaning_services',    label: 'Análisis limpiezas' }
        ]
    },

    // Grupo: Fiscal
    {
        group: 'Fiscal',
        icon:  'receipt',
        items: [
            { href: 'fiscal.html',          icon: 'receipt',        label: 'Panel fiscal'    },
            { href: 'acceso-contador.html', icon: 'person_outline', label: 'Acceso contador' }
        ]
    },

    // Grupo: Configuración
    {
        group: 'Config.',
        icon:  'settings',
        items: [
            { href: 'cabanas-admin.html',  icon: 'cottage',         label: 'Cabañas'  },
            { href: 'usuarios.html',       icon: 'manage_accounts', label: 'Usuarios' },
            { href: 'notificaciones.html', icon: 'notifications',   label: 'Notificaciones' },
            { sep: true },
            { href: 'manual-sistema.html', icon: 'menu_book',       label: 'Manual'   }
        ]
    }
];

const NAV_USER_ITEMS = [
    { href: 'dashboard.html',      icon: 'dashboard',          label: 'Inicio'       },
    { href: 'tareas.html',         icon: 'checklist',          label: 'Tareas'       },
    { href: 'pendientes.html',     icon: 'playlist_add_check', label: 'Pendientes'   },
    { href: 'reservas.html',       icon: 'event',              label: 'Reservas'     },
    { href: 'presupuestos.html',   icon: 'request_quote',      label: 'Presupuestos' },
    { href: 'calendario.html',     icon: 'calendar_month',     label: 'Calendario'   },
    { href: 'gastos-mantenimiento.html', icon: 'receipt_long',  label: 'Gastos'       },
    { href: 'comunicacion.html',   icon: 'forum',              label: 'Comunicación' },
    { href: 'honorarios.html',     icon: 'payments',           label: 'Mis cobros'   },
    { href: 'notificaciones.html', icon: 'notifications',       label: 'Notificaciones' },
    { href: 'manual-sistema.html', icon: 'menu_book',          label: 'Manual'       }
];

// ============================================================
//  PERMISOS POR ROL  (v4.7)
//  Punto único de control de acceso por sección. Cada página ya
//  valida con verificarAuth(); este mapa centraliza qué ve cada
//  rol para construir la nav y los accesos del dashboard.
//  Uso:  CVC.puede('fiscal', userData.rol)  ->  true | false
// ============================================================
var SECCIONES_SOLO_ADMIN = [
    'panel-financiero', 'fiscal', 'cuentas', 'movimientos',
    'herramientas-btg', 'categorias', 'pagos', 'informes-airbnb',
    'acceso-contador', 'cabanas-admin', 'usuarios', 'tareas-admin', 'gastos',
    'analisis-gastos'
];
function puede(seccion, rol) {
    rol = rol || 'admin';
    if (rol === 'admin') return true;
    var s = (seccion || '').replace('.html', '');
    return SECCIONES_SOLO_ADMIN.indexOf(s) === -1;
}


// ── AUXILIARES DE INTERFAZ (BADGES) ──────────────────────────────────────────
// Firma dual:
//   badgeEstado(estado)         ← moderno (lo que usan las páginas)
//   badgeEstado(tipo, estado)   ← legacy v4.2 (compatibilidad)
function badgeEstado(a, b) {
    const key = (b !== undefined && b !== null) ? b : a;
    const e = ESTADOS_RESERVA[key] || ESTADOS_TAREA[key] || { label: key, cssClass: 'badge-neutral' };
    return '<span class="badge ' + e.cssClass + '">' + e.label + '</span>';
}

function badgePrioridad(prioridad) {
    const p = PRIORIDADES[prioridad] || { label: prioridad, cssClass: 'badge-neutral' };
    return '<span class="badge ' + p.cssClass + '">' + p.label + '</span>';
}


// ── SEGURIDAD Y AUTENTICACIÓN ────────────────────────────────────────────────
// CORREGIDO v4.3: retorna Promise<{user, userData}> — patrón moderno.
// Uso en las páginas:
//   const { user, userData } = await CVC.verificarAuth(['admin','user']);
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise(function(resolve, reject) {

        // Timeout de seguridad: si Firebase no responde en 15s, rechazar
        // para que la página pueda mostrar un error en vez de quedar colgada.
        const timer = setTimeout(function() {
            reject(new Error('Firebase no responde (timeout). Verificá tu conexión.'));
        }, 15000);

        auth.onAuthStateChanged(function(user) {
            clearTimeout(timer);

            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            db.collection('usuarios').doc(user.uid).get()
                .then(function(userDoc) {
                    if (!userDoc.exists) {
                        auth.signOut().then(function() {
                            window.location.href = 'index.html';
                        }).catch(function() {
                            window.location.href = 'index.html';
                        });
                        return;
                    }

                    const userData = userDoc.data();

                    // Solo bloquea si activo === false explícitamente
                    if (userData.activo === false) {
                        auth.signOut().then(function() {
                            window.location.href = 'index.html';
                        }).catch(function() {
                            window.location.href = 'index.html';
                        });
                        return;
                    }

                    // Campo correcto: "rol" (NO "role")
                    if (roles.indexOf(userData.rol) === -1) {
                        // Sin permiso para esta página → redirigir a su home
                        window.location.href = userData.rol === 'user' ? 'tareas.html' : 'dashboard.html';
                        return;
                    }

                    resolve({ user: user, userData: userData });
                })
                .catch(function(err) {
                    console.error('Error verificando usuario:', err);
                    reject(err);
                });
        });
    });
}

function cerrarSesion() {
    return auth.signOut().then(function() {
        window.location.href = 'index.html';
    }).catch(function() {
        window.location.href = 'index.html';
    });
}


// ── MOTOR DE PRECIOS Y DISPONIBILIDAD (base v4.2 — revisar con presupuestos) ─
function calcularPrecio(cabanaId, checkingStr, checkoutStr, callback) {
    if (!cabanaId || !checkingStr || !checkoutStr) return callback(0);

    const p1 = db.collection('config_precios').doc(String(cabanaId)).get();
    const p2 = db.collection('config_precios').doc('global').get();

    Promise.all([p1, p2]).then(function(results) {
        const resCabana = results[0].exists ? results[0].data() : {};
        const resGlobal = results[1].exists ? results[1].data() : {};

        const ini = new Date(checkingStr + 'T12:00:00');
        const fin = new Date(checkoutStr + 'T12:00:00');
        let total = 0;

        for (let d = new Date(ini); d < fin; d.setDate(d.getDate() + 1)) {
            const yyyy = d.getFullYear();
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            const dd   = String(d.getDate()).padStart(2, '0');
            const iso  = yyyy + '-' + mm + '-' + dd;

            if (resCabana.fechasEspecificas && resCabana.fechasEspecificas[iso] !== undefined) {
                total += Number(resCabana.fechasEspecificas[iso]);
            } else if (resGlobal.fechasEspecificas && resGlobal.fechasEspecificas[iso] !== undefined) {
                total += Number(resGlobal.fechasEspecificas[iso]);
            } else {
                const diaSemana = d.getDay();
                if (diaSemana === 5 || diaSemana === 6) {
                    total += Number(resCabana.precioFinde || resGlobal.precioFinde || 0);
                } else {
                    total += Number(resCabana.precioBase || resGlobal.precioBase || 0);
                }
            }
        }
        callback(total);
    }).catch(function(e) {
        console.error('Error calculando precio:', e);
        callback(0);
    });
}

function verificarDisponibilidadCabana(cabanaId, checkinStr, checkoutStr, reservaIdEditar, callback) {
    const ini = new Date(checkinStr + 'T00:00:00');
    const fin = new Date(checkoutStr + 'T23:59:59');

    db.collection('reservas')
      .where('caba', '==', Number(cabanaId))
      .where('estado', 'in', ESTADOS_BLOQUEANTES)
      .get()
      .then(function(snap) {
          let disponible = true;
          let reservaConflictiva = null;

          snap.forEach(function(doc) {
              if (reservaIdEditar && doc.id === reservaIdEditar) return;
              const data = doc.data();
              if (!data.checkIn || !data.checkOut) return;

              const rIni = data.checkIn.toDate();
              const rFin = data.checkOut.toDate();

              if (ini < rFin && fin > rIni) {
                  disponible = false;
                  reservaConflictiva = Object.assign({ id: doc.id }, data);
              }
          });
          callback(disponible, reservaConflictiva);
      })
      .catch(function(err) {
          console.error('Error verificando disponibilidad:', err);
          callback(false, null);
      });
}

function mensajeConflicto(reserva) {
    if (!reserva) return '';
    return 'Conflicto con Reserva de ' + (reserva.nombre || 'Huésped') +
           ' (' + formatFecha(reserva.checkIn) + ' al ' + formatFecha(reserva.checkOut) + ').';
}


// ── GESTIÓN AUTOMÁTICA DE LIMPIEZA ───────────────────────────────────────────
function crearTareaLimpieza(reservaId, reservaData) {
    if (!reservaData.checkOut) return;

    const checkOut = reservaData.checkOut.toDate ? reservaData.checkOut.toDate() : new Date(reservaData.checkOut);
    const tareaId  = 'limp-' + reservaId;

    db.collection('cabanas').doc(String(reservaData.caba)).get().then(function(cDoc) {
        const cData = cDoc.exists ? cDoc.data() : {};
        const nombreCabana = (cData.nombre && cData.nombre.es) ? cData.nombre.es
                           : (cData.nombre || ('Cabaña ' + reservaData.caba));

        db.collection('tareas').doc(tareaId).set({
            tipo:        'limpieza',
            nombre:      'Limpieza Check-Out — ' + nombreCabana,
            titulo:      'Limpieza Check-Out — ' + nombreCabana,
            cabana:      reservaData.caba,
            reservaId:   reservaId,
            estado:      'pendiente',
            prioridad:   'media',
            fechaInicio: checkOut.toISOString().split('T')[0],
            descripcion: 'Limpieza general por salida de ' + (reservaData.nombre || 'huésped') + '. ' + (reservaData.notas || ''),
            creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function() {
            console.log('Tarea de limpieza automatizada vinculada:', tareaId);
        }).catch(function(err) {
            console.error('Error al automatizar limpieza:', err);
        });
    });
}


// ── SINCRONIZADOR DE CANALES ─────────────────────────────────────────────────
function sincronizarDisponibilidad() {
    console.log('Sincronizando iCal / Airbnb / Booking Channels...');
    return Promise.resolve({ procesados: 0, nuevos: 0 });
}

// PENDIENTE v4.3: la sincronización real con Google Calendar se restaurará
// en el próximo paso. Por ahora retorna un resultado informativo para que
// el botón del dashboard muestre un aviso claro en vez de fallar.
function sincronizarDesdeGCal(apiKey, cabanas) {
    console.log('sincronizarDesdeGCal: función pendiente de restaurar en esta versión puente.');
    return Promise.resolve({
        creadas: 0,
        canceladas: 0,
        error: 'Sincronización Airbnb temporalmente deshabilitada — se restaura en el próximo paso.'
    });
}


// ── FLUJO OPERATIVO DE TAREAS — Cronómetros y sesiones (v4.4) ───────────────
//
//  Modelo de datos:
//  tareas/{id}                → estado, monto, recurrencia, fechaInicio,
//                               sesionesActivas: [{ uid, nombre, inicio }]
//  tareas/{id}/sesiones/{sid} → { uid, nombre, inicio, fin, invalidada? }
//  historial_tareas           → un registro por cada finalización/verificación
//  honorarios                 → un doc 'pendiente' por colaborador con monto
//
//  NOTA Firestore: serverTimestamp() NO está permitido dentro de arrays,
//  por eso sesionesActivas usa Timestamp.now() (hora del dispositivo).

function _tsAhora() {
    return firebase.firestore.Timestamp.now();
}

function _aDateSeguro(v) {
    if (!v) return null;
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

function _sumarDiasISO(dias) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return f.toISOString().split('T')[0];
}

// Iniciar / Unirme a una tarea.
//   iniciarTarea(id, {uid, nombre})  ← moderno: abre sesión con cronómetro
//   iniciarTarea(id)                 ← legacy: solo cambia estado
async function iniciarTarea(tareaId, user) {
    if (!user || !user.uid) {
        return db.collection('tareas').doc(tareaId).update({ estado: 'en_curso' });
    }

    const ref  = db.collection('tareas').doc(tareaId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('La tarea no existe.');
    const t = snap.data();

    const activas = (t.sesionesActivas || []).slice();
    if (activas.some(function(s) { return s.uid === user.uid; })) {
        return; // ya tiene una sesión abierta — no duplicar
    }

    const ahora = _tsAhora();

    await ref.collection('sesiones').add({
        uid:    user.uid,
        nombre: user.nombre || '',
        inicio: ahora,
        fin:    null
    });

    activas.push({ uid: user.uid, nombre: user.nombre || '', inicio: ahora });

    await ref.update({
        estado: 'en_curso',
        sesionesActivas: activas
    });
}

// Pausar mi participación en una tarea.
//   pausarTarea(id, {uid, nombre})  ← moderno: cierra MI sesión
//   pausarTarea(id)                 ← legacy: pausa total
async function pausarTarea(tareaId, user) {
    const ref = db.collection('tareas').doc(tareaId);

    if (!user || !user.uid) {
        return ref.update({ estado: 'pendiente', sesionesActivas: [] });
    }

    const ahora = _tsAhora();

    // Cerrar mi sesión abierta en la subcolección
    const sesSnap = await ref.collection('sesiones').get();
    const batch = db.batch();
    let huboCierre = false;
    sesSnap.docs.forEach(function(d) {
        const s = d.data();
        const abierta = (s.fin === null || s.fin === undefined);
        if (abierta && s.uid === user.uid) {
            batch.update(d.ref, { fin: ahora });
            huboCierre = true;
        }
    });
    if (huboCierre) await batch.commit();

    // Quitarme del array de activos
    const snap = await ref.get();
    if (!snap.exists) return;
    const t = snap.data();
    const restantes = (t.sesionesActivas || []).filter(function(s) {
        return s.uid !== user.uid;
    });

    await ref.update({
        sesionesActivas: restantes,
        estado: restantes.length ? 'en_curso' : 'pendiente'
    });
}

// Cierra el ciclo de la tarea: si es recurrente la reprograma,
// si no, la marca finalizada. Limpia sesiones y sesionesActivas.
async function _cerrarCicloTarea(ref, t, sesDocs) {
    const recurrencia = parseInt(t.recurrencia, 10) || 0;

    // Limpiar la subcolección de sesiones para que el próximo ciclo
    // arranque en cero (el historial ya quedó en historial_tareas)
    if (sesDocs && sesDocs.length) {
        const batch = db.batch();
        sesDocs.forEach(function(d) { batch.delete(d.ref); });
        await batch.commit();
    }

    if (recurrencia > 0) {
        await ref.update({
            estado: 'pendiente',
            fechaInicio: _sumarDiasISO(recurrencia),
            sesionesActivas: []
        });
    } else {
        await ref.update({
            estado: 'finalizada',
            sesionesActivas: [],
            finalizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

// Finalizar tarea con cálculo de honorarios proporcionales.
// Retorna el array de colaboradores: [{ uid, nombre, horas, montoRecibido }]
// — formato que espera tareas.html.
// Si la tarea no tiene sesiones (huérfana de versiones anteriores),
// se finaliza igual con colaboradores = [] — autosanado.
async function finalizarTarea(tareaId, user) {
    user = user || {};
    const ref  = db.collection('tareas').doc(tareaId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('La tarea no existe.');
    const t = snap.data();

    const ahora = _tsAhora();

    // 1. Leer sesiones y cerrar las que quedaron abiertas
    const sesSnap = await ref.collection('sesiones').get();
    const batchCierre = db.batch();
    let huboAbiertas = false;
    sesSnap.docs.forEach(function(d) {
        const s = d.data();
        if (s.fin === null || s.fin === undefined) {
            batchCierre.update(d.ref, { fin: ahora });
            huboAbiertas = true;
        }
    });
    if (huboAbiertas) await batchCierre.commit();

    // 2. Calcular horas por colaborador (solo sesiones válidas)
    const porUid = {};
    sesSnap.docs.forEach(function(d) {
        const s = d.data();
        if (s.invalidada) return;
        const ini = _aDateSeguro(s.inicio);
        const fin = _aDateSeguro(s.fin) || _aDateSeguro(ahora);
        if (!ini || !fin) return;
        const horas = Math.max(0, (fin - ini) / 3600000);
        if (!porUid[s.uid]) porUid[s.uid] = { uid: s.uid, nombre: s.nombre || '', horas: 0 };
        porUid[s.uid].horas += horas;
    });

    const lista      = Object.keys(porUid).map(function(k) { return porUid[k]; });
    const totalHoras = lista.reduce(function(sum, c) { return sum + c.horas; }, 0);
    const montoTarea = t.monto || 0;

    // 3. Reparto proporcional al tiempo trabajado
    const colaboradores = lista.map(function(c) {
        const proporcion = totalHoras > 0 ? (c.horas / totalHoras) : 0;
        return {
            uid:           c.uid,
            nombre:        c.nombre,
            horas:         Math.round(c.horas * 100) / 100,
            montoRecibido: Math.round(montoTarea * proporcion * 100) / 100
        };
    });
    const montoAsignado = colaboradores.reduce(function(s, c) { return s + c.montoRecibido; }, 0);

    // 4. Precio de limpieza cobrado al cliente (best effort, no bloquea)
    let costoLimpiezaBRL = 0;
    if (t.reservaId) {
        try {
            const rSnap = await db.collection('reservas').doc(t.reservaId).get();
            if (rSnap.exists) costoLimpiezaBRL = rSnap.data().costoLimpiezaBRL || 0;
        } catch (e) { /* sin bloqueo */ }
    }

    // 5. Registro en historial_tareas (alimenta limpieza-stats)
    await db.collection('historial_tareas').add({
        tareaId:          tareaId,
        nombre:           t.nombre || '',
        tipo:             t.tipo || 'general',
        cabana:           (t.cabana !== undefined && t.cabana !== null) ? t.cabana : null,
        tipoRegistro:     'finalizada',
        totalHoras:       Math.round(totalHoras * 100) / 100,
        monto:            Math.round(montoAsignado * 100) / 100,
        costoLimpiezaBRL: costoLimpiezaBRL,
        colaboradores:    colaboradores,
        finalizadoEn:     firebase.firestore.FieldValue.serverTimestamp(),
        finalizadoNombre: user.nombre || '',
        finalizadoPor:    user.uid || null
    });

    // 6. Crear honorarios pendientes (los ve pagos.html → Honorarios)
    for (let i = 0; i < colaboradores.length; i++) {
        const c = colaboradores[i];
        if (c.montoRecibido <= 0) continue;
        await db.collection('honorarios').add({
            uid:      c.uid,
            nombre:   c.nombre,
            tareaId:  tareaId,
            concepto: t.nombre || 'Tarea',
            horas:    c.horas,
            monto:    c.montoRecibido,
            estado:   'pendiente',
            creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // 7. Reprogramar (si es recurrente) o finalizar
    await _cerrarCicloTarea(ref, t, sesSnap.docs);

    // 8. Si la tarea está vinculada a un pendiente, marcarlo realizado
    if (t.pendienteId) {
        try {
            await db.collection('pendientes').doc(t.pendienteId).update({
                realizado:    true,
                realizadoPor: user.nombre || '',
                realizadoUid: user.uid || null,
                realizadoEn:  firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { /* sin bloqueo */ }
    }

    return colaboradores;
}

// Verificar tarea ("OK / No era necesaria").
//   verificarTarea(id, {uid, nombre}, nota)  ← moderno: registra en historial
//   verificarTarea(id, true/false, notas)    ← legacy: solo cambia estado
async function verificarTarea(tareaId, b, nota) {
    if (typeof b === 'boolean') {
        return db.collection('tareas').doc(tareaId).update({
            estado: b ? 'finalizada' : 'pendiente',
            notasSupervisor: nota || ''
        });
    }

    const user = b || {};
    const ref  = db.collection('tareas').doc(tareaId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('La tarea no existe.');
    const t = snap.data();

    const sesSnap = await ref.collection('sesiones').get();

    await db.collection('historial_tareas').add({
        tareaId:          tareaId,
        nombre:           t.nombre || '',
        tipo:             t.tipo || 'general',
        cabana:           (t.cabana !== undefined && t.cabana !== null) ? t.cabana : null,
        tipoRegistro:     'verificada',
        nota:             nota || '',
        totalHoras:       0,
        monto:            0,
        colaboradores:    [],
        finalizadoEn:     firebase.firestore.FieldValue.serverTimestamp(),
        finalizadoNombre: user.nombre || '',
        finalizadoPor:    user.uid || null
    });

    await _cerrarCicloTarea(ref, t, sesSnap.docs);

    // Si está vinculada a un pendiente, marcarlo realizado también
    if (t.pendienteId) {
        try {
            await db.collection('pendientes').doc(t.pendienteId).update({
                realizado:    true,
                realizadoPor: user.nombre || '',
                realizadoUid: user.uid || null,
                realizadoEn:  firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { /* sin bloqueo */ }
    }
}

// Firma dual:
//   urgenciaTarea(tareaObjeto)        ← moderno: retorna { color, label }
//                                       color: 'rojo' | 'amarillo' | 'verde' | 'gris'
//   urgenciaTarea(id, esUrgente)      ← legacy v4.2: actualiza prioridad en DB
function urgenciaTarea(t, esUrgente) {
    // Modo legacy: primer argumento es un id (string)
    if (typeof t === 'string') {
        return db.collection('tareas').doc(t).update({
            prioridad: esUrgente ? 'alta' : 'media'
        });
    }

    // Modo moderno: cálculo de urgencia para dashboard / listados
    if (!t || !t.fechaInicio) return { color: 'gris', label: 'Sin fecha' };

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const f = new Date(String(t.fechaInicio).slice(0, 10) + 'T00:00:00');
    if (isNaN(f.getTime())) return { color: 'gris', label: 'Sin fecha' };

    const dias  = Math.round((hoy - f) / 86400000);
    const ciclo = parseInt(t.recurrenciaDias || t.recurrencia || 0, 10) || 0;

    if (dias < 0)  return { color: 'verde',    label: 'En ' + Math.abs(dias) + 'd' };
    if (dias === 0) return { color: 'amarillo', label: 'Hoy' };

    // Con recurrencia definida: rojo si superó el ciclo
    if (ciclo > 0) {
        if (dias > ciclo) return { color: 'rojo', label: 'Atraso ' + dias + 'd' };
        return { color: 'amarillo', label: 'Hace ' + dias + 'd' };
    }

    // Sin recurrencia: rojo a partir de 7 días de atraso
    if (dias > 7) return { color: 'rojo', label: 'Atraso ' + dias + 'd' };
    return { color: 'amarillo', label: 'Hace ' + dias + 'd' };
}

function getHistorialTareas(cabanaId, callback) {
    db.collection('tareas')
      .where('cabana', '==', Number(cabanaId))
      .orderBy('creadoEn', 'desc')
      .limit(20)
      .get()
      .then(function(snap) {
          const arr = [];
          snap.forEach(function(d) { arr.push(Object.assign({ id: d.id }, d.data())); });
          callback(arr);
      });
}


// ── MOTOR DE CONCILIACIÓN BANCARIA ───────────────────────────────────────────
const BTG_CATEGORIAS = [
    'Alquiler / Ingresos', 'Servicios', 'Mantenimiento', 'Limpieza',
    'Insumos', 'Impuestos', 'Honorarios', 'Transferencias propias',
    'Personal / Retiro', 'Otros'
];

const _BTG_REGLAS = [
    { cat: 'Alquiler / Ingresos',     labels: ['reserva', 'airbnb', 'booking', 'estadia', 'aluguel'] },
    { cat: 'Servicios',               labels: ['celesc', 'casan', 'internet', 'luz', 'agua', 'claro', 'vivo', 'tim'] },
    { cat: 'Mantenimiento',           labels: ['ferreteria', 'ferragem', 'madeira', 'material', 'construcao', 'tinta'] },
    { cat: 'Limpieza',                labels: ['lavanderia', 'limpeza', 'cloro', 'limpiador', 'produtos'] },
    { cat: 'Impuestos',               labels: ['darf', 'iptu', 'receita', 'prefeitura', 'tributo'] },
    { cat: 'Honorarios',              labels: ['honorario', 'diarista', 'jardineiro', 'jardin'] },
    { cat: 'Transferencias propias',  labels: ['transferencia propia', 'entre cuentas'] }
];

// Retorna { cat, etiqueta } — formato que espera herramientas-btg.html
function inferirCategoria(concepto) {
    if (!concepto) return { cat: '', etiqueta: '' };
    const txt = String(concepto).toLowerCase();
    for (let i = 0; i < _BTG_REGLAS.length; i++) {
        const regla = _BTG_REGLAS[i];
        for (let j = 0; j < regla.labels.length; j++) {
            if (txt.indexOf(regla.labels[j]) !== -1) {
                return { cat: regla.cat, etiqueta: regla.labels[j] };
            }
        }
    }
    return { cat: '', etiqueta: '' };
}

// fingerprint(fecha, monto, descripcion) o fingerprint(objetoMovimiento)
function fingerprintMovimiento(a, b, c) {
    let f, m, d;
    if (typeof a === 'object' && a !== null) {
        f = a.fecha || ''; m = String(a.monto || 0); d = a.descripcion || a.concepto || '';
    } else {
        f = a || ''; m = String(b || 0); d = c || '';
    }
    let hash = 0;
    const str = f + '_' + m + '_' + d;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return 'fp_' + Math.abs(hash);
}

// Concilia movimientos parseados contra los ya existentes en Firestore.
// Retorna los mismos movimientos con estado: 'nuevo' | 'duplicado' | 'posible_duplicado'
// — formato que espera herramientas-btg.html
async function conciliarMovimientos(movsParseados, cuentaId) {
    const snap = await db.collection('movimientos')
        .where('cuentaId', '==', cuentaId)
        .get();
    const existentes = snap.docs.map(function(doc) { return doc.data(); });

    return movsParseados.map(function(m) {
        let estado = 'nuevo';
        for (let i = 0; i < existentes.length; i++) {
            const e = existentes[i];
            const mismaFecha = e.fecha === m.fecha;
            const mismoMonto = Math.abs((e.monto || 0) - m.monto) < 0.01;
            if (mismaFecha && mismoMonto) {
                const d1 = String(e.descripcion || '').slice(0, 15);
                const d2 = String(m.descripcion || '').slice(0, 15);
                estado = (d1 === d2) ? 'duplicado' : 'posible_duplicado';
                if (estado === 'duplicado') break;
            }
        }
        return Object.assign({}, m, {
            estado: estado,
            fingerprint: fingerprintMovimiento(m.fecha, m.monto, m.descripcion)
        });
    });
}

// Importa los movimientos seleccionados a la colección 'movimientos'.
// opts = { cuentaId, moneda, importadoPor }
// Retorna { importados, saltados } — formato que espera herramientas-btg.html
async function importarMovimientosConfirmados(seleccionados, opts) {
    opts = opts || {};
    let importados = 0;
    let saltados = 0;

    const CHUNK = 400;
    for (let i = 0; i < seleccionados.length; i += CHUNK) {
        const batch = db.batch();
        const slice = seleccionados.slice(i, i + CHUNK);

        slice.forEach(function(m) {
            if (m.estado === 'duplicado') { saltados++; return; }
            const ref = db.collection('movimientos').doc();
            batch.set(ref, {
                cuentaId:     opts.cuentaId || null,
                moneda:       opts.moneda || 'BRL',
                fecha:        m.fecha,
                descripcion:  m.descripcion,
                monto:        m.monto,
                tipo:         m.tipo || (m.monto >= 0 ? 'credito' : 'debito'),
                saldoPost:    (m.saldoPost !== undefined) ? m.saldoPost : null,
                categoriaId:  null,
                etiqueta:     '',
                reservaId:    null,
                tareaId:      null,
                fingerprint:  m.fingerprint || fingerprintMovimiento(m.fecha, m.monto, m.descripcion),
                importadoEn:  firebase.firestore.FieldValue.serverTimestamp(),
                importadoPor: opts.importadoPor || null
            });
            importados++;
        });
        await batch.commit();
    }

    return { importados: importados, saltados: saltados };
}

// Stubs legacy — mantenidos para no romper destructuraciones antiguas
function matchMovimientoBancario() { return null; }
function conciliarContraRegistros() { return Promise.resolve(); }
function guardarConciliacion() { return Promise.resolve(); }
function cargarConfigConciliacion() { return Promise.resolve({}); }


// ── NAV CENTRALIZADA ──────────────────────────────────────────────────────────
function renderNav(paginaActiva, rol) {
    rol = rol || 'admin';
    const el = document.getElementById('appNav') || document.querySelector('.admin-nav');
    if (!el) return;
    const items = rol === 'admin' ? NAV_ADMIN_ITEMS : NAV_USER_ITEMS;

    el.innerHTML = items.map(function(item, gi) {
        if (item.href) {
            const activo = item.href === paginaActiva;
            return '<a href="' + item.href + '" class="nav-item' + (activo ? ' active' : '') + '">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
        }
        if (item.group) {
            const grupoId     = 'navdrop-' + gi;
            const tieneActivo = (item.items || []).some(function(sub) {
                return sub.href && (sub.href === paginaActiva || (sub.href || '').replace('.html', '') === paginaActiva);
            });
            const panelItems = (item.items || []).map(function(sub) {
                if (sub.sep) return '<div class="nav-dropdown__sep"></div>';
                const esActivo = sub.href === paginaActiva || sub.href.replace('.html', '') === paginaActiva;
                return '<a href="' + sub.href + '" class="nav-dropdown__item' + (esActivo ? ' active' : '') + '">'
                    + '<span class="material-icons">' + sub.icon + '</span> ' + sub.label + '</a>';
            }).join('');

            return '<div class="nav-dropdown' + (tieneActivo ? ' has-active' : '') + '" id="' + grupoId + '">'
                + '<button class="nav-dropdown__trigger" onclick="toggleNavDrop(event,\'' + grupoId + '\')">'
                + '<span class="material-icons">' + item.icon + '</span> ' + item.group
                + '<span class="material-icons nav-arrow">expand_more</span>'
                + '</button>'
                + '<div class="nav-dropdown__panel">' + panelItems + '</div>'
                + '</div>';
        }
        return '';
    }).join('');

    document.removeEventListener('click', _cerrarDropdowns);
    document.addEventListener('click', _cerrarDropdowns);
}

function toggleNavDrop(e, id) {
    e.stopPropagation();

    const dropEl = document.getElementById(id);
    if (!dropEl) return;

    const estaAbierto = dropEl.classList.contains('open');

    // Cerrar todos los dropdowns abiertos
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.top = ''; p.style.left = ''; }
    });

    if (estaAbierto) return;

    // Posicionar el panel con fixed (escapa del overflow del nav)
    const trigger = dropEl.querySelector('.nav-dropdown__trigger');
    const rect    = trigger.getBoundingClientRect();
    const panel   = dropEl.querySelector('.nav-dropdown__panel');

    panel.style.top  = (rect.bottom + 2) + 'px';
    panel.style.left = rect.left + 'px';

    dropEl.classList.add('open');

    // Ajustar si se sale por la derecha de la pantalla
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - 8) {
        panel.style.left = (rect.right - panelRect.width) + 'px';
    }
}

function _cerrarDropdowns() {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) { p.style.top = ''; p.style.left = ''; }
    });
}

window.toggleNavDrop = toggleNavDrop;

// ============================================================
//  COMPROBANTES (Cloudinary, unsigned)  — restaurado en v4.10
//  Subida de imágenes/PDF de comprobantes y apertura para verlos.
//  cloud: dnwfu8ffn · preset sin firma: preset-comprobantes
// ============================================================
function subirComprobante(file, carpeta, docId) {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', 'preset-comprobantes');
    if (carpeta) fd.append('folder', carpeta);
    if (docId)   fd.append('tags', docId);
    return fetch('https://api.cloudinary.com/v1_1/dnwfu8ffn/auto/upload', { method: 'POST', body: fd })
        .then(function(r) {
            if (!r.ok) throw new Error('Cloudinary ' + r.status);
            return r.json();
        })
        .then(function(d) { return d.secure_url || d.url; });
}

function abrirComprobante(url) {
    if (!url) return;
    window.open(url, '_blank');
}

window.abrirComprobante = abrirComprobante;

// Menú "Cámara / Galería" para cargar una foto. Llama onPick(file).
// Usa inputs reales (uno con capture, otro sin) por compatibilidad con Safari viejo.
function elegirFuenteFoto(onPick) {
    var ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:4000;display:flex;align-items:flex-end;justify-content:center;');
    var card = document.createElement('div');
    card.setAttribute('style', 'background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:18px;');
    var title = document.createElement('div');
    title.setAttribute('style', 'font-weight:700;margin-bottom:14px;text-align:center;');
    title.textContent = 'Agregar foto';
    card.appendChild(title);
    function mkBtn(label, icon) {
        var b = document.createElement('button');
        b.setAttribute('style', 'display:flex;align-items:center;gap:12px;width:100%;border:1.5px solid #e0e0e0;background:#fff;border-radius:12px;padding:14px;font-size:16px;font-family:inherit;margin-bottom:10px;cursor:pointer;');
        var ic = document.createElement('span');
        ic.className = 'material-icons';
        ic.setAttribute('style', 'color:#2d5a27;');
        ic.textContent = icon;
        b.appendChild(ic);
        b.appendChild(document.createTextNode(' ' + label));
        return b;
    }
    var bCam = mkBtn('Cámara', 'photo_camera');
    var bGal = mkBtn('Galería / Archivos', 'photo_library');
    var bCan = mkBtn('Cancelar', 'close');
    card.appendChild(bCam); card.appendChild(bGal); card.appendChild(bCan);
    ov.appendChild(card);
    document.body.appendChild(ov);
    function cleanup() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function disparar(cam) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        if (cam) inp.setAttribute('capture', 'environment');
        inp.setAttribute('style', 'position:fixed;left:-9999px;');
        inp.onchange = function() {
            var f = inp.files && inp.files[0] ? inp.files[0] : null;
            cleanup();
            if (inp.parentNode) inp.parentNode.removeChild(inp);
            if (f && typeof onPick === 'function') onPick(f);
        };
        document.body.appendChild(inp);
        inp.click();
    }
    bCam.onclick = function() { disparar(true); };
    bGal.onclick = function() { disparar(false); };
    bCan.onclick = cleanup;
    ov.onclick = function(e) { if (e.target === ov) cleanup(); };
}

window.elegirFuenteFoto = elegirFuenteFoto;

// ============================================================
//  NOTIFICACIONES (email + WhatsApp)
// ============================================================
var NETLIFY_BASE = 'https://serene-scone-76bd4e.netlify.app/.netlify/functions';
var _ultimoWhatsApp = 0;

// WhatsApp vía la Netlify Function (CallMeBot). Gratis = máx 1 por minuto:
// un guard simple evita reintentos masivos / clicks repetidos.
function enviarWhatsApp(text, to) {
    var ahora = Date.now();
    if (ahora - _ultimoWhatsApp < 60000) {
        return Promise.resolve({ ok: false, error: 'rate', detalle: 'Esperá 1 minuto entre WhatsApps (límite del plan gratis).' });
    }
    _ultimoWhatsApp = ahora;
    return fetch(NETLIFY_BASE + '/notify-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, to: to || '' })
    }).then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: e.message }; });
}

// Email vía EmailJS (credenciales públicas por diseño; dominio en whitelist).
// Variables del template: enviar_a, nombre_remitente, asunto, mensaje (acepta HTML).
var EMAILJS = { serviceId: 'Mailcasaverde', templateId: 'template_txtqg87', publicKey: 'v9IeaS5cXuzPAKCXh' };
function enviarMail(asunto, mensaje, paraEmail, remitente) {
    if (!paraEmail) return Promise.resolve({ ok: false, error: 'El usuario no tiene email cargado.' });
    var params = {
        enviar_a: paraEmail,
        nombre_remitente: remitente || 'Casa Verde Canas',
        asunto: asunto || 'Aviso',
        mensaje: mensaje || ''
    };
    return fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: EMAILJS.serviceId, template_id: EMAILJS.templateId, user_id: EMAILJS.publicKey, template_params: params })
    }).then(function (r) {
        if (r.ok) return { ok: true, status: r.status };
        return r.text().then(function (t) { return { ok: false, status: r.status, error: (t || ('HTTP ' + r.status)) }; });
    }).catch(function (e) { return { ok: false, error: e.message }; });
}

// ---- Resumen diario por email -------------------------------
// Cada cambio importante se registra en resumenes/{YYYY-MM-DD}.
// Una vez por día (primer ingreso al sistema), se envía el resumen
// del día anterior a todos los usuarios. EmailJS para email; el
// WhatsApp queda para avisos instantáneos según preferencia.
function _hoyISO() { return new Date().toISOString().slice(0, 10); }

function registrarEvento(tipo, texto) {
    try {
        var fecha = _hoyISO();
        return firebase.firestore().collection('resumenes').doc(fecha).set({
            fecha: fecha,
            eventos: firebase.firestore.FieldValue.arrayUnion({ tipo: tipo, texto: texto, hora: new Date().toISOString() })
        }, { merge: true }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
}

function construirResumen(fecha) {
    var LABEL = { reserva: 'Reservas', pago: 'Pagos', comunicacion: 'Mensajes', limpieza: 'Limpiezas / tareas', presupuesto: 'Presupuestos', gasto: 'Gastos' };
    return firebase.firestore().collection('resumenes').doc(fecha).get().then(function (d) {
        if (!d.exists) return null;
        var evs = (d.data().eventos) || [];
        if (!evs.length) return null;
        var grupos = {};
        evs.forEach(function (e) { (grupos[e.tipo] = grupos[e.tipo] || []).push(e); });
        var html = '<div style="font-family:Arial,sans-serif;color:#2a2a2a;">' +
            '<h2 style="color:#2d5a27;">Resumen Casa Verde · ' + fecha + '</h2>';
        Object.keys(grupos).forEach(function (t) {
            html += '<h3 style="margin:14px 0 4px;">' + (LABEL[t] || t) + ' (' + grupos[t].length + ')</h3><ul style="margin:0;padding-left:18px;">';
            grupos[t].forEach(function (e) { html += '<li>' + (e.texto || '') + '</li>'; });
            html += '</ul>';
        });
        html += '<p style="color:#888;font-size:12px;margin-top:18px;">Notificación automática de casaverdecanas.com.br</p></div>';
        return { asunto: 'Resumen Casa Verde · ' + fecha + ' (' + evs.length + ' novedades)', html: html };
    });
}

// Lazy-cron: se llama al cargar el dashboard. Manda 1 vez por día.
function enviarResumenDiarioSiCorresponde() {
    var db = firebase.firestore();
    return db.collection('config').doc('notificaciones').get().then(function (doc) {
        var hoy = _hoyISO();
        var ultimo = (doc.exists && doc.data().ultimoResumen) ? doc.data().ultimoResumen : '';
        if (ultimo >= hoy) return;
        // Marcar primero para evitar doble envío si dos personas entran a la vez
        return db.collection('config').doc('notificaciones').set({ ultimoResumen: hoy }, { merge: true }).then(function () {
            var ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            return construirResumen(ayer).then(function (res) {
                if (!res) return;
                return db.collection('usuarios').get().then(function (snap) {
                    snap.forEach(function (u) {
                        var x = u.data();
                        if (x.email && (!x.notif || x.notif.canalEmail !== false)) {
                            enviarMail(res.asunto, res.html, x.email);
                        }
                    });
                });
            });
        });
    }).catch(function () {});
}

// Envía el resumen del día actual a un solo email (para probar).
function enviarResumenPrueba(email) {
    return construirResumen(_hoyISO()).then(function (res) {
        if (!res) return enviarMail('Resumen Casa Verde (prueba)', '<p>Hoy todavía no hay novedades registradas. El resumen real se arma con los cambios del día.</p>', email);
        return enviarMail(res.asunto + ' (prueba)', res.html, email);
    });
}

// Despachador: notifica a un usuario (uid) o a 'admins' según sus preferencias.
// evento: 'reserva' | 'pago' | 'comunicacion' | 'limpieza' | 'presupuesto' ...
// payload: { asunto, mensaje }
// Preferencias en usuarios/{uid}.notif = { <evento>:bool, canalEmail:bool, canalWhatsapp:bool }.
// Por defecto: eventos ON, email ON, WhatsApp OFF (hasta registrar el número).
function notificar(destino, evento, payload) {
    payload = payload || {};
    function paraUsuario(uid, data) {
        var n = data.notif || {};
        if (n[evento] === false) return;
        // El email se envía como resumen diario (no instantáneo). Acá solo WhatsApp.
        if (n.canalWhatsapp === true) {
            enviarWhatsApp(payload.mensaje || payload.asunto || '', uid);
        }
    }
    var db = firebase.firestore();
    if (destino === 'admins') {
        return db.collection('usuarios').get().then(function (snap) {
            snap.forEach(function (d) { var x = d.data(); if (x.rol === 'admin') paraUsuario(d.id, x); });
        }).catch(function () {});
    }
    return db.collection('usuarios').doc(destino).get().then(function (d) {
        if (d.exists) paraUsuario(d.id, d.data());
    }).catch(function () {});
}


// ── UTILS DE FORMATO Y ESCAPE ────────────────────────────────────────────────
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatFecha(timestamp) {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
}

function formatFechaHora(timestamp) {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return '—';
    const dd  = String(d.getDate()).padStart(2, '0');
    const mm  = String(d.getMonth() + 1).padStart(2, '0');
    const hh  = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + ' ' + hh + ':' + min + 'hs';
}

// Firma dual:
//   formatHoras(horasDecimal)        ← moderno: formatHoras(3.5) → "3h 30m"
//   formatHoras(tsInicio, tsFin)     ← legacy v4.2: diferencia entre timestamps
function formatHoras(a, b) {
    // Modo legacy: dos timestamps
    if (b !== undefined && b !== null) {
        if (!a) return '—';
        const t1 = a.toDate ? a.toDate() : new Date(a);
        const t2 = b.toDate ? b.toDate() : new Date(b);
        const difMs = t2 - t1;
        if (difMs < 0 || isNaN(difMs)) return '—';
        const totMinL = Math.floor(difMs / 60000);
        const hrsL  = Math.floor(totMinL / 60);
        const minsL = totMinL % 60;
        if (hrsL === 0) return minsL + ' min';
        return hrsL + 'h ' + minsL + 'm';
    }

    // Modo moderno: número decimal de horas
    const n = parseFloat(a);
    if (isNaN(n) || n < 0) return '—';
    const totMin = Math.round(n * 60);
    const hrs  = Math.floor(totMin / 60);
    const mins = totMin % 60;
    if (hrs === 0) return mins + ' min';
    if (mins === 0) return hrs + 'h';
    return hrs + 'h ' + mins + 'm';
}

function colorCabana(num) {
    const colores = {
        1: '#2ec4b6',
        2: '#e71d36',
        3: '#ff9f1c'
    };
    return colores[num] || '#6c757d';
}


// ── ESTADOS DE UI (loading / empty / error / toast) ─────────────────────────
function _resolverContainer(container) {
    if (!container) return null;
    return typeof container === 'string' ? document.querySelector(container) : container;
}

// Firma dual:
//   showLoading(container, mensaje)  ← moderno: renderiza state-loading
//   showLoading(true/false)          ← legacy: overlay global
function showLoading(container, mensaje) {
    if (typeof container === 'boolean') {
        let spin = document.getElementById('appGlobalSpinner');
        if (!spin && container) {
            spin = document.createElement('div');
            spin.id = 'appGlobalSpinner';
            spin.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.6);'
                + 'display:flex;align-items:center;justify-content:center;z-index:9000;';
            spin.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(spin);
        }
        if (spin) spin.style.display = container ? 'flex' : 'none';
        return;
    }
    const el = _resolverContainer(container);
    if (!el) return;
    el.innerHTML = '<div class="state-loading"><div class="spinner"></div>'
        + '<span>' + escapeHtml(mensaje || 'Cargando...') + '</span></div>';
}

function showEmpty(container, titulo, descripcion, icono) {
    const el = _resolverContainer(container);
    if (!el) return;
    el.innerHTML = '<div class="state-empty">'
        + '<span class="material-icons">' + (icono || 'inbox') + '</span>'
        + '<div class="state-empty__title">' + escapeHtml(titulo || 'Sin datos') + '</div>'
        + (descripcion ? '<div class="state-empty__desc">' + escapeHtml(descripcion) + '</div>' : '')
        + '</div>';
}

function showError(container, titulo, descripcion, onRetry) {
    const el = _resolverContainer(container);
    if (!el) return;
    const retryId = onRetry ? 'retry-' + Date.now() : null;
    el.innerHTML = '<div class="state-error"><span class="material-icons">error_outline</span>'
        + '<div class="state-error__title">' + escapeHtml(titulo || 'Error') + '</div>'
        + (descripcion ? '<div class="state-error__desc">' + escapeHtml(descripcion) + '</div>' : '')
        + (retryId ? '<button class="btn btn-secondary" id="' + retryId + '"><span class="material-icons">refresh</span> Reintentar</button>' : '')
        + '</div>';
    if (retryId) {
        const btn = document.getElementById(retryId);
        if (btn) btn.addEventListener('click', onRetry);
    }
}

function showToast(mensaje, tipo) {
    tipo = tipo || 'success';
    const iconos = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    let wrap = document.getElementById('cvc-toasts');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id        = 'cvc-toasts';
        wrap.className = 'toast-container';
        document.body.appendChild(wrap);
    }
    const toast     = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.innerHTML = '<span class="material-icons">' + (iconos[tipo] || 'info') + '</span>'
        + '<span>' + escapeHtml(mensaje) + '</span>';
    wrap.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3300);
}


// ── SISTEMA DE AYUDA CONTEXTUAL ──────────────────────────────────────────────
//  Lee las células desde config/ayuda en Firestore.
//  Las células están guardadas como campos PLANOS con notación de puntos:
//  "celulas.reservas.pagina" → { titulo, resumen, contenido, paginas, boton }
//
//  Todas las funciones de ayuda fallan en silencio: si Firestore no
//  responde o no hay células, la página sigue funcionando normal.

var AYUDA_ITEMS   = {};   // células agrupadas por página: { 'reservas.html': [cel, ...] }
var AYUDA_CELULAS = {};   // células por id: { 'reservas.pagina': cel }
var _ayudaPromise = null;

function _cargarAyudaFirestore() {
    if (_ayudaPromise) return _ayudaPromise;
    _ayudaPromise = db.collection('config').doc('ayuda').get()
        .then(function(snap) {
            if (!snap.exists) return;
            const data = snap.data();

            function registrarCelula(id, cel) {
                if (!cel || typeof cel !== 'object') return;
                AYUDA_CELULAS[id] = cel;
                (cel.paginas || []).forEach(function(p) {
                    if (!AYUDA_ITEMS[p]) AYUDA_ITEMS[p] = [];
                    AYUDA_ITEMS[p].push(Object.assign({ id: id }, cel));
                });
            }

            // Caso 1: campos planos "celulas.x.y"
            Object.keys(data).forEach(function(k) {
                if (k.indexOf('celulas.') !== 0) return;
                registrarCelula(k.slice(8), data[k]);
            });

            // Caso 2 (defensa): mapa anidado celulas: { x: { y: {...} } }
            if (data.celulas && typeof data.celulas === 'object') {
                Object.keys(data.celulas).forEach(function(grupo) {
                    const sub = data.celulas[grupo];
                    if (!sub || typeof sub !== 'object') return;
                    if (sub.titulo || sub.resumen) {
                        registrarCelula(grupo, sub);
                    } else {
                        Object.keys(sub).forEach(function(sk) {
                            registrarCelula(grupo + '.' + sk, sub[sk]);
                        });
                    }
                });
            }
        })
        .catch(function(e) {
            console.warn('Ayuda contextual no disponible:', e.message);
        });
    return _ayudaPromise;
}

function _crearPanelAyuda() {
    let overlay = document.getElementById('cvcAyudaOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'cvcAyudaOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,25,14,.45);'
        + 'z-index:9500;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = '<div id="cvcAyudaCard" style="background:#fff;width:100%;max-width:560px;'
        + 'max-height:75vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:20px;'
        + 'box-shadow:0 -8px 32px rgba(0,0,0,.2);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<strong id="cvcAyudaTitulo" style="font-size:16px;color:#1e3f1a;">Ayuda</strong>'
        + '<button onclick="CVC.cerrarAyuda()" style="border:none;background:none;cursor:pointer;'
        + 'font-size:22px;color:#8a9e88;line-height:1;">&times;</button>'
        + '</div>'
        + '<div id="cvcAyudaBody"></div>'
        + '</div>';
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) cerrarAyuda();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function _renderCelulasEnPanel(celulas, titulo) {
    const overlay = _crearPanelAyuda();
    document.getElementById('cvcAyudaTitulo').textContent = titulo || 'Ayuda';

    const body = document.getElementById('cvcAyudaBody');
    body.innerHTML = celulas.map(function(cel, i) {
        const detId = 'cvcAyudaDet' + i;
        let html = '<div style="border:1px solid #e0e6de;border-radius:10px;padding:14px;margin-bottom:10px;">'
            + '<div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#1a2e18;">'
            + escapeHtml(cel.titulo || 'Sección') + '</div>';
        if (cel.resumen) {
            html += '<div style="font-size:13px;color:#5a6e58;line-height:1.55;">'
                + escapeHtml(cel.resumen) + '</div>';
        }
        if (cel.contenido && String(cel.contenido).trim()) {
            html += '<button onclick="CVC._toggleAyudaDetalle(\'' + detId + '\', this)" '
                + 'style="margin-top:8px;border:1px solid #e0e6de;background:#f8faf7;border-radius:6px;'
                + 'padding:5px 12px;font-size:12px;cursor:pointer;color:#2d5a27;font-weight:600;">'
                + 'Ver pasos detallados</button>'
                + '<div id="' + detId + '" style="display:none;margin-top:10px;font-size:13px;'
                + 'color:#1a2e18;line-height:1.65;white-space:pre-line;border-top:1px solid #edf0ec;'
                + 'padding-top:10px;">' + escapeHtml(cel.contenido) + '</div>';
        }
        html += '</div>';
        return html;
    }).join('');

    overlay.style.display = 'flex';
}

function _toggleAyudaDetalle(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const abierto = el.style.display !== 'none';
    el.style.display = abierto ? 'none' : 'block';
    if (btn) btn.textContent = abierto ? 'Ver pasos detallados' : 'Ocultar detalle';
}

function initAyuda(paginaActual) {
    try {
        _cargarAyudaFirestore().then(function() {
            if (!AYUDA_ITEMS[paginaActual] || !AYUDA_ITEMS[paginaActual].length) return;
            if (document.getElementById('cvcAyudaFab')) return;

            const fab = document.createElement('button');
            fab.id = 'cvcAyudaFab';
            fab.title = 'Ayuda de esta página';
            fab.style.cssText = 'position:fixed;bottom:20px;right:20px;width:48px;height:48px;'
                + 'border-radius:50%;background:#2d5a27;color:#fff;border:none;cursor:pointer;'
                + 'font-size:20px;font-weight:700;box-shadow:0 4px 16px rgba(45,90,39,.35);'
                + 'z-index:997;font-family:inherit;';
            fab.textContent = '?';
            fab.onclick = function() { mostrarAyuda(paginaActual); };
            document.body.appendChild(fab);
        });
    } catch (e) {
        console.warn('initAyuda:', e.message);
    }
}

function mostrarAyuda(pagina) {
    _cargarAyudaFirestore().then(function() {
        const celulas = AYUDA_ITEMS[pagina];
        if (!celulas || !celulas.length) {
            showToast('No hay ayuda disponible para esta sección.', 'info');
            return;
        }
        _renderCelulasEnPanel(celulas, 'Ayuda — ' + pagina.replace('.html', ''));
    });
}

function mostrarCelula(celulaId) {
    _cargarAyudaFirestore().then(function() {
        const cel = AYUDA_CELULAS[celulaId];
        if (!cel) {
            showToast('No hay ayuda disponible para esta acción.', 'info');
            return;
        }
        _renderCelulasEnPanel([cel], cel.titulo || 'Ayuda');
    });
}

function cerrarAyuda() {
    const overlay = document.getElementById('cvcAyudaOverlay');
    if (overlay) overlay.style.display = 'none';
}

function cerrarCelula() {
    cerrarAyuda();
}


// ── EXPORTAR ──────────────────────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS, ESTADOS_BLOQUEANTES,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    SECCIONES_SOLO_ADMIN, puede,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    verificarDisponibilidadCabana,
    mensajeConflicto,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    sincronizarDesdeGCal,
    iniciarTarea, pausarTarea, finalizarTarea, verificarTarea, urgenciaTarea,
    getHistorialTareas,
    BTG_CATEGORIAS, inferirCategoria, fingerprintMovimiento,
    conciliarMovimientos, importarMovimientosConfirmados,
    matchMovimientoBancario, conciliarContraRegistros,
    guardarConciliacion, cargarConfigConciliacion,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    subirComprobante, abrirComprobante, elegirFuenteFoto,
    enviarWhatsApp, enviarMail, notificar,
    registrarEvento, enviarResumenDiarioSiCorresponde, enviarResumenPrueba,
    showLoading, showEmpty, showError, showToast,
    AYUDA_ITEMS, initAyuda, mostrarAyuda, cerrarAyuda,
    mostrarCelula, cerrarCelula,
    _toggleAyudaDetalle
};
