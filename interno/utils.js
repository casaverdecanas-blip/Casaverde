// ============================================================
//  utils.js — Casa Verde Canas  v4.12
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.12:
//  - API key de Firebase movida a Firestore (config/integraciones.firebaseApiKey)
//    para evitar exposición en el repositorio público de GitHub.
//    Flujo: se lee apiKey de Firestore usando projectId+authDomain hardcodeados
//    (no son secretos), luego se reinicializa Firebase con la key real.
//  - Menú admin: agregado "Limpieza de datos" (limpieza-datos.html) en Config.
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
// Nota: la apiKey de Firebase para proyectos web es un identificador público
// por diseño — no es un secreto. No otorga acceso sin autenticación válida.
// El acceso real está controlado por las reglas de Firestore y Firebase Auth.
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
    { href: 'actividades.html', icon: 'account_tree',  label: 'Actividades' },
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
            { href: 'transferencias.html',   icon: 'swap_horiz',      label: 'Transferencias'     },
            { sep: true },
            { href: 'cuentas.html',          icon: 'account_balance', label: 'Cuentas'            },
            { href: 'movimientos.html',      icon: 'receipt_long',    label: 'Movimientos'        },
            { href: 'herramientas-btg.html', icon: 'compare_arrows',  label: 'BTG / Conciliación' },
            { href: 'categorias.html',       icon: 'label',           label: 'Categorías'         },
            { href: 'destinos.html',         icon: 'flag',            label: 'Destinos'           },
            { href: 'cotizaciones.html',     icon: 'currency_exchange', label: 'Cotizaciones'     },
            { sep: true },
            { href: 'panel-financiero.html', icon: 'monitoring',      label: 'Panel financiero'   },
            { href: 'analisis-gastos.html',  icon: 'insights',        label: 'Análisis de gastos' },
            { href: 'clasificacion-masiva.html', icon: 'auto_fix_high', label: 'Clasificación masiva' },
            { href: 'clasificacion-auto.html', icon: 'bolt', label: 'Clasificación automática' },
            { href: 'auditoria.html', icon: 'fact_check', label: 'Auditoría' },
            { href: 'proyeccion-anual.html', icon: 'query_stats',     label: 'Proyección anual'   },
            { href: 'informes-airbnb.html',  icon: 'summarize',       label: 'Informes Airbnb'    }
        ]
    },

    // Grupo: Operaciones
    {
        group: 'Operaciones',
        icon:  'checklist',
        items: [
            { href: 'temporada.html',      icon: 'wb_sunny',             label: 'Temporada'          },
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
            { href: 'contenido-sitio.html', icon: 'collections',      label: 'Contenido del sitio' },
            { href: 'usuarios.html',       icon: 'manage_accounts', label: 'Usuarios' },
            { href: 'notificaciones.html', icon: 'notifications',   label: 'Notificaciones' },
            { sep: true },
            { href: 'manual-sistema.html', icon: 'menu_book',       label: 'Manual'   },
            { sep: true },
            { href: 'limpieza-datos.html', icon: 'cleaning_services', label: 'Limpieza de datos' }
        ]
    }
];

