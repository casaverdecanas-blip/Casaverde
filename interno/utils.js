// ============================================================
//  utils.js — Casa Verde Canas  v4.2
//  Funciones compartidas · /interno/
//
//  CAMBIOS v4.2:
//  - [FIX]   toggleNavDrop() — el panel ahora usa position:fixed
//            en lugar de absolute, lo que corrige el problema de
//            clipping cuando el nav tiene overflow:hidden o
//            position:relative. Los paneles se despliegan sobre
//            todo el contenido sin quedar cortados.
//  - [NAV]   NAV_ADMIN_ITEMS actualizado:
//            · Operaciones: agrega tareas-admin.html, pendientes.html
//            · Nuevo grupo "Fiscal": fiscal.html, acceso-contador.html
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
    pendiente:        { label: 'Pendiente',        cssClass: 'badge-pendiente'  },
    confirmada:       { label: 'Confirmada',        cssClass: 'badge-confirmada' },
    check_in:         { label: 'Check-In',         cssClass: 'badge-checkin'    },
    check_out:        { label: 'Check-Out',        cssClass: 'badge-checkout'   },
    cancelada:        { label: 'Cancelada',        cssClass: 'badge-cancelada'  }
};

const ESTADOS_TAREA = {
    pendiente:        { label: 'Pendiente',        cssClass: 'badge-t-pendiente',  icon: 'schedule'        },
    en_progreso:      { label: 'En Progreso',     cssClass: 'badge-t-progreso',   icon: 'play_arrow'      },
    pausada:          { label: 'Pausada',          cssClass: 'badge-t-pausada',    icon: 'pause'           },
    completada:       { label: 'Completada',       cssClass: 'badge-t-completada', icon: 'check_circle'    },
    verificada:       { label: 'Verificada',       cssClass: 'badge-t-verificada', icon: 'verified'        }
};

const PRIORIDADES = {
    baja:             { label: 'Baja',             cssClass: 'prio-baja'    },
    media:            { label: 'Media',            cssClass: 'prio-media'   },
    alta:             { label: 'Alta',             cssClass: 'prio-alta'    },
    urgente:          { label: 'Urgente',          cssClass: 'prio-urgente' }
};

const CALENDAR_IDS = {
    reservas:         'reservas_main',
    limpieza:         'tareas_limpieza',
    mantenimiento:    'tareas_mantenimiento'
};

const ESTADOS_BLOQUEANTES = ['confirmada', 'check_in'];


// ── MENÚS DE NAVEGACIÓN ───────────────────────────────────────────────────────
const NAV_ADMIN_ITEMS = [
    { href: 'dashboard.html',      label: 'Panel General',     icon: 'dashboard'       },
    { href: 'calendario.html',     label: 'Calendario',        icon: 'calendar_today'  },
    { href: 'reservas.html',       label: 'Reservas',          icon: 'book_online'     },
    {
        group: 'Operaciones',
        icon:  'handyman',
        items: [
            { href: 'tareas-admin.html', label: 'Gestión Tareas', icon: 'assignment' },
            { href: 'pendientes.html',   label: 'Hojas de Ruta',  icon: 'fact_check' },
            { href: 'limpieza.html',     label: 'Vista Personal', icon: 'cleaning_services' }
        ]
    },
    { href: 'finanzas.html',       label: 'Caja y Finanzas',   icon: 'payments'        },
    {
        group: 'Fiscal',
        icon:  'account_balance',
        items: [
            { href: 'fiscal.html',          label: 'Impuestos / Decl.', icon: 'gavel' },
            { href: 'acceso-contador.html', label: 'Exportar Contador', icon: 'description' }
        ]
    },
    { href: 'config.html',         label: 'Configuración',     icon: 'settings'        }
];

const NAV_USER_ITEMS = [
    { href: 'limpieza.html',     label: 'Mis Tareas',        icon: 'cleaning_services' },
    { href: 'calendario.html',   label: 'Calendario',        icon: 'calendar_today'    }
];


// ── AUXILIARES DE INTERFAZ (BADGES) ──────────────────────────────────────────
function badgeEstado(tipo, key) {
    const config = tipo === 'reserva' ? ESTADOS_RESERVA[key] : ESTADOS_TAREA[key];
    if (!config) return '<span class="badge">' + key + '</span>';
    return '<span class="badge ' + config.cssClass + '">' + config.label + '</span>';
}

function badgePrioridad(key) {
    const p = PRIORIDADES[key];
    if (!p) return '<span class="badge">' + key + '</span>';
    return '<span class="badge ' + p.cssClass + '">' + p.label + '</span>';
}


