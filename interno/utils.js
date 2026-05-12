// ============================================================
//  utils.js — Casa Verde Canas  v4.0
//  Funciones compartidas · Sistema activo
//  Arquitectura: 100% Firestore — sin Realtime Database
// ============================================================

// ── FIREBASE ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey:     'AIzaSyAUwzXfj-eVeOKX1IcVrQwusblTvr0WrT4',
    authDomain: 'casaverdecanas-199.firebaseapp.com',
    projectId:  'casaverdecanas-199'
};
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();


// ── CONSTANTES ───────────────────────────────────────────────
const ESTADOS_RESERVA = {
    pendiente:        { label: 'Pendiente',        cssClass: 'badge-pendiente'  },
    confirmada:       { label: 'Confirmada',       cssClass: 'badge-confirmada' },
    anulada:          { label: 'Anulada',          cssClass: 'badge-anulada'    },
    finalizada:       { label: 'Finalizada',       cssClass: 'badge-finalizada' },
    airbnb_activa:    { label: 'Airbnb',           cssClass: 'badge-neutral'    },
    airbnb_cancelada: { label: 'Cancelada Airbnb', cssClass: 'badge-pendiente'  }
};

const ESTADOS_TAREA = {
    pendiente:  { label: 'Pendiente',  cssClass: 'badge-pendiente'  },
    en_curso:   { label: 'En curso',   cssClass: 'badge-en_curso'   },
    finalizada: { label: 'Finalizada', cssClass: 'badge-finalizada' }
};

const PRIORIDADES = {
    alta:  { label: 'Alta',  cssClass: 'badge-alta'  },
    media: { label: 'Media', cssClass: 'badge-media' },
    baja:  { label: 'Baja',  cssClass: 'badge-baja'  }
};

const CALENDAR_IDS = {
    1: 'h5a1h0a8dg9rl0oufvq19hn05r4gbubg@import.calendar.google.com',
    2: '8i3hl5ppqi6al50kf7casj5n5vl9sp1j@import.calendar.google.com',
    3: '60n7foetdu2qvsn16mi7is8j6i4ugm66@import.calendar.google.com'
};

// Configuración GitHub — repositorio de imágenes del sitio.
// El token de acceso se guarda en Firestore: config/github → { token }
// Se gestiona desde cabanas-admin.html (pestaña Contenidos).
const GITHUB_CONFIG = {
    owner:    'casaverdecanas-blip',
    repo:     'Casaverde',
    branch:   'main',
    domain:   'casaverdecanas.com.br',
    maxBytes: 500 * 1024   // 500 KB límite por foto
};


// ── BADGES ───────────────────────────────────────────────────
function badgeEstado(estado) {
    const e = ESTADOS_RESERVA[estado] || ESTADOS_TAREA[estado] || { label: estado, cssClass: 'badge-neutral' };
    return '<span class="badge ' + e.cssClass + '">' + e.label + '</span>';
}

function badgePrioridad(prioridad) {
    const p = PRIORIDADES[prioridad] || { label: prioridad, cssClass: 'badge-neutral' };
    return '<span class="badge ' + p.cssClass + '">' + p.label + '</span>';
}


// ── AUTENTICACIÓN ─────────────────────────────────────────────
function verificarAuth(rolesPermitidos) {
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Firebase no responde (timeout). Verificá tu conexión.'));
        }, 15000);

        auth.onAuthStateChanged(async (user) => {
            clearTimeout(timer);
            if (!user) { window.location.href = 'index.html'; return; }
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (!userDoc.exists) { await auth.signOut(); window.location.href = 'index.html'; return; }
                const userData = userDoc.data();
                if (userData.activo === false) { await auth.signOut(); window.location.href = 'index.html'; return; }
                if (!roles.includes(userData.rol)) {
                    window.location.href = userData.rol === 'user' ? 'tareas.html' : 'index.html';
                    return;
                }
                resolve({ user, userData });
            } catch (e) {
                console.error('verificarAuth:', e);
                reject(e);
            }
        });
    });
}

async function cerrarSesion() {
    await auth.signOut();
    window.location.href = 'index.html';
}


