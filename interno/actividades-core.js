// =========================================================
//  actividades-core.js — Casa Verde Canas
//  Motor de cronómetro + honorario para la colección 'actividades'.
//
//  Portado de iniciarTarea / pausarTarea / finalizarTarea de utils.js,
//  apuntando a 'actividades' y escribiendo en el MISMO espinazo contable
//  (historial_tareas + honorarios) para no romper limpieza-stats ni pagos.
//
//  Se ENGANCHA a window.CVC (NO lo redefine). Cargar SIEMPRE después de
//  utils.js (del que solo usa la plataforma: db, auth, toast, foto+Cloudinary,
//  avisos). La LÓGICA de actividades es propia y autosuficiente: temporada,
//  ciclo de recurrencia y semáforo viven acá, NO se toman de utils.js. Así
//  esta sección no depende del sistema viejo de tareas.
//
//  Convivencia: utils.js sigue manejando la colección 'tareas' para el
//  tareas.html viejo. Cuando se jubile (T6), este pasa a ser el único motor.
//
//  v4.41 — Denormalización de sesiones para collectionGroup:
//   - Al crear una sesión se copian alcance, creadoPor y competencias
//   - Permite collectionGroup con reglas simples (sin get() al padre)
//
//  v4.43 — CORRECCIÓN DE RAÍZ:
//   - _sincronizarSesionesActivas(): reconstruye sesionesActivas desde subcolección
//   - actSincronizarSesiones(): función pública para limpiar referencias huérfanas
//   - actIniciar() llama a sincronización antes de crear nueva sesión
//   - actPausar() sincroniza después de pausar
//   - actTildar() sincroniza antes de tildar
// =========================================================
(function () {
  var CVC = window.CVC;
  if (!CVC || !CVC.db) {
    if (window.console) console.error('actividades-core: window.CVC no disponible (cargá utils.js antes).');
    return;
  }
  var db = CVC.db;

  // ── Helpers (réplica fiel de utils.js) ──────────────────
  function tsAhora() { return firebase.firestore.Timestamp.now(); }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function aDateSeguro(v) { if (!v) return null; var d = v.toDate ? v.toDate() : new Date(v); return isNaN(d.getTime()) ? null : d; }
  function sumarDiasISO(dias) { var f = new Date(); f.setDate(f.getDate() + dias); return f.toISOString().split('T')[0]; }
  function nombreDe(t) { return t.titulo || t.nombre || ''; }

  // ── Temporada (copia autosuficiente, NO depende de utils.js) ──
  var _tempCfg = null, _tempActual = null;
  function _tempDefault() { return { modo: 'manual', actual: 'media', rangos: [], factores: { alta: 1, media: 1, baja: 1 } }; }
  function _mmdd(d) { var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m; var dd = String(d.getDate()); if (dd.length < 2) dd = '0' + dd; return m + '-' + dd; }
  function _enRango(mmdd, desde, hasta) { if (!desde || !hasta) return false; if (desde <= hasta) return mmdd >= desde && mmdd <= hasta; return mmdd >= desde || mmdd <= hasta; }
  function _calcTemporada(cfg, fecha) {
    fecha = fecha || new Date();
    if (!cfg) return 'media';
    if (cfg.modo === 'manual') return cfg.actual || 'media';
    var mmdd = _mmdd(fecha);
    var rangos = cfg.rangos || [];
    for (var i = 0; i < rangos.length; i++) { if (_enRango(mmdd, rangos[i].desde, rangos[i].hasta)) return rangos[i].temporada || 'media'; }
    return 'media';
  }
  function actCargarTemporada(forzar) {
    if (_tempCfg && !forzar) return Promise.resolve({ cfg: _tempCfg, actual: _tempActual });
    return db.collection('config').doc('temporada').get().then(function (doc) {
      _tempCfg = doc.exists ? doc.data() : _tempDefault();
      if (!_tempCfg.factores) _tempCfg.factores = { alta: 1, media: 1, baja: 1 };
      _tempActual = _calcTemporada(_tempCfg);
      return { cfg: _tempCfg, actual: _tempActual };
    }).catch(function () { _tempCfg = _tempDefault(); _tempActual = 'media'; return { cfg: _tempCfg, actual: _tempActual }; });
  }
  function _temporada() { return _tempActual || 'media'; }
  function _factor(temp) { var f = (_tempCfg && _tempCfg.factores) ? _tempCfg.factores[temp] : 1; f = parseFloat(f); return (!isNaN(f) && f > 0) ? f : 1; }

  // ── Ciclo efectivo (recurrencia + temporada), propio del core ──
  function actCiclo(t, temp) {
    temp = temp || _temporada();
    var rt = t.recurrenciaTemporada;
    if (rt && typeof rt === 'object') { var v = parseInt(rt[temp], 10); if (!isNaN(v)) return v; }
    var base = parseInt(t.recurrencia, 10) || 0;
    if (base <= 0) return 0;
    return Math.max(1, Math.round(base * _factor(temp)));
  }

  // ── Semáforo (regla nueva) ──────────────────────────────
  //  fechaInicio = cuándo la actividad ENTRA en plazo (deja de descansar).
  //  El límite (cuándo se pone roja) = fechaInicio + ciclo.
  //  gris  : todavía descansando (fechaInicio en el futuro) -> muestra "próx"
  //  verde : ya en plazo, primera mitad del ciclo -> muestra "límite"
  //  amarillo : segunda mitad del ciclo -> muestra "límite"
  //  rojo  : pasó el límite (atrasada) -> muestra "venció"; o vencimiento/check-in encima
  //  Devuelve { color, label, rank, fecha, fechaTipo } (fechaTipo: prox|limite|vencio).
  //  No recurrente: usa la prioridad elegida a mano.
  function _diasEntre(isoA, isoB) {
    var a = new Date(String(isoA).slice(0, 10) + 'T00:00:00');
    var b = new Date(String(isoB).slice(0, 10) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((a - b) / 86400000);
  }
  function _sumarISO(iso, dias) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + (dias || 0));
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var dd = String(d.getDate()); if (dd.length < 2) dd = '0' + dd;
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  function _porPrioridad(p) {
    if (p === 'rojo') return { color: 'rojo', label: '', rank: 1, fecha: '', fechaTipo: '' };
    if (p === 'amarillo') return { color: 'amarillo', label: '', rank: 2, fecha: '', fechaTipo: '' };
    if (p === 'verde') return { color: 'verde', label: '', rank: 3, fecha: '', fechaTipo: '' };
    return { color: 'gris', label: '', rank: 5, fecha: '', fechaTipo: '' };
  }
  function actSemaforo(t) {
    if (!t) return { color: 'gris', label: '', rank: 5, fecha: '', fechaTipo: '' };
    var hoyISO = sumarDiasISO(0);
    // 1) Vencimiento duro (límite / limpieza antes de check-in): rojo al acercarse o pasar
    var venc = t.fechaCheckIn || t.fechaVencimiento;
    if (venc) {
      var d2 = _diasEntre(venc, hoyISO);
      if (d2 !== null) {
        if (d2 <= 2) return { color: 'rojo', label: (d2 < 0 ? ('Atrasada ' + Math.abs(d2) + 'd') : (d2 === 0 ? 'Vence hoy' : ('Vence en ' + d2 + 'd'))), rank: -100 + Math.min(d2, 0), fecha: venc, fechaTipo: (d2 < 0 ? 'vencio' : 'limite') };
        return { color: 'amarillo', label: 'Vence en ' + d2 + 'd', rank: 2, fecha: venc, fechaTipo: 'limite' };
      }
    }
    var ciclo = actCiclo(t);
    // 2) Recurrente: fechaInicio = cuándo entra en plazo; el límite (rojo) es fechaInicio + ciclo
    if (ciclo > 0 && t.fechaInicio) {
      var el = _diasEntre(hoyISO, t.fechaInicio);
      if (el === null) return _porPrioridad(t.prioridad);
      var limite = _sumarISO(t.fechaInicio, ciclo);
      if (el < 0) return { color: 'gris', label: '', rank: 5, fecha: t.fechaInicio, fechaTipo: 'prox' };
      if (el > ciclo) return { color: 'rojo', label: 'Atrasada ' + (el - ciclo) + 'd', rank: -(el - ciclo), fecha: limite, fechaTipo: 'vencio' };
      if (el >= ciclo / 2) { var falta = ciclo - el; return { color: 'amarillo', label: (falta <= 0 ? 'Vence hoy' : ('Vence en ' + falta + 'd')), rank: 2, fecha: limite, fechaTipo: 'limite' }; }
      return { color: 'verde', label: 'A tiempo', rank: 3, fecha: limite, fechaTipo: 'limite' };
    }
    // 3) No recurrente (con o sin fecha): prioridad manual
    return _porPrioridad(t.prioridad);
  }

  // ── ══════════════════════════════════════════════════════
  //  CORRECCIÓN v4.43: Sincronizar sesionesActivas
  //  con la subcolección real
  // ════════════════════════════════════════════════════════
  async function _sincronizarSesionesActivas(actId, ref) {
    try {
      var snap = await ref.get();
      if (!snap.exists) return null;

      var sesSnap = await ref.collection('sesiones').get();
      var activasReales = [];
      var ahora = tsAhora();

      sesSnap.forEach(function(d) {
        var s = d.data();
        if (s.fin === null || s.fin === undefined) {
          activasReales.push({
            uid: s.uid,
            nombre: s.nombre || '',
            inicio: s.inicio || ahora
          });
        }
      });

      // Solo actualizar si cambió
      var t = snap.data();
      var activasActuales = t.sesionesActivas || [];
      var cambio = activasActuales.length !== activasReales.length;

      if (!cambio) {
        for (var i = 0; i < activasActuales.length; i++) {
          var a = activasActuales[i];
          var encontrada = activasReales.some(function(r) {
            return r.uid === a.uid && r.inicio && a.inicio &&
                   r.inicio.toMillis && a.inicio.toMillis &&
                   Math.abs(r.inicio.toMillis() - a.inicio.toMillis()) < 1000;
          });
          if (!encontrada) { cambio = true; break; }
        }
      }

      if (cambio) {
        await ref.update({
          sesionesActivas: activasReales,
          estado: activasReales.length ? 'en_curso' : 'pendiente'
        });
        return activasReales;
      }
      return activasActuales;
    } catch (e) {
      console.warn('Error sincronizando sesiones:', e.message);
      return null;
    }
  }

  // ── ▶ Iniciar mi sesión de cronómetro ───────────────────
  async function actIniciar(actId, user) {
    if (!user || !user.uid) { return db.collection('actividades').doc(actId).update({ estado: 'en_curso' }); }

    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();

    // ── CORRECCIÓN v4.43: Primero sincronizar sesionesActivas ──
    var activas = await _sincronizarSesionesActivas(actId, ref);

    // Verificar si ya tengo una sesión activa
    if (activas && activas.some(function (s) { return s.uid === user.uid; })) {
      return; // ya tengo una sesión abierta
    }

    var ahora = tsAhora();

    // Crear la sesión en la subcolección
    await ref.collection('sesiones').add({
      uid: user.uid,
      nombre: user.nombre || '',
      inicio: ahora,
      fin: null,
      alcance: t.alcance || 'personal',
      creadoPor: t.creadoPor || null,
      competencias: t.competencias || []
    });

    // Agregar al array y guardar
    var nuevasActivas = activas || [];
    nuevasActivas.push({ uid: user.uid, nombre: user.nombre || '', inicio: ahora });
    await ref.update({ estado: 'en_curso', sesionesActivas: nuevasActivas });
  }

  // ── ⏸ Pausar mi sesión ──────────────────────────────────
  async function actPausar(actId, user) {
    var ref = db.collection('actividades').doc(actId);
    if (!user || !user.uid) { return ref.update({ estado: 'pendiente', sesionesActivas: [] }); }

    var ahora = tsAhora();
    var snap = await ref.get();
    if (!snap.exists) return;

    // Buscar mi sesión abierta en la subcolección
    var sesSnap = await ref.collection('sesiones')
      .where('uid', '==', user.uid)
      .get();

    var miSesion = null;
    sesSnap.forEach(function(d) {
      var s = d.data();
      if (s.fin === null || s.fin === undefined) {
        miSesion = { ref: d.ref, data: s };
      }
    });

    if (miSesion) {
      await miSesion.ref.update({ fin: ahora });
    }

    // ── CORRECCIÓN v4.43: Sincronizar sesionesActivas ──
    await _sincronizarSesionesActivas(actId, ref);
  }

  // ── Cierre de ciclo ──────────────────────────────────────
  async function cerrarCiclo(ref, t, sesDocs, user, conCrono) {
    try { await actCargarTemporada(); } catch (e) { }
    var ciclo = actCiclo(t);

    if (sesDocs && sesDocs.length) {
      var batch = db.batch();
      sesDocs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }

    var meta = {
      ultimaRealizacion: sumarDiasISO(0),
      ultimaRealizacionPor: (user && user.nombre) ? user.nombre : '',
      ultimaRealizacionConCrono: !!conCrono
    };

    // ── CORRECCIÓN v4.43: Limpiar sesionesActivas ──
    if (ciclo > 0) {
      await ref.update(Object.assign({
        estado: 'pendiente',
        fechaInicio: sumarDiasISO(ciclo),
        sesionesActivas: [],
        hecho: false,
        hechoPor: null,
        hechoEn: null
      }, meta));
    } else {
      await ref.update(Object.assign({
        estado: 'finalizada',
        sesionesActivas: [],
        hecho: true,
        hechoPor: (user && user.uid) ? user.uid : null,
        hechoEn: serverTs(),
        finalizadoEn: serverTs()
      }, meta));
    }
  }

  // ── ⏹ Finalizar con honorario proporcional ──────────────
  async function actFinalizar(actId, user) {
    user = user || {};
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    var ahora = tsAhora();

    // 1. Obtener todas las sesiones
    var sesSnap = await ref.collection('sesiones').get();

    // 2. Cerrar sesiones abiertas (si las hay)
    var batchCierre = db.batch();
    var huboAbiertas = false;
    sesSnap.docs.forEach(function (d) {
      var s = d.data();
      if (s.fin === null || s.fin === undefined) {
        batchCierre.update(d.ref, { fin: ahora });
        huboAbiertas = true;
      }
    });
    if (huboAbiertas) await batchCierre.commit();

    // 3. Releer para obtener todas con fin
    var sesSnap2 = await ref.collection('sesiones').get();

    // 4. Calcular horas por colaborador
    var porUid = {};
    sesSnap2.docs.forEach(function (d) {
      var s = d.data();
      if (s.invalidada) return;
      var ini = aDateSeguro(s.inicio);
      var fin = aDateSeguro(s.fin) || aDateSeguro(ahora);
      if (!ini || !fin) return;
      var horas = Math.max(0, (fin - ini) / 3600000);
      if (!porUid[s.uid]) porUid[s.uid] = { uid: s.uid, nombre: s.nombre || '', horas: 0 };
      porUid[s.uid].horas += horas;
    });

    var lista = Object.keys(porUid).map(function (k) { return porUid[k]; });
    var totalHoras = lista.reduce(function (sum, c) { return sum + c.horas; }, 0);
    var montoTarea = t.monto || 0;

    // 5. Reparto proporcional
    var colaboradores = lista.map(function (c) {
      var proporcion = totalHoras > 0 ? (c.horas / totalHoras) : 0;
      return {
        uid: c.uid,
        nombre: c.nombre,
        horas: Math.round(c.horas * 100) / 100,
        montoRecibido: Math.round(montoTarea * proporcion * 100) / 100
      };
    });
    var montoAsignado = colaboradores.reduce(function (s, c) { return s + c.montoRecibido; }, 0);

    // 6. Costo de limpieza
    var costoLimpiezaBRL = 0;
    if (t.reservaId) {
      try { var rSnap = await db.collection('reservas').doc(t.reservaId).get(); if (rSnap.exists) costoLimpiezaBRL = rSnap.data().costoLimpiezaBRL || 0; } catch (e) { }
    }

    // 7. Registro en historial_tareas
    await db.collection('historial_tareas').add({
      tareaId: actId,
      nombre: nombreDe(t),
      tipo: t.tipo || 'general',
      cabana: (t.cabana !== undefined && t.cabana !== null) ? t.cabana : null,
      tipoRegistro: 'finalizada',
      conCronometro: true,
      totalHoras: Math.round(totalHoras * 100) / 100,
      monto: Math.round(montoAsignado * 100) / 100,
      costoLimpiezaBRL: costoLimpiezaBRL,
      colaboradores: colaboradores,
      finalizadoEn: serverTs(),
      finalizadoNombre: user.nombre || '',
      finalizadoPor: user.uid || null
    });

    // 8. Honorarios pendientes
    for (var i = 0; i < colaboradores.length; i++) {
      var c = colaboradores[i];
      if (c.montoRecibido <= 0) continue;
      await db.collection('honorarios').add({
        uid: c.uid,
        nombre: c.nombre,
        tareaId: actId,
        concepto: nombreDe(t) || 'Actividad',
        horas: c.horas,
        monto: c.montoRecibido,
        estado: 'pendiente',
        creadoEn: serverTs()
      });
    }

    // 9. Reprogramar o finalizar (limpia sesionesActivas)
    await cerrarCiclo(ref, t, sesSnap2.docs, user, true);

    return colaboradores;
  }

  // ── Tildar: dar por realizada SIN cronómetro ─────────────
  async function actTildar(actId, user) {
    user = user || {};
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();

    // ── CORRECCIÓN v4.43: Limpiar referencias huérfanas ──
    await _sincronizarSesionesActivas(actId, ref);

    // Registro sin tiempo
    await db.collection('historial_tareas').add({
      tareaId: actId,
      nombre: nombreDe(t),
      tipo: t.tipo || 'general',
      cabana: (t.cabana !== undefined && t.cabana !== null) ? t.cabana : null,
      tipoRegistro: 'tildada',
      conCronometro: false,
      totalHoras: 0,
      monto: 0,
      costoLimpiezaBRL: 0,
      colaboradores: [{ uid: user.uid || null, nombre: user.nombre || '', horas: 0, montoRecibido: 0 }],
      finalizadoEn: serverTs(),
      finalizadoNombre: user.nombre || '',
      finalizadoPor: user.uid || null
    });

    await cerrarCiclo(ref, t, [], user, false);
  }

  // ── Sincronizar sesionesActivas (función pública) ──────
  async function actSincronizarSesiones(actId) {
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) return;
    return await _sincronizarSesionesActivas(actId, ref);
  }

  // ═══════════════════════════════════════════════════════════════
  //  FUNCIONES DE CHEQUEO DE INVENTARIO (restauradas)
  // ═══════════════════════════════════════════════════════════════

  // ── Chequeo de inventario (check-in/check-out por sub-ítems) ──
  function _faltanteONota(cantSugerida, cantConfirmada, nota) {
    return (cantConfirmada < (cantSugerida || 0)) || !!(nota && nota.trim());
  }

  // Evita duplicar: si ya hay un faltante ABIERTO (hecho:false) para ese ítem en esa cabaña, no crea otro.
  async function actRegistrarFaltante(cabana, itemNombre, origen, reservaId, nota, user) {
    var parentCat = 'faltantes-cab-' + cabana;
    var snap = await db.collection('actividades').where('parentId', '==', parentCat).get();
    var yaAbierto = false;
    snap.forEach(function (d) {
      var x = d.data();
      if (x.itemNombre === itemNombre && x.hecho === false) yaAbierto = true;
    });
    if (yaAbierto) return;
    var padre = null;
    var pSnap = await db.collection('actividades').doc(parentCat).get();
    if (pSnap.exists) padre = pSnap.data();
    var ref = db.collection('actividades').doc();
    await ref.set({
      titulo: itemNombre + (nota ? ' \u2014 ' + nota : ''),
      nombre: itemNombre,
      detalle: '',
      tipo: 'faltante-inventario',
      itemNombre: itemNombre,
      origen: origen,
      cabana: cabana,
      reservaId: reservaId || null,
      parentId: parentCat,
      raizId: (padre && padre.raizId) || 'proj-limpiezas',
      tipoRaiz: (padre && padre.tipoRaiz) || 'proyecto',
      color: '',
      alcance: (padre && padre.alcance) || 'equipo',
      competencias: (padre && padre.competencias) || [],
      cronometrable: false,
      monto: 0,
      recurrencia: 0,
      esCompra: false,
      estado: 'pendiente',
      prioridad: 'rojo',
      hecho: false,
      hechoPor: null,
      hechoEn: null,
      orden: Date.now(),
      creadoPor: (user && user.uid) || null,
      creadoNombre: (user && user.nombre) || '',
      creadoEn: serverTs()
    });
  }

  // Genera, una sola vez (idempotente), el chequeo de SALIDA como hijo de ctrl-<reservaId>
  function _slugCat(s) {
    return String(s || 'general').toLowerCase()
      .replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[íì]/g, 'i')
      .replace(/[óòôõ]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
  }

  async function actCrearChequeoSalida(reservaId, cabana, itemsConfirmados, user) {
    var chequeoId = 'chk-ctrl-' + reservaId;
    var refChk = db.collection('actividades').doc(chequeoId);
    var s = await refChk.get();
    if (s.exists) return;
    var padreSnap = await db.collection('actividades').doc('ctrl-' + reservaId).get();
    if (!padreSnap.exists) return;
    var uidC = (user && user.uid) || null, nomC = (user && user.nombre) || '';
    await refChk.set({
      titulo: 'Chequeo de inventario \u2014 salida',
      nombre: 'Chequeo de inventario \u2014 salida',
      detalle: '',
      tipo: 'chequeo-inventario',
      tipoChequeo: 'salida',
      tipoRaiz: 'proyecto',
      color: '',
      parentId: 'ctrl-' + reservaId,
      raizId: 'proj-limpiezas',
      orden: 0,
      alcance: 'equipo',
      competencias: [],
      cronometrable: false,
      estado: 'pendiente',
      prioridad: 'gris',
      monto: 0,
      recurrencia: 0,
      esCompra: false,
      hecho: false,
      cabana: cabana,
      reservaId: reservaId,
      creadoPor: uidC,
      creadoNombre: nomC,
      creadoEn: serverTs()
    });
    var lista = itemsConfirmados || [];
    var cats = [], porCat = {};
    for (var n = 0; n < lista.length; n++) {
      var it = lista[n];
      var catNom = it.categoria || 'General';
      if (!porCat[catNom]) { porCat[catNom] = []; cats.push(catNom); }
      porCat[catNom].push(it);
    }
    for (var c = 0; c < cats.length; c++) {
      var catId = 'cat-' + chequeoId + '-' + _slugCat(cats[c]);
      await db.collection('actividades').doc(catId).set({
        titulo: cats[c],
        nombre: cats[c],
        detalle: '',
        tipo: 'categoria-chequeo',
        tipoChequeo: 'salida',
        chequeoId: chequeoId,
        tipoRaiz: 'proyecto',
        color: '',
        parentId: chequeoId,
        raizId: 'proj-limpiezas',
        orden: c,
        alcance: 'equipo',
        competencias: [],
        cronometrable: false,
        estado: 'pendiente',
        prioridad: 'gris',
        monto: 0,
        recurrencia: 0,
        esCompra: false,
        hecho: false,
        cabana: cabana,
        reservaId: reservaId,
        creadoPor: uidC,
        creadoNombre: nomC,
        creadoEn: serverTs()
      });
      var itemsCat = porCat[cats[c]];
      for (var m = 0; m < itemsCat.length; m++) {
        var it2 = itemsCat[m];
        await db.collection('actividades').doc('item-' + catId + '-' + m).set({
          titulo: it2.nombre,
          nombre: it2.nombre,
          detalle: '',
          tipo: 'item-chequeo',
          tipoChequeo: 'salida',
          itemNombre: it2.nombre,
          itemCategoria: cats[c],
          chequeoId: chequeoId,
          cantidadSugerida: it2.cantidad != null ? it2.cantidad : 0,
          cantidadConfirmada: null,
          tipoRaiz: 'proyecto',
          color: '',
          parentId: catId,
          raizId: 'proj-limpiezas',
          orden: m,
          alcance: 'equipo',
          competencias: [],
          cronometrable: false,
          estado: 'pendiente',
          prioridad: 'gris',
          monto: 0,
          recurrencia: 0,
          esCompra: false,
          hecho: false,
          cabana: cabana,
          reservaId: reservaId,
          creadoPor: uidC,
          creadoNombre: nomC,
          creadoEn: serverTs()
        });
      }
    }
  }

  // Se dispara cuando el último ítem de un chequeo queda validado.
  async function actConsolidarChequeo(chequeoId, user) {
    var chkSnap = await db.collection('actividades').doc(chequeoId).get();
    if (!chkSnap.exists) return;
    var chk = chkSnap.data();
    var todoSnap = await db.collection('actividades').where('chequeoId', '==', chequeoId).get();
    var items = [], faltantes = [];
    todoSnap.forEach(function (d) {
      var h = d.data();
      if (h.tipo !== 'item-chequeo') return;
      items.push({
        nombre: h.itemNombre,
        categoria: h.itemCategoria,
        cantidad: h.cantidadConfirmada || 0
      });
      var falta = (h.cantidadSugerida || 0) - (h.cantidadConfirmada || 0);
      if (falta > 0) faltantes.push({ nombre: h.itemNombre, falta: falta });
    });
    var fecha = serverTs();
    var porUid = (user && user.uid) || null, porNombre = (user && user.nombre) || '';

    if (chk.tipoChequeo === 'entrada') {
      await db.collection('reservas').doc(chk.reservaId).update({
        inventarioEntrada: { items: items, fecha: fecha, porUid: porUid, porNombre: porNombre }
      });
      await db.collection('cabanas').doc(String(chk.cabana)).set({ inventarioActual: items }, { merge: true });
      await actCrearChequeoSalida(chk.reservaId, chk.cabana, items, user);
    } else {
      await db.collection('reservas').doc(chk.reservaId).update({
        inventarioSalida: {
          items: items,
          faltantes: faltantes,
          fecha: fecha,
          porUid: porUid,
          porNombre: porNombre
        }
      });
      await db.collection('cabanas').doc(String(chk.cabana)).set({ inventarioActual: items }, { merge: true });
    }
    await db.collection('actividades').doc(chequeoId).update({
      hecho: true,
      hechoPor: porUid,
      hechoEn: tsAhora()
    });
  }

  // ── Validar un ítem del chequeo ──────────────────────────
  async function actValidarItemChequeo(itemId, cantidadConfirmada, nota, user) {
    var ref = db.collection('actividades').doc(itemId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('El \u00edtem no existe.');
    var item = snap.data();
    await ref.update({
      cantidadConfirmada: cantidadConfirmada,
      hecho: true,
      hechoPor: (user && user.uid) || null,
      hechoEn: tsAhora(),
      notaChequeo: nota || ''
    });
    if (_faltanteONota(item.cantidadSugerida, cantidadConfirmada, nota)) {
      await actRegistrarFaltante(
        item.cabana,
        item.itemNombre,
        (item.tipoChequeo === 'entrada' ? 'check-in' : 'check-out'),
        item.reservaId,
        nota,
        user
      );
    }
    // Releer todos los hermanos del chequeo completo (por chequeoId)
    var todoSnap = await db.collection('actividades').where('chequeoId', '==', item.chequeoId).get();
    var todosListos = true;
    var itemsPorCat = {};
    todoSnap.forEach(function (d) {
      var h = d.data();
      if (h.tipo !== 'item-chequeo') return;
      var hecho = (d.id === itemId) ? true : !!h.hecho;
      if (!hecho) todosListos = false;
      var pc = itemsPorCat[h.parentId] || { total: 0, hechos: 0 };
      pc.total++;
      if (hecho) pc.hechos++;
      itemsPorCat[h.parentId] = pc;
    });
    // Marcar como hecha la categoría del ítem si quedó completa
    var pcActual = itemsPorCat[item.parentId];
    if (pcActual && pcActual.hechos === pcActual.total) {
      await db.collection('actividades').doc(item.parentId).update({
        hecho: true,
        hechoPor: (user && user.uid) || null,
        hechoEn: tsAhora()
      }).catch(function () {});
    }
    if (todosListos) await actConsolidarChequeo(item.chequeoId, user);
  }

  // ── Enganche a CVC ──────────────────────────────────────
  CVC.actIniciar = actIniciar;
  CVC.actPausar = actPausar;
  CVC.actFinalizar = actFinalizar;
  CVC.actTildar = actTildar;
  CVC.actCiclo = actCiclo;
  CVC.actSemaforo = actSemaforo;
  CVC.actCargarTemporada = actCargarTemporada;
  CVC.actValidarItemChequeo = actValidarItemChequeo;
  CVC.actSincronizarSesiones = actSincronizarSesiones; // NUEVA
  CVC.actRegistrarFaltante = actRegistrarFaltante; // NUEVA (para utilidad)
})();
