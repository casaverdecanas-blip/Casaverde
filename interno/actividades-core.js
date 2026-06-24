// =========================================================
//  actividades-core.js — Casa Verde Canas
//  Motor de cronómetro + honorario para la colección 'actividades'.
//
//  Portado de iniciarTarea / pausarTarea / finalizarTarea de utils.js,
//  apuntando a 'actividades' y escribiendo en el MISMO espinazo contable
//  (historial_tareas + honorarios) para no romper limpieza-stats ni pagos.
//
//  Se ENGANCHA a window.CVC (NO lo redefine). Cargar SIEMPRE después de
//  utils.js. Reusa CVC.cicloEfectivoTarea / CVC.cargarTemporada para la
//  recurrencia y el factor de temporada.
//
//  Convivencia: utils.js sigue manejando la colección 'tareas' para el
//  tareas.html viejo. Cuando se jubile (T6), este pasa a ser el único motor.
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

  // ── ▶ Iniciar mi sesión de cronómetro ───────────────────
  async function actIniciar(actId, user) {
    if (!user || !user.uid) { return db.collection('actividades').doc(actId).update({ estado: 'en_curso' }); }
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    var activas = (t.sesionesActivas || []).slice();
    if (activas.some(function (s) { return s.uid === user.uid; })) return; // ya tengo una sesión abierta
    var ahora = tsAhora();
    await ref.collection('sesiones').add({ uid: user.uid, nombre: user.nombre || '', inicio: ahora, fin: null });
    activas.push({ uid: user.uid, nombre: user.nombre || '', inicio: ahora });
    await ref.update({ estado: 'en_curso', sesionesActivas: activas });
  }

  // ── ⏸ Pausar mi sesión ──────────────────────────────────
  async function actPausar(actId, user) {
    var ref = db.collection('actividades').doc(actId);
    if (!user || !user.uid) { return ref.update({ estado: 'pendiente', sesionesActivas: [] }); }
    var ahora = tsAhora();
    var sesSnap = await ref.collection('sesiones').get();
    var batch = db.batch();
    var huboCierre = false;
    sesSnap.docs.forEach(function (d) {
      var s = d.data();
      var abierta = (s.fin === null || s.fin === undefined);
      if (abierta && s.uid === user.uid) { batch.update(d.ref, { fin: ahora }); huboCierre = true; }
    });
    if (huboCierre) await batch.commit();
    var snap = await ref.get();
    if (!snap.exists) return;
    var t = snap.data();
    var restantes = (t.sesionesActivas || []).filter(function (s) { return s.uid !== user.uid; });
    await ref.update({ sesionesActivas: restantes, estado: restantes.length ? 'en_curso' : 'pendiente' });
  }

  // ── Cierre de ciclo: rutina recurrente -> reprograma; si no -> finaliza ──
  async function cerrarCiclo(ref, t, sesDocs, user, conCrono) {
    if (CVC.cargarTemporada) { try { await CVC.cargarTemporada(); } catch (e) { } }
    var ciclo = CVC.cicloEfectivoTarea ? CVC.cicloEfectivoTarea(t) : (t.recurrencia || 0);
    if (sesDocs && sesDocs.length) {
      var batch = db.batch();
      sesDocs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }
    var meta = { ultimaRealizacion: sumarDiasISO(0), ultimaRealizacionPor: (user && user.nombre) ? user.nombre : '', ultimaRealizacionConCrono: !!conCrono };
    if (ciclo > 0) {
      // Rutina: reprograma al próximo ciclo y vuelve a pendiente (nuevo ciclo, sin marcar)
      await ref.update(Object.assign({ estado: 'pendiente', fechaInicio: sumarDiasISO(ciclo), sesionesActivas: [], hecho: false, hechoPor: null, hechoEn: null }, meta));
    } else {
      // No recurrente: finaliza y marca hecho (refleja el tilde en el árbol)
      await ref.update(Object.assign({ estado: 'finalizada', sesionesActivas: [], hecho: true, hechoPor: (user && user.uid) ? user.uid : null, hechoEn: serverTs(), finalizadoEn: serverTs() }, meta));
    }
  }

  // ── ⏹ Finalizar con honorario proporcional + registro en historial ──
  // Retorna [{ uid, nombre, horas, montoRecibido }]
  async function actFinalizar(actId, user) {
    user = user || {};
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    var ahora = tsAhora();

    // 1. Cerrar sesiones abiertas
    var sesSnap = await ref.collection('sesiones').get();
    var batchCierre = db.batch();
    var huboAbiertas = false;
    sesSnap.docs.forEach(function (d) {
      var s = d.data();
      if (s.fin === null || s.fin === undefined) { batchCierre.update(d.ref, { fin: ahora }); huboAbiertas = true; }
    });
    if (huboAbiertas) await batchCierre.commit();

    // 2. Horas por colaborador (solo sesiones válidas)
    var porUid = {};
    sesSnap.docs.forEach(function (d) {
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

    // 3. Reparto proporcional al tiempo trabajado
    var colaboradores = lista.map(function (c) {
      var proporcion = totalHoras > 0 ? (c.horas / totalHoras) : 0;
      return { uid: c.uid, nombre: c.nombre, horas: Math.round(c.horas * 100) / 100, montoRecibido: Math.round(montoTarea * proporcion * 100) / 100 };
    });
    var montoAsignado = colaboradores.reduce(function (s, c) { return s + c.montoRecibido; }, 0);

    // 4. Costo de limpieza cobrado al cliente (best effort, no bloquea)
    var costoLimpiezaBRL = 0;
    if (t.reservaId) {
      try { var rSnap = await db.collection('reservas').doc(t.reservaId).get(); if (rSnap.exists) costoLimpiezaBRL = rSnap.data().costoLimpiezaBRL || 0; } catch (e) { }
    }

    // 5. Registro en historial_tareas (MISMA forma -> limpieza-stats sigue andando)
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

    // 6. Honorarios pendientes (los ve pagos.html)
    for (var i = 0; i < colaboradores.length; i++) {
      var c = colaboradores[i];
      if (c.montoRecibido <= 0) continue;
      await db.collection('honorarios').add({
        uid: c.uid, nombre: c.nombre, tareaId: actId, concepto: nombreDe(t) || 'Actividad',
        horas: c.horas, monto: c.montoRecibido, estado: 'pendiente', creadoEn: serverTs()
      });
    }

    // 7. Reprogramar (rutina) o finalizar
    await cerrarCiclo(ref, t, sesSnap.docs, user, true);

    return colaboradores;
  }

  // ── Tildar: dar por realizada SIN cronómetro (registro sin tiempo) ──
  async function actTildar(actId, user) {
    user = user || {};
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    // Registro de realización sin tiempo (queda marcado conCronometro:false)
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
    // Reprograma (rutina) o finaliza (no recurrente), registrando última realización sin reloj
    await cerrarCiclo(ref, t, [], user, false);
  }

  // ── Enganche a CVC (sin redefinirlo) ────────────────────
  CVC.actIniciar = actIniciar;
  CVC.actPausar = actPausar;
  CVC.actFinalizar = actFinalizar;
  CVC.actTildar = actTildar;
})();