// ── SEGURIDAD Y AUTENTICACIÓN ────────────────────────────────────────────────
function verificarAuth(callbackRol) {
    auth.onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        db.collection('usuarios').doc(user.uid).get()
            .then(function(doc) {
                if (doc.exists) {
                    const data = doc.data();
                    if (callbackRol) callbackRol(data.role || 'user', data);
                } else {
                    auth.signOut().then(function() { window.location.href = 'login.html'; });
                }
            })
            .catch(function(err) {
                console.error("Error verificando rol:", err);
                window.location.href = 'login.html';
            });
    });
}

function cerrarSesion() {
    return auth.signOut().then(function() {
        window.location.href = 'login.html';
    });
}


// ── MOTOR DE PRECIOS Y DISPONIBILIDAD ────────────────────────────────────────
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
        console.error("Error calculando precio:", e);
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
          console.error("Error verificando disponibilidad:", err);
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
        const nombreCabana = cData.nombre || ('Cabaña ' + reservaData.caba);
        
        db.collection('tareas').doc(tareaId).set({
            tipo:         'limpieza',
            titulo:       'Limpieza Check-Out — ' + nombreCabana,
            cabana:       reservaData.caba,
            reservaId:    reservaId,
            estado:       'pendiente',
            prioridad:    'media',
            fechaInicio:  checkOut.toISOString().split('T')[0],
            descripcion:  'Limpieza general por salida de ' + (reservaData.nombre || 'huésped') + '. ' + (reservaData.notas || ''),
            creadoEn:     firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function() {
            console.log("Tarea de limpieza automatizada vinculada: ", tareaId);
        }).catch(function(err) {
            console.error("Error al automatizar limpieza:", err);
        });
    });
}


// ── SINCRONIZADOR DE CANALES (SIMULADO / STUB) ───────────────────────────────
function sincronizarDisponibilidad() {
    console.log("Sincronizando iCal / Airbnb / Booking Channels...");
    return Promise.resolve({ procesados: 0, nuevos: 0 });
}

function sincronizarDesdeGCal() {
    console.log("Consultando Google Calendar API v3...");
    return Promise.resolve(true);
}


