// =========================================================
//  actividades-core.js — Casa Verde Canas
//  Motor de cronómetro + honorario para la colección 'actividades'.
// =========================================================
(function () {
  var CVC = window.CVC;
  if (!CVC || !CVC.db) {
    if (window.console) console.error('actividades-core: window.CVC no disponible (cargá utils.js antes).');
    return;
  }
  var db = CVC.db;

  function tsAhora() { return firebase.firestore.Timestamp.now(); }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function aDateSeguro(v) { if (!v) return null; var d = v.toDate ? v.toDate() : new Date(v); return isNaN(d.getTime()) ? null : d; }
  function sumarDiasISO(dias) { var f = new Date(); f.setDate(f.getDate() + dias); return f.toISOString().split('T')[0]; }
  function nombreDe(t) { return t.titulo || t.nombre || ''; }

  async function actIniciar(actId, user) {
    if (!user || !user.uid) { return db.collection('actividades').doc(actId).update({ estado: 'en_curso' }); }
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    var activas = (t.sesionesActivas || []).slice();
    if (activas.some(function (s) { return s.uid === user.uid; })) return;
    var ahora = tsAhora();
    await ref.collection('sesiones').add({ uid: user.uid, nombre: user.nombre || '', inicio: ahora, fin: null });
    activas.push({ uid: user.uid, nombre: user.nombre || '', inicio: ahora });
    await ref.update({ estado: 'en_curso', sesionesActivas: activas });
  }

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

  // ── REESCRITURA DE GRABACIÓN HISTÓRICA DE REALIZACIONES ──
  async function cerrarCiclo(ref, t, sesDocs, user) {
    if (CVC.cargarTemporada) { try { await CVC.cargarTemporada(); } catch (e) { } }
    var ciclo = CVC.cicloEfectivoTarea ? CVC.cicloEfectivoTarea(t) : (t.recurrencia || 0);
    if (sesDocs && sesDocs.length) {
      var batch = db.batch();
      sesDocs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }
    
    var nombreUsuario = (user && user.nombre) || 'Equipo';

    if (ciclo > 0) {
      // Si es recurrente, no se rompe la jerarquía, se calcula el próximo ciclo y se estampa la firma
      await ref.update({ 
        estado: 'pendiente', 
        fechaInicio: sumarDiasISO(ciclo), 
        sesionesActivas: [], 
        hecho: false, 
        hechoPor: null, 
        hechoEn: null,
        ultimoHechoEn: serverTs(),
        ultimoHechoNombre: nombreUsuario
      });
    } else {
      // Si es suelto o proyecto (no recurrente) pasa a completado
      await ref.update({ 
        estado: 'finalizada', 
        sesionesActivas: [], 
        hecho: true, 
        hechoPor: (user && user.uid) ? user.uid : null, 
        hechoEn: serverTs(), 
        finalizadoEn: serverTs(),
        ultimoHechoEn: serverTs(),
        ultimoHechoNombre: nombreUsuario
      });
    }
  }

  async function actFinalizar(actId, user) {
    user = user || {};
    var ref = db.collection('actividades').doc(actId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error('La actividad no existe.');
    var t = snap.data();
    var ahora = tsAhora();

    var sesSnap = await ref.collection('sesiones').get();
    var batchCierre = db.batch();
    var huboAbiertas = false;
    sesSnap.docs.forEach(function (d) {
      var s = d.data();
      if (s.fin === null || s.fin === undefined) { batchCierre.update(d.ref, { fin: ahora }); huboAbiertas = true; }
    });
    if (huboAbiertas) await batchCierre.commit();

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

    var colaboradores = lista.map(function (c) {
      var proporcion = totalHoras > 0 ? (c.horas / totalHoras) : 0;
      return { uid: c.uid, nombre: c.nombre, horas: Math.round(c.horas * 100) / 100, montoRecibido: Math.round(montoTarea * proporcion * 100) / 100 };
    });
    var montoAsignado = colaboradores.reduce(function (s, c) { return s + c.montoRecibido; }, 0);

    var costoLimpiezaBRL = 0;
    if (t.reservaId) {
      try { var rSnap = await db.collection('reservas').doc(t.reservaId).get(); if (rSnap.exists) costoLimpiezaBRL = rSnap.data().costoLimpiezaBRL || 0; } catch (e) { }
    }

    await db.collection('historial_tareas').add({
      tareaId: actId,
      nombre: nombreDe(t),
      tipo: t.tipo || 'general',
      cabana: (t.cabana !== undefined && t.cabana !== null) ? t.cabana : null,
      tipoRegistro: 'finalizada',
      totalHoras: Math.round(totalHoras * 100) / 100,
      monto: Math.round(montoAsignado * 100) / 100,
      costoLimpiezaBRL: costoLimpiezaBRL,
      colaboradores: colaboradores,
      finalizadoEn: serverTs(),
      finalizadoNombre: user.nombre || '',
      finalizadoPor: user.uid || null
    });

    for (var i = 0; i < colaboradores.length; i++) {
      var c = colaboradores[i];
      if (c.montoRecibido <= 0) continue;
      await db.collection('honorarios').add({
        uid: c.uid, nombre: c.nombre, tareaId: actId, concepto: nombreDe(t) || 'Actividad',
        horas: c.horas, monto: c.montoRecibido, estado: 'pendiente', creadoEn: serverTs()
      });
    }

    await cerrarCiclo(ref, t, sesSnap.docs, user);
    return colaboradores;
  }

  CVC.actIniciar = actIniciar;
  CVC.actPausar = actPausar;
  CVC.actFinalizar = actFinalizar;
})();
        