const NAV_USER_ITEMS = [
    { href: 'dashboard.html',      icon: 'dashboard',          label: 'Inicio'       },
    { href: 'actividades.html',    icon: 'account_tree',       label: 'Actividades'  },
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
//  PERMISOS GRANULARES POR COLABORADOR  (v4.27)
//  CATALOGO_PERMISOS: herramientas que el admin puede habilitar
//  por usuario (clave = nombre de pagina sin .html).
//  ALWAYS_ALLOWED: lo minimo que cualquier usuario logueado ve,
//  para no quedar encerrado. NO incluye 'usuarios' ni
//  'limpieza-datos' (administracion sensible, solo admin).
//  _userDataActual: datos del usuario de la sesion actual,
//  usados por puede() y renderNav().
// ============================================================
var _userDataActual = null;
var ALWAYS_ALLOWED = ['dashboard', 'actividades', 'gastos-mantenimiento', 'notificaciones', 'manual-sistema'];
var CATALOGO_PERMISOS = [
    { grupo: 'Operación', icon: 'checklist', items: [
        { href: 'calendario.html',     icon: 'calendar_month',       label: 'Calendario' },
        { href: 'temporada.html',      icon: 'wb_sunny',             label: 'Temporada' },
        { href: 'limpieza-stats.html', icon: 'cleaning_services',    label: 'Análisis de limpiezas' },
        { href: 'comunicacion.html',   icon: 'forum',                label: 'Comunicación' }
    ]},
    { grupo: 'Reservas y clientes', icon: 'event', items: [
        { href: 'reservas.html',     icon: 'event',         label: 'Reservas' },
        { href: 'presupuestos.html', icon: 'request_quote', label: 'Presupuestos' },
        { href: 'clientes.html',     icon: 'people',        label: 'Clientes' }
    ]},
    { grupo: 'Finanzas', icon: 'payments', items: [
        { href: 'gastos-mantenimiento.html', icon: 'receipt_long',      label: 'Carga de gastos (colaborador)' },
        { href: 'gastos.html',               icon: 'trending_down',     label: 'Gastos y retiros' },
        { href: 'pagos.html',                icon: 'trending_up',       label: 'Ingresos de reservas' },
        { href: 'honorarios.html',           icon: 'engineering',       label: 'Honorarios / cobros' },
        { href: 'transferencias.html',       icon: 'swap_horiz',        label: 'Transferencias' },
        { href: 'cuentas.html',              icon: 'account_balance',   label: 'Cuentas' },
        { href: 'movimientos.html',          icon: 'receipt_long',      label: 'Movimientos' },
        { href: 'herramientas-btg.html',     icon: 'compare_arrows',    label: 'BTG / Conciliación' },
        { href: 'categorias.html',           icon: 'label',             label: 'Categorías' },
        { href: 'destinos.html',             icon: 'flag',              label: 'Destinos' },
        { href: 'cotizaciones.html',         icon: 'currency_exchange', label: 'Cotizaciones' },
        { href: 'panel-financiero.html',     icon: 'monitoring',        label: 'Panel financiero' },
        { href: 'analisis-gastos.html',      icon: 'insights',          label: 'Análisis de gastos' },
        { href: 'clasificacion-masiva.html', icon: 'auto_fix_high',     label: 'Clasificación masiva' },
        { href: 'clasificacion-auto.html',   icon: 'bolt',              label: 'Clasificación automática' },
        { href: 'auditoria.html',            icon: 'fact_check',        label: 'Auditoría' },
        { href: 'proyeccion-anual.html',     icon: 'query_stats',       label: 'Proyección anual' },
        { href: 'informes-airbnb.html',      icon: 'summarize',         label: 'Informes Airbnb' }
    ]},
    { grupo: 'Fiscal', icon: 'receipt', items: [
        { href: 'fiscal.html',          icon: 'receipt',        label: 'Panel fiscal' },
        { href: 'acceso-contador.html', icon: 'person_outline', label: 'Acceso contador' }
    ]},
    { grupo: 'Contenido del sitio', icon: 'collections', items: [
        { href: 'contenido-sitio.html', icon: 'collections', label: 'Contenido del sitio (cabañas y espacios)' }
    ]}
];

function construirNavColaborador() {
    var nav = [{ href: 'dashboard.html', icon: 'dashboard', label: 'Inicio' }, { href: 'actividades.html', icon: 'account_tree', label: 'Actividades' }];
    CATALOGO_PERMISOS.forEach(function(g) {
        var its = g.items.filter(function(x) { return puede(x.href); });
        if (its.length) nav.push({ group: g.grupo, icon: g.icon, items: its });
    });
    nav.push({ href: 'notificaciones.html', icon: 'notifications', label: 'Notificaciones' });
    nav.push({ href: 'manual-sistema.html', icon: 'menu_book', label: 'Manual' });
    return nav;
}

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
    'acceso-contador', 'contenido-sitio', 'usuarios', 'tareas-admin', 'gastos',
    'analisis-gastos', 'proyeccion-anual', 'cotizaciones', 'transferencias', 'clasificacion-masiva', 'temporada'
];
function puede(seccion, rol, permisos) {
    rol = rol || (_userDataActual && _userDataActual.rol) || 'admin';
    if (rol === 'admin') return true;
    var s = (seccion || '').replace('.html', '');
    if (ALWAYS_ALLOWED.indexOf(s) !== -1) return true;
    var ps = permisos || (_userDataActual && _userDataActual.permisos) || [];
    return ps.indexOf(s) !== -1;
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
                    _userDataActual = userData;

                    // Solo bloquea si activo === false explícitamente
                    if (userData.activo === false) {
                        auth.signOut().then(function() {
                            window.location.href = 'index.html';
                        }).catch(function() {
                            window.location.href = 'index.html';
                        });
                        return;
                    }

                    // ── Control de acceso ──
                    // El admin entra a TODO. Un colaborador entra si:
                    //   - es una página del mínimo permitido (ALWAYS_ALLOWED), o
                    //   - el admin le dio el permiso granular de esta página, o
                    //   - la página permite explícitamente su rol (verificarAuth([...,'user'])).
                    // El permiso granular manda por encima del rol fijo de la página,
                    // así una página marcada solo-admin se abre si el admin la habilitó.
                    if (userData.rol !== 'admin') {
                        var _pag = (window.location.pathname.split('/').pop() || '').replace('.html', '');
                        var _ps = userData.permisos || [];
                        var _permitido =
                            (!_pag || _pag === 'index') ||
                            (ALWAYS_ALLOWED.indexOf(_pag) !== -1) ||
                            (_ps.indexOf(_pag) !== -1) ||
                            (roles.indexOf(userData.rol) !== -1);
                        if (!_permitido) { window.location.href = 'dashboard.html'; return; }
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
function crearTareaLimpieza(reservaId, reservaData, creadorUid) {
    // Por reserva se mantienen DOS tareas (ahora en la colección 'actividades',
    // dentro del proyecto Limpiezas → categoría por cabaña):
    //  • limp-<id>  LIMPIEZA de ingreso → ventana [salida del anterior, check-in]; rojo desde 2 días antes.
    //  • ctrl-<id>  CONTROL de salida   → habilitado desde el check-out, con info del que sale.
    // Al guardar una reserva también se recalcula la ventana de la limpieza del SIGUIENTE huésped
    // de esa cabaña (porque esta reserva pasa a ser su "salida anterior").
    var aFecha = function(v) {
        if (!v) return null;
        var d = v.toDate ? v.toDate() : new Date(v);
        return isNaN(d.getTime()) ? null : d;
    };
    var isoDate = function(d) { return d.toISOString().split('T')[0]; };
    var ddmm    = function(d) { return d.getDate() + '/' + (d.getMonth() + 1); };
    var mismaFecha = function(a, b) { return a && b && isoDate(a) === isoDate(b); };

    var caba = reservaData.caba;
    if (caba === undefined || caba === null) return;
    var parentCat = 'limpiezas-cab-' + caba;   // categoría (por cabaña) dentro del proyecto Limpiezas

    Promise.all([
        db.collection('cabanas').doc(String(caba)).get(),
        db.collection('reservas').where('caba', '==', caba).get()
    ]).then(function(res) {
        var cDoc  = res[0];
        var rSnap = res[1];
        var cData = cDoc.exists ? cDoc.data() : {};
        var nombreCabana = (cData.nombre && cData.nombre.es) ? cData.nombre.es
                         : (cData.nombre || ('Cabaña ' + caba));

        var reservas = [];
        rSnap.forEach(function(d) {
            var r = d.data();
            if (r.estado === 'anulada') return;
            reservas.push({ id: d.id, data: r, ci: aFecha(r.checkIn), co: aFecha(r.checkOut) });
        });
        if (!reservas.some(function(x) { return x.id === reservaId; })) {
            reservas.push({ id: reservaId, data: reservaData, ci: aFecha(reservaData.checkIn), co: aFecha(reservaData.checkOut) });
        }

        // Salida más tardía que sea <= ese check-in (la "reserva anterior").
        var predecesorDe = function(targetId, ciDate) {
            if (!ciDate) return null;
            var mejor = null;
            for (var i = 0; i < reservas.length; i++) {
                var x = reservas[i];
                if (x.id === targetId || !x.co) continue;
                if (x.co.getTime() <= ciDate.getTime()) {
                    if (!mejor || x.co.getTime() > mejor.co.getTime()) mejor = x;
                }
            }
            return mejor;
        };

        // Campos de la tarea de limpieza (ingreso) para una reserva dada.
        var camposLimpieza = function(item) {
            var rd = item.data;
            var ci = item.ci;
            if (!ci) return null;
            var pred      = predecesorDe(item.id, ci);
            var horaEntra = rd.horaLlegada || '';
            var horaSale  = pred ? (pred.data.horaSalida || '') : '';
            var inicio;
            if (pred) { inicio = pred.co; }
            else { inicio = new Date(ci.getTime()); inicio.setDate(inicio.getDate() - 2); }
            var mismoDia = pred ? mismaFecha(pred.co, ci) : false;
            var personas = rd.huespedes || ((rd.adultos || 0) + (rd.ninos || 0)) || '—';

            var lineas = [
                '🧹 PREPARAR PARA INGRESO — ' + nombreCabana,
                '   Entra: ' + (rd.nombre || 'huésped') + ' · ' + personas + ' personas',
                '   Check-in: ' + ddmm(ci) + (horaEntra ? ' a las ' + horaEntra + 'hs' : ''),
                pred ? ('   Se puede limpiar desde: ' + ddmm(pred.co) + (horaSale ? ' (salida ' + horaSale + 'hs)' : ' (check-out anterior)'))
                     : '   Cabaña libre — limpiar dentro de los 2 días previos al ingreso.',
                mismoDia ? ('\n⚡ MISMO DÍA — Sale ' + (horaSale || '¿?') + 'hs y entra ' + (horaEntra || '¿?') + 'hs. Ventana corta: máxima prioridad.') : '',
                (rd.mascotas === 'si' || rd.niniosPequenos === 'si')
                    ? ('\n⚠️ ' + [rd.mascotas === 'si' ? '🐾 MASCOTAS' : '', rd.niniosPequenos === 'si' ? '👶 NIÑOS PEQUEÑOS' : ''].filter(Boolean).join(' · '))
                    : '',
                rd.notas ? '   Notas: ' + rd.notas : ''
            ];
            var descripcion = lineas.filter(function(s) { return s !== null && s !== undefined && s !== ''; }).join('\n');

            return {
                base: {
                    tipo:             'limpieza',
                    rol:              'ingreso',
                    nombre:           'Limpieza ingreso — ' + nombreCabana,
                    titulo:           'Limpieza ingreso — ' + nombreCabana,
                    detalle:          descripcion,
                    cabana:           caba,
                    reservaId:        item.id,
                    recurrencia:      0,
                    fechaInicio:      isoDate(inicio),
                    fechaCheckIn:     isoDate(ci),
                    hora:             horaEntra,
                    horaCheckIn:      horaEntra,
                    horaPuedeEmpezar: horaSale,
                    mismoDia:         mismoDia,
                    monto:            rd.costoLimpiezaBRL || 0,
                    cronometrable:    true,
                    parentId:         parentCat,
                    raizId:           'proj-limpiezas',
                    tipoRaiz:         'proyecto',
                    alcance:          'equipo',
                    competencias:     [],
                    actualizadoEn:    firebase.firestore.FieldValue.serverTimestamp()
                },
                soloCrear: {
                    estado:       'pendiente',
                    prioridad:    'verde',
                    hecho:        false,
                    orden:        0,
                    creadoEn:     firebase.firestore.FieldValue.serverTimestamp(),
                    creadoPor:    creadorUid || null,
                    creadoNombre: 'Sistema (reservas)'
                }
            };
        };

        // Upsert que NO pisa el estado de una tarea ya existente.
        var upsert = function(docRef, base, soloCrear) {
            return docRef.get().then(function(snap) {
                if (snap.exists) return docRef.update(base);
                return docRef.set(Object.assign({}, base, soloCrear));
            });
        };

        var actual = null;
        for (var k = 0; k < reservas.length; k++) { if (reservas[k].id === reservaId) { actual = reservas[k]; break; } }
        if (!actual) return;

        var col = db.collection('actividades');

        // Contenedores: proyecto "Limpiezas" → categoría por cabaña. Se crean si faltan.
        var ahora = firebase.firestore.FieldValue.serverTimestamp();
        var contenedor = function (titulo, pId, rId, color, cab) {
            var o = {
                titulo: titulo, nombre: titulo, detalle: '', tipoRaiz: 'proyecto', color: color || '',
                parentId: pId, raizId: rId, orden: 0,
                alcance: 'equipo', competencias: [],
                cronometrable: false, estado: 'pendiente', prioridad: 'gris',
                monto: 0, recurrencia: 0, esCompra: false, hecho: false,
                creadoPor: creadorUid || null, creadoNombre: 'Sistema (reservas)', creadoEn: ahora
            };
            if (cab !== undefined && cab !== null) o.cabana = cab;
            return o;
        };
        var ensureDoc = function (ref, meta) {
            return ref.get().then(function (s) { if (!s.exists) return ref.set(meta); });
        };

        return ensureDoc(col.doc('proj-limpiezas'), contenedor('Limpiezas', '', 'proj-limpiezas', '#3f6f8f'))
        .then(function () { return ensureDoc(col.doc(parentCat), contenedor(nombreCabana, 'proj-limpiezas', 'proj-limpiezas', '', caba)); })
        .then(function () {
            var jobs = [];

            // 1) Limpieza de la reserva actual.
            var cl = camposLimpieza(actual);
            if (cl) jobs.push(upsert(col.doc('limp-' + actual.id), cl.base, cl.soloCrear));

            // 2) Control de salida de la reserva actual.
            if (actual.co) {
                var rd        = actual.data;
                var personasC = rd.huespedes || ((rd.adultos || 0) + (rd.ninos || 0)) || '—';
                var descCtrl  = [
                    '🔑 CONTROL DE SALIDA — ' + nombreCabana,
                    '   Sale: ' + (rd.nombre || 'huésped') + ' · ' + personasC + ' personas',
                    '   Check-out: ' + ddmm(actual.co) + (rd.horaSalida ? ' a las ' + rd.horaSalida + 'hs' : ''),
                    rd.notas ? '   Notas: ' + rd.notas : '',
                    '',
                    'Controlar inventario y estado: utensilios de cocina, toallas, sábanas; electrodomésticos (ventiladores, licuadora…); luces, espejos, inodoro.',
                    'Registrar faltantes/daños en la reserva y lanzar pendientes de mantenimiento para la próxima limpieza.'
                ].filter(function(s) { return s !== null && s !== undefined && s !== ''; }).join('\n');
                jobs.push(upsert(col.doc('ctrl-' + actual.id), {
                    tipo:          'control',
                    rol:           'salida',
                    nombre:        'Control de salida — ' + nombreCabana,
                    titulo:        'Control de salida — ' + nombreCabana,
                    detalle:       descCtrl,
                    cabana:        caba,
                    reservaId:     actual.id,
                    recurrencia:   0,
                    fechaInicio:   isoDate(actual.co),
                    fechaVencimiento: isoDate(actual.co),
                    fechaCheckOut: isoDate(actual.co),
                    monto:         0,
                    cronometrable: true,
                    parentId:      parentCat,
                    raizId:        'proj-limpiezas',
                    tipoRaiz:      'proyecto',
                    alcance:       'equipo',
                    competencias:  [],
                    actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
                }, { estado: 'pendiente', prioridad: 'verde', hecho: false, orden: 1, creadoEn: firebase.firestore.FieldValue.serverTimestamp(), creadoPor: creadorUid || null, creadoNombre: 'Sistema (reservas)' }));
            }

            // 3) Recalcular la ventana de la limpieza del SIGUIENTE huésped (solo si ya tiene su tarea).
            if (actual.co) {
                var follower = null;
                for (var j = 0; j < reservas.length; j++) {
                    var x = reservas[j];
                    if (x.id === actual.id || !x.ci) continue;
                    if (x.ci.getTime() >= actual.co.getTime()) {
                        if (!follower || x.ci.getTime() < follower.ci.getTime()) follower = x;
                    }
                }
                if (follower) {
                    var clf = camposLimpieza(follower);
                    if (clf) {
                        var refF = col.doc('limp-' + follower.id);
                        jobs.push(refF.get().then(function(snap) {
                            if (snap.exists) return refF.update(clf.base);
                        }));
                    }
                }
            }

            return Promise.all(jobs).then(function() {
                console.log('Limpiezas/controles sincronizados en actividades para la reserva', reservaId);
            });
        });
    }).catch(function(err) {
        console.error('Error al sincronizar tareas de reserva:', err);
    });
}

// Al anular/eliminar una reserva: borra sus tareas y recalcula la ventana del huésped siguiente.
function alAnularReserva(reservaId) {
    var col = db.collection('actividades');
    return col.doc('limp-' + reservaId).delete().catch(function() {})
    .then(function() { return col.doc('ctrl-' + reservaId).delete().catch(function() {}); })
    .then(function() { return db.collection('reservas').doc(reservaId).get(); })
    .then(function(snap) {
        if (!snap.exists) return;
        var rd = snap.data();
        var caba = rd.caba;
        if (caba === undefined || caba === null) return;
        var co = (rd.checkOut && rd.checkOut.toDate) ? rd.checkOut.toDate() : (rd.checkOut ? new Date(rd.checkOut) : null);
        if (!co || isNaN(co.getTime())) return;
        return db.collection('reservas').where('caba', '==', caba).get().then(function(rs) {
            var follower = null;
            rs.forEach(function(d) {
                if (d.id === reservaId) return;
                var r = d.data();
                if (r.estado === 'anulada') return;
                var ci = (r.checkIn && r.checkIn.toDate) ? r.checkIn.toDate() : (r.checkIn ? new Date(r.checkIn) : null);
                if (!ci || isNaN(ci.getTime())) return;
                if (ci.getTime() >= co.getTime()) {
                    if (!follower || ci.getTime() < follower.ci.getTime()) follower = { id: d.id, data: r, ci: ci };
                }
            });
            if (follower) crearTareaLimpieza(follower.id, follower.data);
        });
    }).catch(function(err) { console.warn('alAnularReserva:', err.message); });
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
    await cargarTemporada();
    const ciclo = cicloEfectivoTarea(t);

    // Limpiar la subcolección de sesiones para que el próximo ciclo
    // arranque en cero (el historial ya quedó en historial_tareas)
    if (sesDocs && sesDocs.length) {
        const batch = db.batch();
        sesDocs.forEach(function(d) { batch.delete(d.ref); });
        await batch.commit();
    }

    if (ciclo > 0) {
        await ref.update({
            estado: 'pendiente',
            fechaInicio: _sumarDiasISO(ciclo),
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
// ── TEMPORADAS (v4.25) ────────────────────────────────────────────────────────
//  Control central de temporada (alta/media/baja). Afecta la FRECUENCIA con que las
//  tareas recurrentes se resaltan/recuerdan, sin borrarlas: en temporada baja el ciclo
//  se estira (factor mayor) y la tarea satura menos. config/temporada:
//    { modo:'auto'|'manual', actual, rangos:[{desde'MM-DD',hasta'MM-DD',temporada}], factores:{alta,media,baja} }
var _temporadaCfg = null;
var _temporadaActual = null;

function _mmdd(d) {
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var dd = String(d.getDate()); if (dd.length < 2) dd = '0' + dd;
    return m + '-' + dd;
}
function _enRangoMMDD(mmdd, desde, hasta) {
    if (!desde || !hasta) return false;
    if (desde <= hasta) return mmdd >= desde && mmdd <= hasta;
    return mmdd >= desde || mmdd <= hasta; // cruza el fin de año
}
function calcularTemporada(cfg, fecha) {
    fecha = fecha || new Date();
    if (!cfg) return 'media';
    if (cfg.modo === 'manual') return cfg.actual || 'media';
    var mmdd = _mmdd(fecha);
    var rangos = cfg.rangos || [];
    for (var i = 0; i < rangos.length; i++) {
        if (_enRangoMMDD(mmdd, rangos[i].desde, rangos[i].hasta)) return rangos[i].temporada || 'media';
    }
    return 'media';
}
function _temporadaDefault() { return { modo: 'manual', actual: 'media', rangos: [], factores: { alta: 1, media: 1, baja: 1 } }; }
function cargarTemporada(forzar) {
    if (_temporadaCfg && !forzar) return Promise.resolve({ cfg: _temporadaCfg, actual: _temporadaActual });
    return db.collection('config').doc('temporada').get().then(function(doc) {
        _temporadaCfg = doc.exists ? doc.data() : _temporadaDefault();
        if (!_temporadaCfg.factores) _temporadaCfg.factores = { alta: 1, media: 1, baja: 1 };
        _temporadaActual = calcularTemporada(_temporadaCfg);
        return { cfg: _temporadaCfg, actual: _temporadaActual };
    }).catch(function() {
        _temporadaCfg = _temporadaDefault(); _temporadaActual = 'media';
        return { cfg: _temporadaCfg, actual: _temporadaActual };
    });
}
function temporadaActual() { return _temporadaActual || 'media'; }
function guardarTemporada(cfg) {
    return db.collection('config').doc('temporada').set({
        modo: cfg.modo || 'manual',
        actual: cfg.actual || 'media',
        rangos: cfg.rangos || [],
        factores: cfg.factores || { alta: 1, media: 1, baja: 1 },
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(function() { return cargarTemporada(true); });
}
function factorTemporada(temporada) {
    var f = (_temporadaCfg && _temporadaCfg.factores) ? _temporadaCfg.factores[temporada] : 1;
    f = parseFloat(f);
    return (!isNaN(f) && f > 0) ? f : 1;
}
// Ciclo efectivo (en días) de una tarea para la temporada dada. Prioriza override por
// tarea (recurrenciaTemporada), si no aplica el factor global sobre la recurrencia base.
function cicloEfectivoTarea(t, temporada) {
    temporada = temporada || temporadaActual();
    var rt = t.recurrenciaTemporada;
    if (rt && typeof rt === 'object') {
        var v = parseInt(rt[temporada], 10);
        if (!isNaN(v)) return v;
    }
    var base = parseInt(t.recurrencia, 10) || 0;
    if (base <= 0) return 0;
    return Math.max(1, Math.round(base * factorTemporada(temporada)));
}

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

    // Limpieza de ingreso: rojo desde 2 días antes del check-in (ventana corta = urgente).
    if (t.fechaCheckIn) {
        const ciD = new Date(String(t.fechaCheckIn).slice(0, 10) + 'T00:00:00');
        if (!isNaN(ciD.getTime())) {
            if (hoy < f) return { color: 'gris', label: 'Próxima' };
            const d2 = Math.round((ciD - hoy) / 86400000);
            if (d2 <= 2) return { color: 'rojo', label: d2 < 0 ? 'Ingreso vencido' : (d2 === 0 ? 'Ingreso hoy' : 'Ingreso en ' + d2 + 'd') };
            return { color: 'amarillo', label: 'Ingreso en ' + d2 + 'd' };
        }
    }

    const dias  = Math.round((hoy - f) / 86400000);
    const ciclo = cicloEfectivoTarea(t);

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
    const items = rol === 'admin' ? NAV_ADMIN_ITEMS : construirNavColaborador();

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

    inyectarBotonGasto(paginaActiva);
}

// Botón flotante para registrar un gasto rápido (carga básica, igual que colaboradores).
// Aparece en todas las páginas internas; el destino es gastos-mantenimiento.html.
function inyectarBotonGasto(paginaActiva) {
    try {
        if (document.getElementById('cvcGastoFab')) return;
        var pag = paginaActiva || (window.location.pathname.split('/').pop() || '');
        if (String(pag).indexOf('dashboard') === -1) return; // el botón flotante de Gasto solo aparece en el dashboard
        if (String(pag).indexOf('gastos-mantenimiento') !== -1) return; // ya estás en la carga
        var a = document.createElement('a');
        a.id = 'cvcGastoFab';
        a.href = 'gastos-mantenimiento.html';
        a.title = 'Registrar un gasto';
        a.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:996;background:#2d5a27;'
            + 'color:#fff;border-radius:28px;padding:0 18px;height:52px;display:inline-flex;'
            + 'align-items:center;gap:8px;box-shadow:0 4px 16px rgba(45,90,39,.35);'
            + 'text-decoration:none;font-weight:700;font-size:15px;font-family:inherit;';
        a.innerHTML = '<span class="material-icons">receipt_long</span>Gasto';
        document.body.appendChild(a);
    } catch (e) { /* no bloquea */ }
}

function _cerrarUnDrop(dropEl) {
    if (!dropEl) return;
    dropEl.classList.remove('open');
    var panel = document.querySelector('.nav-dropdown__panel[data-drop="' + dropEl.id + '"]');
    if (!panel) panel = dropEl.querySelector('.nav-dropdown__panel');
    if (panel) {
        panel.style.display = '';
        panel.style.position = '';
        panel.style.top = '';
        panel.style.left = '';
        panel.style.zIndex = '';
        panel.removeAttribute('data-drop');
        if (panel.parentNode === document.body) dropEl.appendChild(panel);
    }
}

function toggleNavDrop(e, id) {
    e.stopPropagation();

    var dropEl = document.getElementById(id);
    if (!dropEl) return;

    var yaAbierto = dropEl.classList.contains('open');

    // Cerrar todos los dropdowns abiertos (devuelve el panel a su lugar)
    document.querySelectorAll('.nav-dropdown.open').forEach(_cerrarUnDrop);

    if (yaAbierto) return;

    var trigger = dropEl.querySelector('.nav-dropdown__trigger');
    var panel   = dropEl.querySelector('.nav-dropdown__panel');
    if (!trigger || !panel) return;

    var rect = trigger.getBoundingClientRect();

    // Colgar el panel del body: asi 'fixed' no lo recorta un overflow del nav
    // ni lo descoloca un ancestro con transform (era el bug en tablet/iPad).
    panel.setAttribute('data-drop', id);
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.zIndex   = '4000';
    panel.style.display  = 'block';
    panel.style.top      = (rect.bottom + 2) + 'px';
    panel.style.left     = rect.left + 'px';

    dropEl.classList.add('open');

    // Si se sale por la derecha de la pantalla, alinear al borde del trigger
    var pr = panel.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) {
        var nl = rect.right - pr.width;
        panel.style.left = (nl < 8 ? 8 : nl) + 'px';
    }
}

function _cerrarDropdowns() {
    document.querySelectorAll('.nav-dropdown.open').forEach(_cerrarUnDrop);
}

window.toggleNavDrop = toggleNavDrop;

// ============================================================
//  COMPROBANTES (Cloudinary, unsigned)  — restaurado en v4.10
//  Subida de imágenes/PDF de comprobantes y apertura para verlos.
//  cloud: dnwfu8ffn · preset sin firma: preset-comprobantes
// ============================================================
// Comprime una imagen antes de subirla (comprobantes legibles pero livianos).
// Solo imágenes; PDF u otros pasan sin tocar. Ante cualquier error, sube el original.
function _comprimirImagen(file, maxPx, quality) {
    return new Promise(function (resolve) {
        if (!file || !file.type || file.type.indexOf('image/') !== 0) { resolve(file); return; }
        try {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                try {
                    URL.revokeObjectURL(url);
                    var w = img.width, h = img.height;
                    var mx = maxPx || 2000;
                    if (w > mx || h > mx) {
                        if (w >= h) { h = Math.round(h * mx / w); w = mx; }
                        else { w = Math.round(w * mx / h); h = mx; }
                    }
                    var canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    canvas.toBlob(function (blob) {
                        resolve(blob && blob.size < file.size ? blob : file);
                    }, 'image/jpeg', quality || 0.85);
                } catch (e) { resolve(file); }
            };
            img.onerror = function () { resolve(file); };
            img.src = url;
        } catch (e) { resolve(file); }
    });
}

function subirComprobante(file, carpeta, docId) {
    return _comprimirImagen(file, 2000, 0.85).then(function (blob) {
        var nombre = (blob !== file) ? 'comprobante.jpg' : ((file && file.name) || 'comprobante');
        var fd = new FormData();
        fd.append('file', blob, nombre);
        fd.append('upload_preset', 'preset-comprobantes');
        if (carpeta) fd.append('folder', carpeta);
        if (docId)   fd.append('tags', docId);
        return fetch('https://api.cloudinary.com/v1_1/dnwfu8ffn/auto/upload', { method: 'POST', body: fd })
            .then(function (r) {
                if (!r.ok) throw new Error('Cloudinary ' + r.status);
                return r.json();
            })
            .then(function (d) { return d.secure_url || d.url; });
    });
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
var _ultimoWhatsApp = {};

// WhatsApp vía la Netlify Function (CallMeBot). Gratis = ~1 por minuto POR número:
// el guard es por destinatario, así avisar a personas distintas no se bloquea entre sí.
function enviarWhatsApp(text, to) {
    var clave = to || '_default';
    var ahora = Date.now();
    if (_ultimoWhatsApp[clave] && (ahora - _ultimoWhatsApp[clave] < 60000)) {
        return Promise.resolve({ ok: false, error: 'rate', detalle: 'Esperá 1 minuto entre WhatsApps al mismo destinatario (límite del plan gratis).' });
    }
    _ultimoWhatsApp[clave] = ahora;
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

// Registra un evento para el resumen, con su AUDIENCIA (a quién le concierne).
// para: 'todos' | 'admins' | 'colaboradores' | array de uids.
function registrarEvento(tipo, texto, para) {
    try {
        var fecha = _hoyISO();
        return firebase.firestore().collection('resumenes').doc(fecha).set({
            fecha: fecha,
            eventos: firebase.firestore.FieldValue.arrayUnion({
                tipo: tipo, texto: texto, hora: new Date().toISOString(), para: (para || 'todos')
            })
        }, { merge: true }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
}

// ¿Este evento le concierne a este usuario (uid + rol)?
function _eventoAplica(ev, uid, rol) {
    var para = ev.para || 'todos';
    if (para === 'todos') return true;
    if (para === 'admins') return rol === 'admin';
    if (para === 'colaboradores') return rol === 'user';
    if (Object.prototype.toString.call(para) === '[object Array]') return para.indexOf(uid) !== -1;
    return false;
}

// Arma el resumen del día SOLO con los eventos que le conciernen a ese usuario.
function construirResumen(fecha, uid, rol) {
    var LABEL = { reserva: 'Reservas', pago: 'Pagos', comunicacion: 'Mensajes', limpieza: 'Limpiezas / tareas', presupuesto: 'Presupuestos', gasto: 'Gastos' };
    return firebase.firestore().collection('resumenes').doc(fecha).get().then(function (d) {
        if (!d.exists) return null;
        var evs = ((d.data().eventos) || []).filter(function (e) { return _eventoAplica(e, uid, rol); });
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

// Lazy-cron: 1 vez por día (al cargar el dashboard). Cada usuario recibe SU resumen.
function enviarResumenDiarioSiCorresponde() {
    var db = firebase.firestore();
    return db.collection('config').doc('notificaciones').get().then(function (doc) {
        var hoy = _hoyISO();
        var ultimo = (doc.exists && doc.data().ultimoResumen) ? doc.data().ultimoResumen : '';
        if (ultimo >= hoy) return;
        return db.collection('config').doc('notificaciones').set({ ultimoResumen: hoy }, { merge: true }).then(function () {
            var ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            return db.collection('usuarios').get().then(function (snap) {
                var tareas = [];
                snap.forEach(function (u) {
                    var x = u.data();
                    if (x.activo === false) return;            // desactivado: no recibe
                    if (!x.email) return;
                    if (x.notif && x.notif.canalEmail === false) return;
                    tareas.push(construirResumen(ayer, u.id, x.rol).then(function (res) {
                        if (res) return enviarMail(res.asunto, res.html, x.email);
                    }));
                });
                return Promise.all(tareas);
            });
        });
    }).catch(function () {});
}

// Envía el resumen de HOY (lo que le concierne a ese usuario) a un email, para probar.
function enviarResumenPrueba(email, uid, rol) {
    return construirResumen(_hoyISO(), uid, rol).then(function (res) {
        if (!res) return enviarMail('Resumen Casa Verde (prueba)', '<p>Hoy todavía no hay novedades que te conciernan. El resumen real se arma con los cambios del día.</p>', email);
        return enviarMail(res.asunto + ' (prueba)', res.html, email);
    });
}

// AVISO de un evento: lo registra para el resumen (según audiencia) y manda
// WhatsApp instantáneo a quienes les concierne y lo tengan activado.
// evento: 'comunicacion' | 'reserva' | 'pago' | ...
// para: 'todos' | 'admins' | 'colaboradores' | array de uids
// excluirUid: uid a NO avisar (típicamente el autor de la acción)
function avisar(evento, asunto, texto, para, excluirUid) {
    registrarEvento(evento, texto, para);
    return firebase.firestore().collection('usuarios').get().then(function (snap) {
        snap.forEach(function (u) {
            var x = u.data(), uid = u.id;
            if (x.activo === false) return;             // desactivado: no recibe
            if (excluirUid && uid === excluirUid) return;
            var aplica = (para === 'todos') ||
                (para === 'admins' && x.rol === 'admin') ||
                (para === 'colaboradores' && x.rol === 'user') ||
                (Object.prototype.toString.call(para) === '[object Array]' && para.indexOf(uid) !== -1);
            if (!aplica) return;
            var n = x.notif || {};
            if (n[evento] === false) return;
            if (n.canalWhatsapp === true) {
                enviarWhatsApp((asunto ? asunto + ': ' : '') + texto, uid);
            }
        });
    }).catch(function () {});
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
            fab.style.cssText = 'position:fixed;bottom:84px;right:20px;width:48px;height:48px;'
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


// ── COTIZACIONES UNIFICADAS (v4.18) ───────────────────────────────────────────
//  Fuente única de tipos de cambio de MERCADO para todo el sistema.
//  - config/cotizaciones : snapshot actual { base:'USD', rates:{USD,BRL,UYU,EUR,ARS}, fuente, actualizadoEn, actualizadoPor }
//  - cotizaciones_historial/{YYYY-MM-DD} : serie por fecha (para validar operaciones viejas)
//  NO confundir con config/tipos_cambio (FISCAL, lo fija la contadora, no se toca aquí).
var _cotizCache = null;

function cargarCotizaciones(forzar) {
    if (_cotizCache && !forzar) return Promise.resolve(_cotizCache);
    return db.collection('config').doc('cotizaciones').get().then(function(doc) {
        if (doc.exists) {
            var d = doc.data();
            _cotizCache = {
                base: d.base || 'USD',
                rates: d.rates || { USD: 1 },
                fuente: d.fuente || '',
                actualizadoEn: (d.actualizadoEn && d.actualizadoEn.toDate) ? d.actualizadoEn.toDate() : null,
                actualizadoPor: d.actualizadoPor || ''
            };
        } else {
            _cotizCache = { base: 'USD', rates: { USD: 1 }, fuente: '', actualizadoEn: null, actualizadoPor: '' };
        }
        return _cotizCache;
    }).catch(function() {
        _cotizCache = { base: 'USD', rates: { USD: 1 }, fuente: '', actualizadoEn: null, actualizadoPor: '' };
        return _cotizCache;
    });
}

// Convierte un monto entre monedas. rates = { CCY: unidades por 1 base(USD) }.
// Si no se pasan rates usa la cache; si no hay tabla, devuelve el monto crudo (no rompe).
function convertir(monto, desde, hacia, rates) {
    if (!monto) return 0;
    desde = String(desde || 'BRL').toUpperCase();
    hacia = String(hacia || 'BRL').toUpperCase();
    if (desde === hacia) return monto;
    rates = rates || (_cotizCache && _cotizCache.rates);
    if (!rates || !rates[desde] || !rates[hacia]) return monto;
    return (monto / rates[desde]) * rates[hacia];
}

// Moneda efectiva de un registro (gasto/movimiento): usa .moneda; si no, mapea por país.
function monedaDe(reg) {
    var m = String((reg && reg.moneda) || '').toUpperCase();
    if (m === 'BRL' || m === 'UYU' || m === 'USD' || m === 'EUR' || m === 'ARS') return m;
    if (m === 'R$') return 'BRL';
    var p = String((reg && reg.pais) || 'BR').toUpperCase();
    if (p === 'UY') return 'UYU';
    if (p === 'FR') return 'EUR';
    if (p === 'AR') return 'ARS';
    if (p === 'US') return 'USD';
    return 'BRL';
}

function diasDesdeCotizacion() {
    if (!_cotizCache || !_cotizCache.actualizadoEn) return 9999;
    return Math.floor((Date.now() - _cotizCache.actualizadoEn.getTime()) / 86400000);
}

// Guarda un snapshot (manual u online) + un doc de historial del día. Actualiza la cache.
function guardarCotizaciones(rates, fuente, autor) {
    var hoy = new Date();
    var mm = String(hoy.getMonth() + 1);
    if (mm.length < 2) mm = '0' + mm;
    var dd = String(hoy.getDate());
    if (dd.length < 2) dd = '0' + dd;
    var fechaId = hoy.getFullYear() + '-' + mm + '-' + dd;
    var ratesLimpio = { USD: 1 };
    ['BRL', 'UYU', 'EUR', 'ARS'].forEach(function(c) {
        var v = parseFloat(rates[c]);
        if (v && v > 0) ratesLimpio[c] = v;
    });
    var batch = db.batch();
    batch.set(db.collection('config').doc('cotizaciones'), {
        base: 'USD', rates: ratesLimpio, fuente: fuente || 'manual', actualizadoPor: autor || '',
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(db.collection('cotizaciones_historial').doc(fechaId), {
        fecha: fechaId, base: 'USD', rates: ratesLimpio, fuente: fuente || 'manual', autor: autor || '',
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    return batch.commit().then(function() {
        _cotizCache = { base: 'USD', rates: ratesLimpio, fuente: fuente || 'manual', actualizadoEn: new Date(), actualizadoPor: autor || '' };
        return _cotizCache;
    });
}

// Trae cotizaciones de mercado online (open.er-api.com, sin API key) y las guarda.
function actualizarCotizacionesOnline(autor) {
    return fetch('https://open.er-api.com/v6/latest/USD').then(function(r) {
        return r.json();
    }).then(function(j) {
        if (!j || j.result !== 'success' || !j.rates) throw new Error('respuesta inválida del servicio');
        var rates = {};
        ['BRL', 'UYU', 'EUR', 'ARS'].forEach(function(c) { if (j.rates[c]) rates[c] = j.rates[c]; });
        return guardarCotizaciones(rates, 'online', autor);
    });
}

// (v4.20) Devuelve las rates que regían en una fecha (último historial <= fecha). Promesa.
function cotizacionEnFecha(fecha) {
    return db.collection('cotizaciones_historial')
        .where('fecha', '<=', fecha).orderBy('fecha', 'desc').limit(1).get()
        .then(function(snap) {
            if (snap.empty) return null;
            var d = snap.docs[0].data();
            return { fecha: d.fecha, rates: d.rates || null, fuente: d.fuente || '' };
        }).catch(function() { return null; });
}

// Carga el historial de cotizaciones (ordenado por fecha desc) para validaciones en lote.
function cargarHistorialCotizaciones(limite) {
    return db.collection('cotizaciones_historial').orderBy('fecha', 'desc').limit(limite || 365).get()
        .then(function(snap) { return snap.docs.map(function(d) { return d.data(); }); })
        .catch(function() { return []; });
}

// Dado un historial ya cargado (desc), devuelve el snapshot que regía en 'fecha' (último <= fecha).
function cotizacionEnFechaLocal(historial, fecha) {
    if (!historial || !historial.length) return null;
    for (var i = 0; i < historial.length; i++) {
        if ((historial[i].fecha || '') <= fecha) return historial[i];
    }
    return historial[historial.length - 1];
}

// Valida el cambio de una transferencia contra la cotización de mercado de su fecha.
// ratesFecha = rates del snapshot histórico (de cotizacionEnFecha/Local). Devuelve dif %.
function validarCambioTransferencia(t, ratesFecha) {
    if (!t || t.origenMoneda === t.destinoMoneda) return { aplica: false };
    var rateEfectivo = (t.montoOrigen ? (t.montoDestino / t.montoOrigen) : 0);
    var rateMercado = ratesFecha ? convertir(1, t.origenMoneda, t.destinoMoneda, ratesFecha) : null;
    var difPct = (rateMercado ? ((rateEfectivo - rateMercado) / rateMercado * 100) : null);
    return { aplica: true, rateEfectivo: rateEfectivo, rateMercado: rateMercado, difPct: difPct };
}


//  Operación de dos patas: salida de una cuenta + entrada en otra, vinculadas.
//  Unifica: transferencia, retiro, honorario propio y reintegro de gasto.
//  Colección 'transferencias' (fuente de verdad). NO escribe en 'movimientos'
//  (esos son el espejo del banco con saldoPost encadenado). Ajusta cuentas.saldoActual
//  de forma atómica con increment. La conciliación (v4.20) cruza las patas con el banco.
// ── CLASIFICACIÓN MASIVA (v4.24) ──────────────────────────────────────────────
//  Aplica en lote actualizaciones de clasificación a gastos y movimientos.
//  cambios = [{ col:'gastos'|'movimientos', id, data:{...campos...} }]
//  Divide en tandas de 400 (límite de batch 500) y las confirma en orden.
function aplicarClasificacionMasiva(cambios) {
    var tandas = [];
    for (var i = 0; i < cambios.length; i += 400) tandas.push(cambios.slice(i, i + 400));
    var idx = 0;
    function siguiente() {
        if (idx >= tandas.length) return Promise.resolve(cambios.length);
        var batch = db.batch();
        tandas[idx].forEach(function(c) {
            batch.update(db.collection(c.col).doc(c.id), c.data);
        });
        idx++;
        return batch.commit().then(siguiente);
    }
    return siguiente();
}

function crearTransferencia(t) {
    var batch = db.batch();
    var ref = db.collection('transferencias').doc();
    var doc = {
        fecha: t.fecha || new Date().toISOString().split('T')[0],
        naturaleza: t.naturaleza || 'transferencia',
        origenCuentaId: t.origenCuentaId || '',
        origenCuentaNom: t.origenCuentaNom || '',
        origenMoneda: t.origenMoneda || 'BRL',
        montoOrigen: t.montoOrigen || 0,
        destinoCuentaId: t.destinoCuentaId || '',
        destinoCuentaNom: t.destinoCuentaNom || '',
        destinoMoneda: t.destinoMoneda || 'BRL',
        montoDestino: t.montoDestino || 0,
        tipoCambioEfectivo: t.tipoCambioEfectivo || 1,
        tipoCambioMercado: (t.tipoCambioMercado != null ? t.tipoCambioMercado : null),
        concepto: t.concepto || '',
        receptorUid: t.receptorUid || '',
        receptorNombre: t.receptorNombre || '',
        finalidadId: t.finalidadId || '',
        finalidadNom: t.finalidadNom || '',
        comprobanteUrl: t.comprobanteUrl || null,
        conciliadoOrigen: false,
        conciliadoDestino: false,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: t.creadoPor || ''
    };
    batch.set(ref, doc);
    if (t.origenCuentaId) {
        batch.update(db.collection('cuentas').doc(t.origenCuentaId), {
            saldoActual: firebase.firestore.FieldValue.increment(-(t.montoOrigen || 0))
        });
    }
    if (t.destinoCuentaId) {
        batch.update(db.collection('cuentas').doc(t.destinoCuentaId), {
            saldoActual: firebase.firestore.FieldValue.increment(t.montoDestino || 0)
        });
    }
    return batch.commit().then(function() { return ref.id; });
}

// Revierte los saldos y elimina la transferencia (recibe el doc completo con id).
function eliminarTransferencia(t) {
    var batch = db.batch();
    if (t.origenCuentaId) {
        batch.update(db.collection('cuentas').doc(t.origenCuentaId), {
            saldoActual: firebase.firestore.FieldValue.increment(t.montoOrigen || 0)
        });
    }
    if (t.destinoCuentaId) {
        batch.update(db.collection('cuentas').doc(t.destinoCuentaId), {
            saldoActual: firebase.firestore.FieldValue.increment(-(t.montoDestino || 0))
        });
    }
    batch.delete(db.collection('transferencias').doc(t.id));
    return batch.commit();
}

window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS, ESTADOS_BLOQUEANTES,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    SECCIONES_SOLO_ADMIN, puede, CATALOGO_PERMISOS, ALWAYS_ALLOWED,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    verificarDisponibilidadCabana,
    mensajeConflicto,
    crearTareaLimpieza,
    alAnularReserva,
    sincronizarDisponibilidad,
    sincronizarDesdeGCal,
    iniciarTarea, pausarTarea, finalizarTarea, verificarTarea, urgenciaTarea,
    getHistorialTareas,
    BTG_CATEGORIAS, inferirCategoria, fingerprintMovimiento,
    conciliarMovimientos, importarMovimientosConfirmados,
    matchMovimientoBancario, conciliarContraRegistros,
    guardarConciliacion, cargarConfigConciliacion,
    cargarCotizaciones, convertir, monedaDe, diasDesdeCotizacion,
    guardarCotizaciones, actualizarCotizacionesOnline, cotizacionEnFecha,
    crearTransferencia, eliminarTransferencia,
    aplicarClasificacionMasiva,
    cargarTemporada, temporadaActual, guardarTemporada, calcularTemporada, cicloEfectivoTarea, factorTemporada,
    cargarHistorialCotizaciones, cotizacionEnFechaLocal, validarCambioTransferencia,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    subirComprobante, abrirComprobante, elegirFuenteFoto,
    enviarWhatsApp, enviarMail, notificar, avisar,
    registrarEvento, enviarResumenDiarioSiCorresponde, enviarResumenPrueba,
    showLoading, showEmpty, showError, showToast,
    AYUDA_ITEMS, initAyuda, mostrarAyuda, cerrarAyuda,
    mostrarCelula, cerrarCelula,
    _toggleAyudaDetalle
};