// ── FLUJO OPERATIVO DE TAREAS (MOCK / TRABAJADORES) ──────────────────────────
function iniciarTarea(id) {
    return db.collection('tareas').doc(id).update({
        estado: 'en_progreso',
        timestampInicio: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function pausarTarea(id) {
    return db.collection('tareas').doc(id).update({ estado: 'pausada' });
}

function finalizarTarea(id) {
    return db.collection('tareas').doc(id).update({
        estado: 'completada',
        timestampFin: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function verificarTarea(id, aprobado, notas) {
    return db.collection('tareas').doc(id).update({
        estado: aprobado ? 'verificada' : 'pendiente',
        notasSupervisor: notas || ''
    });
}

function urgenciaTarea(id, esUrgente) {
    return db.collection('tareas').doc(id).update({
        prioridad: esUrgente ? 'urgente' : 'media'
    });
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


// ── MOTOR DE CONCILIACIÓN BANCARIA v4.0 ──────────────────────────────────────
const BTG_CATEGORIAS = [
    { id: 'alquiler',   labels: ['reserva', 'airbnb', 'booking', 'estadia', 'pago'], tipo: 'ingreso' },
    { id: 'servicios',  labels: ['ose', 'ute', 'antel', 'internet', 'luz', 'agua'],  tipo: 'egreso'  },
    { id: 'mantenim',   labels: ['barraca', 'ferreteria', 'madera', 'tornillo'],    tipo: 'egreso'  },
    { id: 'limpieza',   labels: ['lavadero', 'blanqueria', 'cloro', 'limpiador'],   tipo: 'egreso'  },
    { id: 'impuestos',  labels: ['bps', 'dgi', 'contribucion'],                     tipo: 'egreso'  }
];

function inferirCategoria(concepto) {
    if (!concepto) return 'otros';
    const txt = concepto.toLowerCase();
    for (let i = 0; i < BTG_CATEGORIAS.length; i++) {
        const cat = BTG_CATEGORIAS[i];
        for (let j = 0; j < cat.labels.length; j++) {
            if (txt.indexOf(cat.labels[j]) !== -1) return cat.id;
        }
    }
    return 'otros';
}

function fingerprintMovimiento(mov) {
    const f = mov.fecha || '';
    const m = String(mov.monto || 0);
    const c = mov.concepto || '';
    let hash = 0;
    const str = f + '_' + m + '_' + c;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return 'fp_' + Math.abs(hash);
}

// Retorna array de objetos { banco: mov, interno: match u null, confianza: 0-100 }
function conciliarMovimientos(movimientosBancarios, registrosInternos) {
    const asignados = [];
    movimientosBancarios.forEach(function(m) {
        let mejorMatch = null;
        let maxScore = 0;
        
        registrosInternos.forEach(function(r) {
            if (r._conciliado) return;
            let score = 0;
            
            // Regla 1: Montos idénticos absolutos (Ignoramos signo por diferencias de criterio ingreso/egreso)
            if (Math.abs(Number(m.monto)) === Math.abs(Number(r.monto))) score += 50;
            
            // Regla 2: Proximidad de fechas (Mismo día = Full score, +/- 2 días = parcial)
            if (m.fecha && r.fecha) {
                if (r.fecha === m.fecha) {
                    score += 30;
                } else {
                    const dM = new Date(m.fecha + 'T12:00:00');
                    const dR = new Date(r.fecha + 'T12:00:00');
                    const diff = Math.abs(dM - dR) / (1000 * 60 * 60 * 24);
                    if (diff <= 2) score += 15;
                }
            }
            
            // Regla 3: Coincidencia parcial de palabras clave en concepto
            if (m.concepto && r.concepto) {
                const wordsM = m.concepto.toLowerCase().split(/\s+/);
                const txtR   = r.concepto.toLowerCase();
                let matches  = 0;
                wordsM.forEach(function(w) {
                    if (w.length > 3 && txtR.indexOf(w) !== -1) matches++;
                });
                if (matches > 0) score += Math.min(20, matches * 7);
            }
            
            if (score > maxScore) {
                maxScore = score;
                mejorMatch = r;
            }
        });
        
        if (maxScore >= 50 && mejorMatch) {
            mejorMatch._conciliado = true;
            asignados.push({ banco: m, interno: mejorMatch, confianza: maxScore });
        } else {
            asignados.push({ banco: m, interno: null, confianza: 0 });
        }
    });
    return asignados;
}

function importarMovimientosConfirmados(listaConciliados) {
    const batch = db.batch();
    listaConciliados.forEach(function(item) {
        // Solo guardamos en Firestore lo que viene del banco y NO tiene correlación interna previa (evitar duplicados)
        if (!item.interno) {
            const id = fingerprintMovimiento(item.banco);
            const ref = db.collection('caja').doc(id);
            batch.set(ref, {
                fecha:    item.banco.fecha,
                monto:    Number(item.banco.monto),
                concepto: item.banco.concepto,
                cat:      inferirCategoria(item.banco.concepto),
                origen:   'banco_importado',
                estado:   'verificado',
                creadoEn: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Si hay match interno, actualizamos el registro de caja interno marcándolo como verificado/conciliado
            const ref = db.collection('caja').doc(item.interno.id);
            batch.update(ref, {
                estado: 'verificado',
                conciliadoConId: fingerprintMovimiento(item.banco),
                actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    return batch.commit();
}

function matchMovimientoBancario(monto, fecha, concepto) { console.log("Legacy match call"); return null; }
function conciliarContraRegistros() { return Promise.resolve(); }
function guardarConciliacion() { return Promise.resolve(); }
function cargarConfigConciliacion() { return Promise.resolve({}); }


// ── NAV CENTRALIZADA v4.2 REPARADA ─────────────────────────────────────────────
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
                return sub.href && (sub.href === paginaActiva || sub.href.replace('.html', '') === paginaActiva);
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

function toggleNavDrop(event, id) {
    event.stopPropagation();
    const drop = document.getElementById(id);
    if (!drop) return;
    const panel = drop.querySelector('.nav-dropdown__panel');
    const trigger = drop.querySelector('.nav-dropdown__trigger');
    const yaAbierto = drop.classList.contains('open');
    
    _cerrarDropdowns();
    
    if (!yaAbierto) {
        drop.classList.add('open');
        if (panel && trigger) {
            const rect = trigger.getBoundingClientRect();
            panel.style.position = 'fixed';
            panel.style.top = rect.bottom + 'px';
            panel.style.left = rect.left + 'px';
            panel.style.zIndex = '9999';
        }
    }
}

function _cerrarDropdowns() {
    const drops = document.querySelectorAll('.nav-dropdown.open');
    drops.forEach(function(d) {
        d.classList.remove('open');
        const p = d.querySelector('.nav-dropdown__panel');
        if (p) {
            p.style.position = '';
            p.style.top = '';
            p.style.left = '';
        }
    });
}

window.toggleNavDrop = toggleNavDrop;


// ── UTILS FORMATO Y ESCAPE GENERAL ───────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function formatFecha(timestamp) {
    if (!timestamp) return '-';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
}

function formatFechaHora(timestamp) {
    if (!timestamp) return '-';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + ' ' + hh + ':' + min + 'hs';
}

// Retorna diferencia legible en horas/minutos entre dos timestamps de Firebase
function formatHoras(tsInicio, tsFin) {
    if (!tsInicio || !tsFin) return '-';
    const t1 = tsInicio.toDate ? tsInicio.toDate() : new Date(tsInicio);
    const t2 = tsFin.toDate ? tsFin.toDate() : new Date(tsFin);
    const difMs = t2 - t1;
    if (difMs < 0 || isNaN(difMs)) return '-';
    
    const totMin = Math.floor(difMs / 60000);
    const hrs = Math.floor(totMin / 60);
    const mins = totMin % 60;
    
    if (hrs === 0) return mins + ' min';
    return hrs + 'h ' + mins + 'm';
}

function colorCabana(num) {
    const colores = {
        1: '#2ec4b6',
        2: '#e71d36',
        3: '#ff9f1c',
        4: '#011627',
        5: '#9b5de5'
    };
    return colores[num] || '#6c757d';
}


// ── MODAL DINÁMICO DE CÉLULAS ────────────────────────────────────────────────
function mostrarCelula(celulaId, event) {
    if (event) event.stopPropagation();
    
    let overlay = document.getElementById('_celulaModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = '_celulaModal';
        overlay.className = 'celula-modal-overlay';
        overlay.innerHTML = 
            '<div class="celula-modal-card">' +
                '<div class="celula-modal-header">' +
                    '<h4 id="_celCtxTitulo">Detalle del Registro</h4>' +
                    '<button class="celula-modal-close" onclick="cerrarCelula()">&times;</button>' +
                '</div>' +
                '<div class="celula-modal-body">' +
                    '<p class="celula-meta-main" id="_celCtxMeta"></p>' +
                    '<div class="celula-content-box" id="_celCtxResumen"></div>' +
                    '<div class="celula-expanded-area" id="_celCtxDetalle" style="display:none;"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
    }
    
    const elOriginal = document.querySelector('[data-celula-id="' + celulaId + '"]');
    if (!elOriginal) return;
    
    try {
        const celula = JSON.parse(decodeURIComponent(elOriginal.getAttribute('data-celula-obj') || '{}'));
        
        const titEl     = document.getElementById('_celCtxTitulo');
        const metaEl    = document.getElementById('_celCtxMeta');
        const resumenEl = document.getElementById('_celCtxResumen');
        const detalleEl = document.getElementById('_celCtxDetalle');
        
        titEl.textContent   = celula.titulo || 'Registro';
        metaEl.textContent  = celula.subtitulo || '';
        resumenEl.textContent = celula.resumen || '';
        
        if (celula.contenido && celula.contenido.trim()) {
            detalleEl.style.display   = 'block';
            detalleEl.textContent     = celula.contenido;
        } else {
            detalleEl.style.display   = 'none';
        }
        
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
    } catch(e) {
        console.error("Error al decodificar la célula de datos:", e);
    }
}

function cerrarCelula() {
    var overlay = document.getElementById('_celulaModal');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
}

window.mostrarCelula = mostrarCelula;
window.cerrarCelula  = cerrarCelula;


// ── CONTROL DE SPINNER GLOBAL ────────────────────────────────────────────────
function showLoading(mostrar) {
    let spin = document.getElementById('appGlobalSpinner');
    if (!spin && mostrar) {
        spin = document.createElement('div');
        spin.id = 'appGlobalSpinner';
        spin.className = 'app-spinner-overlay';
        spin.innerHTML = '<div class="spinner-core"></div>';
        document.body.appendChild(spin);
    }
    if (spin) spin.style.display = mostrar ? 'flex' : 'none';
}

function showToast(msg, tipo) {
    const box = document.createElement('div');
    box.className = 'app-toast toast-' + (tipo || 'info');
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(function() { box.classList.add('show'); }, 50);
    setTimeout(function() {
        box.classList.remove('show');
        setTimeout(function() { box.remove(); }, 300);
    }, 3500);
}

window.showLoading = showLoading;
window.showToast   = showToast;


// ── EXPORTAR ──────────────────────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS, ESTADOS_BLOQUEANTES,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    verificarDisponibilidadCabana,
    mensajeConflicto,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    sincronizarDesdeGCal,
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    getHistorialTareas,
    BTG_CATEGORIAS, inferirCategoria, fingerprintMovimiento,
    conciliarMovimientos, importarMovimientosConfirmados,
    matchMovimientoBancario, conciliarContraRegistros,
    guardarConciliacion, cargarConfigConciliacion,
    verificarTarea,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showToast
};