// ── CÁLCULO DE PRECIO ────────────────────────────────────────
function calcularPrecio(cabana, checkIn, checkOut, adultos, ninos) {
    const tarifas       = cabana.tarifas || {};
    const capacidadBase = cabana.capacidad?.base || 2;
    const personasExtra = Math.max(0, (adultos + ninos) - capacidadBase);

    let subtotal = 0, noches = 0;
    let fecha = new Date(checkIn  + 'T12:00:00');
    const fin = new Date(checkOut + 'T12:00:00');

    while (fecha < fin) {
        const fechaStr  = fecha.toISOString().split('T')[0];
        const intervalo = (tarifas.intervalos || []).find(i => i.desde <= fechaStr && i.hasta >= fechaStr);
        subtotal += (intervalo ? intervalo.precioNoche  : (tarifas.precioBase         || 0))
                  + (intervalo ? intervalo.precioExtra  : (tarifas.precioExtraPersona || 0)) * personasExtra;
        fecha.setDate(fecha.getDate() + 1);
        noches++;
    }
    const limpieza = tarifas.precioLimpieza || 0;
    return { noches, subtotal, limpieza, total: subtotal + limpieza };
}


// ── SINCRONIZAR DISPONIBILIDAD PÚBLICA ───────────────────────
async function sincronizarDisponibilidad(reservaId, reservaData) {
    try {
        const estado     = reservaData.estado || 'pendiente';
        const bloqueante = ['confirmada', 'airbnb_activa', 'pendiente'].includes(estado);
        const libre      = ['anulada', 'finalizada', 'airbnb_cancelada'].includes(estado);
        if (libre) { await db.collection('disponibilidad').doc(reservaId).delete(); return; }
        await db.collection('disponibilidad').doc(reservaId).set({
            caba: reservaData.caba, checkIn: reservaData.checkIn, checkOut: reservaData.checkOut,
            estado, bloqueante, origen: reservaData.origen || 'directa',
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.warn('sincronizarDisponibilidad:', e.message); }
}


// ── CREAR TAREA DE LIMPIEZA ──────────────────────────────────
async function crearTareaLimpieza(reservaId, reservaData, creadoPor) {
    const checkOut = reservaData.checkOut?.toDate
        ? reservaData.checkOut.toDate()
        : new Date(reservaData.checkOut);

    let nombreCabana = 'Cabana ' + reservaData.caba;
    try {
        const cabSnap = await db.collection('cabanas').doc(String(reservaData.caba)).get();
        if (cabSnap.exists) {
            const cab = cabSnap.data();
            nombreCabana = cab.nombre?.es || cab.nombre?.pt || ('Cabana ' + reservaData.caba);
        }
    } catch(e) { /* usar fallback */ }

    let proximoHuesped = null;
    try {
        const proxSnap = await db.collection('reservas').where('caba', '==', reservaData.caba).get();
        const proxima  = proxSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => {
                if (!['confirmada', 'pendiente'].includes(r.estado)) return false;
                const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
                return ci > checkOut;
            })
            .sort((a, b) => {
                const ca = a.checkIn?.toDate ? a.checkIn.toDate() : new Date(a.checkIn);
                const cb = b.checkIn?.toDate ? b.checkIn.toDate() : new Date(b.checkIn);
                return ca - cb;
            })[0];

        if (proxima) {
            const ci = proxima.checkIn?.toDate ? proxima.checkIn.toDate() : new Date(proxima.checkIn);
            proximoHuesped = {
                nombre: proxima.nombre || '—', checkIn: ci,
                horaLlegada:    proxima.horaLlegada    || '',
                huespedes:      proxima.huespedes || ((proxima.adultos||0)+(proxima.ninos||0)),
                mascotas:       proxima.mascotas       || 'no',
                niniosPequenos: proxima.niniosPequenos || 'no',
                notas:          proxima.notas          || ''
            };
        }
    } catch(e) { console.warn('proxima reserva:', e); }

    const alertasEntrada = [];
    if (proximoHuesped?.mascotas === 'si')       alertasEntrada.push('🐾 MASCOTAS');
    if (proximoHuesped?.niniosPequenos === 'si') alertasEntrada.push('👶 NIÑOS PEQUEÑOS');

    const lineas = [];
    if (proximoHuesped) {
        lineas.push('🚪 ENTRADA');
        lineas.push('   Cabaña: ' + nombreCabana);
        lineas.push('   Huésped: ' + proximoHuesped.nombre);
        lineas.push('   Personas: ' + proximoHuesped.huespedes);
        lineas.push('   Llega: ' + proximoHuesped.checkIn.toLocaleDateString('es-AR')
            + (proximoHuesped.horaLlegada ? ' a las ' + proximoHuesped.horaLlegada + 'hs' : ' — hora no confirmada'));
        if (proximoHuesped.notas) lineas.push('   Notas: ' + proximoHuesped.notas);
        if (alertasEntrada.length) { lineas.push(''); lineas.push('⚠️ ATENCIÓN: ' + alertasEntrada.join(' · ')); }
    } else {
        lineas.push('🚪 ENTRADA');
        lineas.push('   Cabaña: ' + nombreCabana);
        lineas.push('   Sin reserva siguiente registrada');
    }
    lineas.push('');
    lineas.push('🔑 SALIDA (huésped anterior)');
    lineas.push('   ' + reservaData.nombre + ' · ' + (reservaData.huespedes || ((reservaData.adultos||0)+(reservaData.ninos||0))) + ' personas');
    lineas.push('   Sale: ' + checkOut.toLocaleDateString('es-AR') + (reservaData.horaSalida ? ' a las ' + reservaData.horaSalida + 'hs' : ''));
    if (reservaData.notas) lineas.push('   Notas salida: ' + reservaData.notas);
    lineas.push('');
    lineas.push('💰 Monto limpieza: R$ ' + (reservaData.costoLimpiezaBRL || 0));

    await db.collection('tareas').add({
        nombre:      'Limpiar ' + nombreCabana + ' — ' + reservaData.nombre,
        descripcion: lineas.join('\n'),
        tipo: 'limpieza', prioridad: 'alta', estado: 'pendiente',
        fechaInicio: checkOut.toISOString().split('T')[0],
        recurrencia: 0, monto: reservaData.costoLimpiezaBRL || 0,
        activa: true, reservaId, cabana: reservaData.caba,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: creadoPor || null
    });
}


// ── LÓGICA DE TAREAS ─────────────────────────────────────────

async function iniciarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');
    const todasSnap = await sesionesRef.where('uid', '==', currentUser.uid).get();
    if (todasSnap.docs.find(d => d.data().fin === null)) throw new Error('Ya tenés una sesión activa en esta tarea');
    const ahora = firebase.firestore.Timestamp.now();
    await sesionesRef.add({ uid: currentUser.uid, nombre: currentUser.nombre||currentUser.email, inicio: ahora, fin: null, tareaId });
    const sesActuales = tarea.sesionesActivas || [];
    sesActuales.push({ uid: currentUser.uid, nombre: currentUser.nombre||currentUser.email, inicio: ahora });
    await tareaRef.update({ estado: 'en_curso', sesionesActivas: sesActuales });
}

async function pausarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    if (tareaDoc.data().estado === 'finalizada') throw new Error('La tarea ya fue finalizada');
    const todasSnap  = await sesionesRef.where('uid', '==', currentUser.uid).get();
    const sesAbierta = todasSnap.docs.find(d => d.data().fin === null);
    if (!sesAbierta) throw new Error('No tenés una sesión activa en esta tarea');
    const ahora = firebase.firestore.Timestamp.now();
    await sesAbierta.ref.update({ fin: ahora });
    const todasSnap2     = await sesionesRef.get();
    const quedanAbiertas = todasSnap2.docs.some(d => d.data().fin === null);
    const sesActuales    = (tareaDoc.data().sesionesActivas || []).filter(s => s.uid !== currentUser.uid);
    await tareaRef.update({ estado: quedanAbiertas ? 'en_curso' : 'pendiente', sesionesActivas: sesActuales });
}

async function finalizarTarea(tareaId, currentUser) {
    const tareaRef    = db.collection('tareas').doc(tareaId);
    const sesionesRef = tareaRef.collection('sesiones');
    const tareaDoc    = await tareaRef.get();
    if (!tareaDoc.exists) throw new Error('Tarea no encontrada');
    const tarea = tareaDoc.data();
    if (tarea.estado === 'finalizada') throw new Error('La tarea ya fue finalizada');

    const ahora     = firebase.firestore.Timestamp.now();
    const ahoraDate = ahora.toDate();
    const sesSnap   = await sesionesRef.get();
    let sesiones    = sesSnap.docs.map(d => ({ _ref: d.ref, ...d.data() }));

    if (!sesiones.some(s => s.uid === currentUser.uid)) {
        const ref = await sesionesRef.add({
            uid: currentUser.uid, nombre: currentUser.nombre||currentUser.email,
            inicio: ahora, fin: ahora, tareaId
        });
        sesiones.push({ _ref: ref, uid: currentUser.uid, nombre: currentUser.nombre||currentUser.email, inicio: ahora, fin: ahora });
    }

    const b1 = db.batch();
    for (const s of sesiones) { if (s.fin === null) { b1.update(s._ref, { fin: ahora }); s.fin = ahora; } }
    await b1.commit();

    // CORRECCIÓN #4: excluir colaboradores con 0 horas del historial
    const horasPor = {}, nombrePor = {};
    for (const s of sesiones) {
        const ini = s.inicio?.toDate ? s.inicio.toDate() : new Date(s.inicio);
        const fin = s.fin?.toDate    ? s.fin.toDate()    : new Date(s.fin);
        const hrs = Math.max(0, (fin - ini) / 3600000);
        horasPor[s.uid]  = (horasPor[s.uid]  || 0) + hrs;
        nombrePor[s.uid] = s.nombre;
    }
    const totalHoras    = Object.values(horasPor).reduce((a, b) => a + b, 0);
    const monto         = tarea.monto || 0;
    const colaboradores = Object.entries(horasPor)
        .filter(([, horas]) => horas > 0)
        .map(([uid, horas]) => ({
            uid, nombre: nombrePor[uid],
            horas: parseFloat(horas.toFixed(2)),
            montoRecibido: monto > 0 && totalHoras > 0
                ? parseFloat(((horas / totalHoras) * monto).toFixed(2)) : 0
        }));

    const b2      = db.batch();
    const histRef = db.collection('historial_tareas').doc();
    b2.set(histRef, {
        tareaId, nombre: tarea.nombre, descripcion: tarea.descripcion||'',
        tipo: tarea.tipo||'general', prioridad: tarea.prioridad||'media',
        fechaInicio: tarea.fechaInicio||null, fechaFin: ahoraDate.toISOString().split('T')[0],
        monto, totalHoras: parseFloat(totalHoras.toFixed(2)), colaboradores,
        reservaId: tarea.reservaId||null, cabana: tarea.cabana||null,
        recurrencia: tarea.recurrencia||0, finalizadoPor: currentUser.uid,
        finalizadoEn: ahora, creadoEn: tarea.creadoEn||null
    });
    if (monto > 0) {
        for (const col of colaboradores) {
            if (col.montoRecibido <= 0) continue;
            b2.set(db.collection('honorarios').doc(), {
                colaboradorId: col.uid, colaboradorNombre: col.nombre,
                tareaId, historialId: histRef.id, reservaId: tarea.reservaId||null,
                monto: col.montoRecibido, moneda: 'BRL',
                concepto: 'Tarea: ' + tarea.nombre + ' — ' + ahoraDate.toLocaleDateString('es-AR'),
                horas: col.horas, estado: 'pendiente',
                fechaPago: null, pagadoPor: null, creadoEn: ahora
            });
        }
    }
    const recurrencia = tarea.recurrencia || 0;
    if (recurrencia === 0) {
        b2.delete(tareaRef);
    } else {
        const nuevaFecha = new Date(ahoraDate);
        nuevaFecha.setDate(nuevaFecha.getDate() + recurrencia);
        b2.update(tareaRef, {
            estado: 'pendiente', sesionesActivas: [],
            fechaInicio: nuevaFecha.toISOString().split('T')[0], ultimaVez: ahora
        });
    }
    await b2.commit();
    if (recurrencia > 0) {
        const b3 = db.batch();
        for (const s of sesiones) b3.delete(s._ref);
        await b3.commit();
    }
    return colaboradores;
}


// ── URGENCIA DE TAREA ────────────────────────────────────────
//
//  CORRECCIÓN #1 — semáforo proporcional al ciclo de recurrencia:
//  🔵 Gris    → fecha futura
//  🟢 Verde   → hoy · dentro del ciclo · o en_curso (alguien trabajando)
//  🟡 Amarillo → superó 1 ciclo de recurrencia
//  🔴 Rojo    → superó 2 ciclos, o más de 10 días (lo que ocurra primero)
//
function urgenciaTarea(tarea) {
    if (!tarea.fechaInicio) return { color: 'gris', label: 'Sin fecha' };
    const hoy        = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio     = new Date(tarea.fechaInicio + 'T00:00:00');
    const diasAtraso = Math.floor((hoy - inicio) / 86400000);

    if (diasAtraso < 0)              return { color: 'gris',     label: 'Próximamente'           };
    if (diasAtraso === 0)            return { color: 'verde',    label: 'Hoy'                    };
    if (tarea.estado === 'en_curso') return { color: 'verde',    label: 'En curso'               };

    const ciclo  = tarea.recurrencia > 0 ? tarea.recurrencia : 3;
    const esRojo = diasAtraso > ciclo * 2 || diasAtraso > 10;
    const esAmar = diasAtraso > ciclo;
    if (esRojo) return { color: 'rojo',     label: diasAtraso + 'd de atraso' };
    if (esAmar) return { color: 'amarillo', label: diasAtraso + 'd de atraso' };
    return             { color: 'verde',    label: diasAtraso + 'd de atraso' };
}


// ── UPLOADER DE FOTOS A GITHUB ───────────────────────────────
//  100% Firestore — sin Realtime Database.
//  El token se lee de: config/github → { token }
//  Se configura desde cabanas-admin.html (pestaña Contenidos).

async function _leerTokenGithub() {
    const snap = await db.collection('config').doc('github').get();
    if (!snap.exists || !snap.data().token) {
        throw new Error('Token de GitHub no configurado. Ingresalo en Contenidos → Configuración de GitHub.');
    }
    return snap.data().token;
}

async function _subirBlobAGithub(path, blob, mensaje) {
    const token   = await _leerTokenGithub();
    const content = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Error leyendo el archivo'));
        r.readAsDataURL(blob);
    });
    const resp = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`,
        {
            method:  'PUT',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: mensaje, content, branch: GITHUB_CONFIG.branch })
        }
    );
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `GitHub API error ${resp.status}`);
    }
    return `https://${GITHUB_CONFIG.domain}/${path}`;
}

function _generarNombreArchivo(contexto, categoria, ext) {
    const ts = new Date().toISOString().slice(0,19).replace(/:/g,'-').replace('T','_');
    return `${contexto}_${categoria}_${ts}.${ext}`;
}

// ─────────────────────────────────────────────────────────────
//  abrirUploaderFoto({ contexto, categoria, onConfirm })
//
//  contexto:  'cabin-1' | 'cabin-2' | 'cabin-3' | 'common'
//  categoria: 'fotos' | 'piscina' | 'barbacoa' | etc.
//  onConfirm: function({ url, titulo, descripcion, path })
// ─────────────────────────────────────────────────────────────
function abrirUploaderFoto({ contexto, categoria, onConfirm }) {
    document.getElementById('_cvUploader')?.remove();

    const modal = document.createElement('div');
    modal.id = '_cvUploader';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;';
    modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:500px;max-height:92vh;overflow-y:auto;padding:24px;box-shadow:0 24px 56px rgba(0,0,0,.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h3 style="font-size:1rem;color:#2E5A31;margin:0;">📸 Agregar foto</h3>
        <button id="_uClose" style="background:none;border:none;font-size:26px;cursor:pointer;color:#999;line-height:1;">×</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:2px solid #e8f5e9;padding-bottom:10px;">
        <button id="_uTabFile" onclick="_uTab('file')" style="padding:6px 16px;border-radius:20px;border:none;font-weight:700;cursor:pointer;background:#2E5A31;color:#fff;font-size:13px;">📁 Subir archivo</button>
        <button id="_uTabUrl"  onclick="_uTab('url')"  style="padding:6px 16px;border-radius:20px;border:none;font-weight:700;cursor:pointer;background:#eee;color:#555;font-size:13px;">🔗 URL externa</button>
      </div>
      <div id="_uPanelFile">
        <div id="_uDrop" onclick="document.getElementById('_uFileIn').click()" style="border:2px dashed #2E5A31;border-radius:12px;padding:22px;text-align:center;cursor:pointer;background:#f9fdf9;margin-bottom:10px;">
          <div style="font-size:2rem;margin-bottom:6px;">📷</div>
          <div style="font-weight:600;color:#2E5A31;font-size:14px;">Seleccioná una imagen</div>
          <div style="font-size:11px;color:#888;margin-top:3px;">JPG · PNG · WEBP · máx 500 KB</div>
          <input type="file" id="_uFileIn" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="_uArchivoSel(this.files[0])">
        </div>
        <div id="_uFileErr" style="display:none;color:#c0392b;font-size:12px;background:#fdf0f0;padding:9px 12px;border-radius:8px;margin-bottom:10px;"></div>
        <div id="_uFilePrev" style="display:none;margin-bottom:14px;">
          <img id="_uFileImg" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #e0e0e0;">
          <div id="_uFileInfo" style="font-size:10px;color:#888;margin-top:4px;font-family:monospace;"></div>
        </div>
      </div>
      <div id="_uPanelUrl" style="display:none;">
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <input id="_uUrlIn" type="url" placeholder="https://..." style="flex:1;padding:8px 11px;border:1px solid #ddd;border-radius:8px;font-size:13px;">
          <button onclick="_uCargarUrl()" style="padding:8px 14px;background:#2E5A31;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;font-size:13px;">Cargar</button>
        </div>
        <div id="_uUrlErr" style="display:none;color:#c0392b;font-size:12px;background:#fdf0f0;padding:9px 12px;border-radius:8px;margin-bottom:10px;"></div>
        <div id="_uUrlPrev" style="display:none;margin-bottom:14px;">
          <img id="_uUrlImg" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #e0e0e0;">
        </div>
      </div>
      <div id="_uCampos" style="display:none;">
        <div style="margin-bottom:10px;">
          <label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;color:#333;">Título <span style="color:#c0392b;">*</span></label>
          <input id="_uTitulo" type="text" placeholder="Ej: Vista desde la galería" style="width:100%;padding:8px 11px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:18px;">
          <label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;color:#333;">Descripción <span style="color:#999;font-weight:400;">(opcional)</span></label>
          <textarea id="_uDesc" rows="2" placeholder="Descripción breve..." style="width:100%;padding:8px 11px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button id="_uBtnOk" onclick="_uConfirmar()" style="flex:1;padding:11px;background:#2E5A31;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">✅ Confirmar y agregar</button>
          <button onclick="_uCerrar()" style="padding:11px 18px;background:#eee;color:#555;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">Cancelar</button>
        </div>
        <div id="_uProgreso" style="display:none;margin-top:10px;text-align:center;font-size:13px;color:#2E5A31;font-weight:600;"></div>
      </div>
    </div>`;
    document.body.appendChild(modal);

    let _e = { tab:'file', blob:null, urlExt:null, ext:'jpg', listo:false };

    window._uTab = t => {
        _e.tab = t; _e.listo = false;
        document.getElementById('_uCampos').style.display    = 'none';
        document.getElementById('_uTabFile').style.background = t==='file'?'#2E5A31':'#eee';
        document.getElementById('_uTabFile').style.color      = t==='file'?'#fff':'#555';
        document.getElementById('_uTabUrl').style.background  = t==='url' ?'#2E5A31':'#eee';
        document.getElementById('_uTabUrl').style.color       = t==='url' ?'#fff':'#555';
        document.getElementById('_uPanelFile').style.display  = t==='file'?'':'none';
        document.getElementById('_uPanelUrl').style.display   = t==='url' ?'':'none';
        document.getElementById('_uFileErr').style.display    = 'none';
        document.getElementById('_uUrlErr').style.display     = 'none';
    };

    window._uArchivoSel = file => {
        const err = document.getElementById('_uFileErr');
        const pr  = document.getElementById('_uFilePrev');
        const c   = document.getElementById('_uCampos');
        err.style.display = pr.style.display = c.style.display = 'none';
        _e.listo = false; _e.blob = null;
        if (!file) return;
        if (file.size > GITHUB_CONFIG.maxBytes) {
            err.textContent = `⚠ El archivo pesa ${(file.size/1024).toFixed(0)} KB. El máximo es 500 KB.`;
            err.style.display = 'block'; return;
        }
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['jpg','jpeg','png','webp'].includes(ext)) {
            err.textContent = '⚠ Formato no soportado. Usá JPG, PNG o WEBP.';
            err.style.display = 'block'; return;
        }
        _e.blob = file; _e.ext = ext==='jpeg'?'jpg':ext;
        const r = new FileReader();
        r.onload = ev => {
            document.getElementById('_uFileImg').src = ev.target.result;
            document.getElementById('_uFileInfo').textContent = `${file.name} · ${(file.size/1024).toFixed(0)} KB ✅`;
            pr.style.display = c.style.display = 'block'; _e.listo = true;
        };
        r.readAsDataURL(file);
    };

    window._uCargarUrl = () => {
        const url = document.getElementById('_uUrlIn').value.trim();
        const err = document.getElementById('_uUrlErr');
        const pr  = document.getElementById('_uUrlPrev');
        const c   = document.getElementById('_uCampos');
        err.style.display = pr.style.display = c.style.display = 'none';
        _e.listo = false; _e.urlExt = null;
        if (!url) { err.textContent = '⚠ Ingresá una URL.'; err.style.display='block'; return; }
        const img = document.getElementById('_uUrlImg');
        img.onload  = () => { pr.style.display = c.style.display = 'block'; _e.urlExt = url; _e.listo = true; };
        img.onerror = () => { err.textContent = '⚠ No se pudo cargar la imagen.'; err.style.display='block'; };
        img.src = url;
    };

    window._uConfirmar = async () => {
        if (!_e.listo) return;
        const titulo = document.getElementById('_uTitulo').value.trim();
        if (!titulo) { const t = document.getElementById('_uTitulo'); t.style.borderColor='#c0392b'; t.focus(); return; }
        document.getElementById('_uTitulo').style.borderColor = '';
        const descripcion = document.getElementById('_uDesc').value.trim();
        const prog = document.getElementById('_uProgreso');
        const btn  = document.getElementById('_uBtnOk');
        btn.disabled = true; btn.textContent = '⏳ Procesando...';
        prog.style.color = '#2E5A31';
        try {
            let url, path = null;
            if (_e.tab === 'url' && _e.urlExt) {
                url = _e.urlExt; prog.textContent = '✅ URL registrada.'; prog.style.display = 'block';
            } else if (_e.tab === 'file' && _e.blob) {
                prog.textContent = '📤 Subiendo a GitHub...'; prog.style.display = 'block';
                const nombre = _generarNombreArchivo(contexto, categoria, _e.ext);
                path = `img/${contexto}/${categoria}/${nombre}`;
                url  = await _subirBlobAGithub(path, _e.blob, `Foto: ${titulo}`);
                prog.textContent = '✅ Subida exitosa.';
            } else { throw new Error('No hay imagen seleccionada.'); }
            await new Promise(r => setTimeout(r, 500));
            _uCerrar();
            onConfirm({ url, titulo, descripcion, path });
        } catch(e) {
            prog.textContent = '❌ ' + e.message; prog.style.color = '#c0392b'; prog.style.display = 'block';
            btn.disabled = false; btn.textContent = '✅ Confirmar y agregar';
        }
    };

    window._uCerrar = () => {
        document.getElementById('_cvUploader')?.remove();
        ['_uTab','_uArchivoSel','_uCargarUrl','_uConfirmar','_uCerrar'].forEach(fn => delete window[fn]);
    };

    document.getElementById('_uClose').onclick = window._uCerrar;
    modal.addEventListener('click', ev => { if (ev.target === modal) window._uCerrar(); });
}


// ── HELPERS ───────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function formatFecha(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR');
}
function formatFechaHora(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-AR');
}
function formatHoras(horas) {
    if (!horas || horas <= 0) return '0m';
    const h = Math.floor(horas), m = Math.round((horas-h)*60);
    if (h===0) return m+'m'; if (m===0) return h+'h'; return h+'h '+m+'m';
}
const COLORES_CABANAS = ['#FF9800','#3498db','#2ecc71','#9b59b6','#e74c3c','#1abc9c'];
function colorCabana(i) { return COLORES_CABANAS[i % COLORES_CABANAS.length]; }


// ── HELPERS DE UI ────────────────────────────────────────────
function showLoading(container, msg) {
    const el = typeof container==='string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-loading"><div class="spinner"></div><span>' + escapeHtml(msg||'Cargando...') + '</span></div>';
}
function showEmpty(container, titulo, desc, icono) {
    const el = typeof container==='string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = '<div class="state-empty"><span class="material-icons">' + escapeHtml(icono||'inbox') + '</span>'
        + '<div class="state-empty__title">' + escapeHtml(titulo||'Sin datos') + '</div>'
        + (desc ? '<div class="state-empty__desc">' + escapeHtml(desc) + '</div>' : '') + '</div>';
}
function showError(container, titulo, desc, onRetry) {
    const el = typeof container==='string' ? document.querySelector(container) : container;
    if (!el) return;
    const rid = onRetry ? 'retry-' + Date.now() : null;
    el.innerHTML = '<div class="state-error"><span class="material-icons">error_outline</span>'
        + '<div class="state-error__title">' + escapeHtml(titulo||'Ocurrió un error') + '</div>'
        + (desc ? '<div class="state-error__desc">' + escapeHtml(desc) + '</div>' : '')
        + (rid ? '<button class="btn btn-secondary" id="' + rid + '"><span class="material-icons">refresh</span> Reintentar</button>' : '')
        + '</div>';
    if (rid) document.getElementById(rid).addEventListener('click', onRetry);
}
function showToast(msg, tipo) {
    tipo = tipo||'success';
    const iconos = { success:'check_circle', error:'error', warning:'warning', info:'info' };
    let wrap = document.getElementById('cvc-toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id='cvc-toasts'; wrap.className='toast-container'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + tipo;
    t.innerHTML = '<span class="material-icons">' + (iconos[tipo]||'info') + '</span><span>' + escapeHtml(msg) + '</span>';
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3300);
}


// ── NAV CENTRALIZADA ─────────────────────────────────────────
const NAV_ADMIN_ITEMS = [
    { href: 'dashboard.html',     icon: 'dashboard',       label: 'Dashboard'    },
    { href: 'reservas.html',      icon: 'event',           label: 'Reservas'     },
    { href: 'presupuestos.html',  icon: 'request_quote',   label: 'Presupuestos' },
    { href: 'pagos.html',         icon: 'payments',        label: 'Finanzas'     },
    { href: 'clientes.html',      icon: 'people',          label: 'Clientes'     },
    { href: 'cabanas-admin.html', icon: 'photo_library',   label: 'Contenidos'   },
    { href: 'tareas.html',        icon: 'checklist',       label: 'Tareas'       },
    { href: 'calendario.html',    icon: 'calendar_month',  label: 'Calendario'   },
    { href: 'usuarios.html',      icon: 'manage_accounts', label: 'Usuarios'     }
];

const NAV_USER_ITEMS = [
    { href: 'tareas.html', icon: 'checklist', label: 'Tareas'     },
    { href: 'pagos.html',  icon: 'payments',  label: 'Mis cobros' }
];

function renderNav(paginaActiva, rol) {
    rol = rol || 'admin';
    const el = document.getElementById('appNav') || document.querySelector('.admin-nav');
    if (!el) return;
    const items = rol === 'admin' ? NAV_ADMIN_ITEMS : NAV_USER_ITEMS;
    el.innerHTML = items.map(item => {
        const activo = item.href === paginaActiva || item.href.replace('.html','') === paginaActiva;
        return '<a href="' + item.href + '" class="nav-item' + (activo?' active':'') + '">'
            + '<span class="material-icons">' + item.icon + '</span> ' + item.label + '</a>';
    }).join('');
}


// ── EXPORTAR ─────────────────────────────────────────────────
window.CVC = {
    db, auth,
    ESTADOS_RESERVA, ESTADOS_TAREA, PRIORIDADES, CALENDAR_IDS, GITHUB_CONFIG,
    NAV_ADMIN_ITEMS, NAV_USER_ITEMS, renderNav,
    badgeEstado, badgePrioridad,
    verificarAuth, cerrarSesion,
    calcularPrecio,
    crearTareaLimpieza,
    sincronizarDisponibilidad,
    iniciarTarea, pausarTarea, finalizarTarea, urgenciaTarea,
    abrirUploaderFoto,
    escapeHtml, formatFecha, formatFechaHora, formatHoras, colorCabana,
    showLoading, showEmpty, showError, showToast
};
