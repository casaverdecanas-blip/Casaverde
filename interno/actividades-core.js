// =========================================================
//  actividades-core.js — Casa Verde Canas
//  Motor de actividades + Sesiones unificadas v5.2
//  Julio 2026
//
//  PRINCIPIO v5.2: solo existe Play y Stop. No hay pausa.
//  Cada sesion es un bloque cerrado de trabajo en /sesiones/
//  con estado 'en_curso' o 'finalizada'. Al dar Stop en una
//  recurrente se pregunta si la actividad quedo terminada:
//  el tiempo se registra igual en ambos casos.
//
//  FUENTE UNICA: /sesiones/ para tiempo, /honorarios/ para
//  dinero a cobrar. historial_tareas queda ABANDONADA (solo
//  lectura de archivo, nunca se escribe).
//
//  HONORARIOS PROPORCIONALES: al cerrar el ciclo de una
//  actividad con monto > 0, el monto se reparte entre quienes
//  registraron sesiones finalizadas desde el cierre anterior,
//  en proporcion a sus horas. La actividad guarda
//  ultimoCierreEn para delimitar cada ciclo.
// =========================================================
(function () {
    var CVC = window.CVC;
    if (!CVC || !CVC.db) {
        if (window.console) console.error('actividades-core: window.CVC no disponible (cargá utils.js antes).');
        return;
    }
    var db = CVC.db;

    // ── Helpers ──────────────────────────────────────────────
    function tsAhora() { return firebase.firestore.Timestamp.now(); }
    function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
    function aDateSeguro(v) { if (!v) return null; var d = v.toDate ? v.toDate() : new Date(v); return isNaN(d.getTime()) ? null : d; }
    function sumarDiasISO(dias) { var f = new Date(); f.setDate(f.getDate() + dias); return f.toISOString().split('T')[0]; }
    function nombreDe(t) { return t.titulo || t.nombre || ''; }

    // ── Temporada ────────────────────────────────────────────
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

    function actCiclo(t, temp) {
        temp = temp || _temporada();
        var rt = t.recurrenciaTemporada;
        if (rt && typeof rt === 'object') { var v = parseInt(rt[temp], 10); if (!isNaN(v)) return v; }
        var base = parseInt(t.recurrencia, 10) || 0;
        if (base <= 0) return 0;
        return Math.max(1, Math.round(base * _factor(temp)));
    }

    // ── Semáforo ─────────────────────────────────────────────
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
        var venc = t.fechaCheckIn || t.fechaVencimiento;
        if (venc) {
            var d2 = _diasEntre(venc, hoyISO);
            if (d2 !== null) {
                if (d2 <= 2) return { color: 'rojo', label: (d2 < 0 ? ('Atrasada ' + Math.abs(d2) + 'd') : (d2 === 0 ? 'Vence hoy' : ('Vence en ' + d2 + 'd'))), rank: -100 + Math.min(d2, 0), fecha: venc, fechaTipo: (d2 < 0 ? 'vencio' : 'limite') };
                return { color: 'amarillo', label: 'Vence en ' + d2 + 'd', rank: 2, fecha: venc, fechaTipo: 'limite' };
            }
        }
        var ciclo = actCiclo(t);
        if (ciclo > 0 && t.fechaInicio) {
            var el = _diasEntre(hoyISO, t.fechaInicio);
            if (el === null) return _porPrioridad(t.prioridad);
            var limite = _sumarISO(t.fechaInicio, ciclo);
            if (el < 0) return { color: 'gris', label: '', rank: 5, fecha: t.fechaInicio, fechaTipo: 'prox' };
            if (el > ciclo) return { color: 'rojo', label: 'Atrasada ' + (el - ciclo) + 'd', rank: -(el - ciclo), fecha: limite, fechaTipo: 'vencio' };
            if (el >= ciclo / 2) { var falta = ciclo - el; return { color: 'amarillo', label: (falta <= 0 ? 'Vence hoy' : ('Vence en ' + falta + 'd')), rank: 2, fecha: limite, fechaTipo: 'limite' }; }
            return { color: 'verde', label: 'A tiempo', rank: 3, fecha: limite, fechaTipo: 'limite' };
        }
        return _porPrioridad(t.prioridad);
    }

    // ── ════════════════════════════════════════════════════════
    //  SISTEMA UNIFICADO DE SESIONES v5.2 (solo Play / Stop)
    //  Colección raíz: /sesiones/{id}
    //  Estados posibles: 'en_curso' | 'finalizada'
    // ════════════════════════════════════════════════════════════

    /**
     * Verificar si el usuario tiene una sesión activa (en_curso)
     * en CUALQUIER actividad
     */
    async function _usuarioTieneSesionActiva(uid) {
        try {
            var snap = await db.collection('sesiones')
                .where('uid', '==', uid)
                .where('estado', '==', 'en_curso')
                .limit(1)
                .get();
            return !snap.empty;
        } catch (e) {
            return false;
        }
    }

    /**
     * Iniciar una sesión de trabajo (Play)
     * Crea UN registro en /sesiones/ con estado 'en_curso'.
     * Verifica que el usuario no tenga otra sesión activa.
     */
    async function actIniciar(actId, user) {
        if (!user || !user.uid) {
            throw new Error('Usuario no identificado');
        }

        var yaTiene = await _usuarioTieneSesionActiva(user.uid);
        if (yaTiene) {
            throw new Error('Ya tenés otro cronómetro corriendo. Frenalo antes de iniciar este.');
        }

        var actRef = db.collection('actividades').doc(actId);
        var actSnap = await actRef.get();
        if (!actSnap.exists) throw new Error('La actividad no existe.');
        var actData = actSnap.data();

        var ahora = tsAhora();

        var sesionRef = await db.collection('sesiones').add({
            actividadId: actId,
            actividadNombre: actData.titulo || actData.nombre || '',
            uid: user.uid,
            nombre: user.nombre || '',
            inicio: ahora,
            fin: null,
            horas: 0,
            estado: 'en_curso',
            tipo: 'cronometro',
            creadoPor: user.uid,
            creadoEn: ahora,
            actualizadoEn: ahora
        });

        await actRef.update({
            estado: 'en_curso',
            sesionActualId: sesionRef.id
        });

        return sesionRef.id;
    }

    /**
     * Cerrar el ciclo de una actividad (interno).
     * - Marca hecho / reprograma si es recurrente.
     * - Reparte honorarios en proporción a las horas de las
     *   sesiones finalizadas desde el cierre anterior.
     * - Actualiza ultimoCierreEn en la actividad.
     * conCrono: true si el cierre vino de un Stop, false si vino de un tilde.
     */
    async function _cerrarCicloActividad(actId, actRef, actData, user, conCrono) {
        var ahora = tsAhora();
        try { await actCargarTemporada(); } catch (e) { }
        var ciclo = actCiclo(actData);

        // ── 1. Repartir honorarios del ciclo que se cierra ──
        var monto = parseFloat(actData.monto) || 0;
        if (monto > 0) {
            var prevMs = 0;
            if (actData.ultimoCierreEn && actData.ultimoCierreEn.toMillis) {
                prevMs = actData.ultimoCierreEn.toMillis();
            }

            // Sesiones finalizadas de esta actividad cuyo FIN cae en este ciclo.
            // Un solo where de igualdad — sin índices compuestos; filtro en JS.
            var porUid = {};
            var totalHoras = 0;
            try {
                var sSnap = await db.collection('sesiones')
                    .where('actividadId', '==', actId)
                    .get();
                sSnap.forEach(function (d) {
                    var s = d.data();
                    if (s.estado !== 'finalizada') return;
                    var finMs = (s.fin && s.fin.toMillis) ? s.fin.toMillis() : 0;
                    if (!finMs) return;
                    if (finMs <= prevMs) return;
                    var hrs = parseFloat(s.horas) || 0;
                    if (!s.uid) return;
                    if (!porUid[s.uid]) porUid[s.uid] = { nombre: s.nombre || '', horas: 0 };
                    porUid[s.uid].horas += hrs;
                    totalHoras += hrs;
                });
            } catch (e) { }

            var uids = Object.keys(porUid);
            if (totalHoras > 0.001 && uids.length > 0) {
                // Reparto proporcional a las horas de cada persona
                for (var u = 0; u < uids.length; u++) {
                    var reg = porUid[uids[u]];
                    var parte = Math.round(monto * (reg.horas / totalHoras) * 100) / 100;
                    if (parte <= 0) continue;
                    await db.collection('honorarios').add({
                        uid: uids[u],
                        nombre: reg.nombre,
                        tareaId: actId,
                        concepto: nombreDe(actData) || 'Actividad',
                        horas: Math.round(reg.horas * 100) / 100,
                        monto: parte,
                        estado: 'pendiente',
                        creadoEn: serverTs(),
                        cicloCerradoEn: ahora,
                        cerradoPor: user.uid,
                        cerradoNombre: user.nombre || ''
                    });
                }
            } else {
                // Sin horas registradas en el ciclo (tilde puro): todo al que cierra
                await db.collection('honorarios').add({
                    uid: user.uid,
                    nombre: user.nombre || '',
                    tareaId: actId,
                    concepto: nombreDe(actData) || 'Actividad',
                    horas: 0,
                    monto: monto,
                    estado: 'pendiente',
                    creadoEn: serverTs(),
                    cicloCerradoEn: ahora,
                    cerradoPor: user.uid,
                    cerradoNombre: user.nombre || ''
                });
            }
        }

        // ── 2. Cerrar o reprogramar la actividad ──
        if (ciclo > 0) {
            // Recurrente: ciclo cumplido, se reprograma
            await actRef.update({
                estado: 'pendiente',
                sesionActualId: null,
                hecho: false,
                hechoPor: null,
                hechoEn: null,
                fechaInicio: sumarDiasISO(ciclo),
                ultimaRealizacion: sumarDiasISO(0),
                ultimaRealizacionPor: user.nombre || '',
                ultimaRealizacionConCrono: !!conCrono,
                ultimoCierreEn: ahora
            });
        } else {
            await actRef.update({
                estado: 'finalizada',
                sesionActualId: null,
                hecho: true,
                hechoPor: user.uid,
                hechoEn: ahora,
                ultimaRealizacion: sumarDiasISO(0),
                ultimaRealizacionPor: user.nombre || '',
                ultimaRealizacionConCrono: !!conCrono,
                ultimoCierreEn: ahora
            });
        }
    }

    /**
     * Stop: cierra la sesión en curso y registra las horas.
     * terminada = true  → además cierra el ciclo de la actividad
     *                     (reprograma si es recurrente, marca hecho si no)
     *                     y reparte honorarios si tiene monto.
     * terminada = false → la actividad queda pendiente; el tiempo
     *                     ya quedó registrado y contará en el
     *                     reparto cuando el ciclo se cierre.
     */
    async function actFinalizar(actId, user, terminada) {
        if (!user || !user.uid) {
            throw new Error('Usuario no identificado');
        }

        terminada = (terminada !== false); // default true

        var ahora = tsAhora();

        // Sesión en curso del usuario en esta actividad
        // (solo igualdades — sin índice compuesto)
        var snap = await db.collection('sesiones')
            .where('uid', '==', user.uid)
            .where('actividadId', '==', actId)
            .where('estado', '==', 'en_curso')
            .limit(1)
            .get();

        var horas = 0;
        var sesionId = null;

        if (!snap.empty) {
            var doc = snap.docs[0];
            var data = doc.data();
            var inicioMs = data.inicio.toMillis();
            horas = (ahora.toMillis() - inicioMs) / 3600000;
            horas = Math.round(horas * 100) / 100;
            sesionId = doc.id;

            await doc.ref.update({
                fin: ahora,
                horas: horas,
                estado: 'finalizada',
                actualizadoEn: ahora,
                finalizadoPor: user.uid,
                finalizadoNombre: user.nombre || ''
            });
        } else if (!terminada) {
            throw new Error('No hay una sesión en curso para frenar.');
        }

        var actRef = db.collection('actividades').doc(actId);
        var actSnap = await actRef.get();
        if (!actSnap.exists) return { sesionId: sesionId, horas: horas };
        var actData = actSnap.data();

        if (terminada) {
            await _cerrarCicloActividad(actId, actRef, actData, user, true);
        } else {
            await actRef.update({
                estado: 'pendiente',
                sesionActualId: null
            });
        }

        return {
            sesionId: sesionId,
            horas: horas,
            terminada: terminada
        };
    }

    /**
     * Tildar: dar la actividad por realizada SIN cronómetro.
     * Deja una sesión de 0 horas en /sesiones/ (tipo 'tilde') para
     * que todo el registro viva en un solo lugar, y cierra el ciclo
     * (reprograma recurrentes, reparte honorarios si hay monto).
     */
    async function actTildar(actId, user) {
        if (!user || !user.uid) {
            throw new Error('Usuario no identificado');
        }
        var ref = db.collection('actividades').doc(actId);
        var snap = await ref.get();
        if (!snap.exists) throw new Error('La actividad no existe.');
        var t = snap.data();

        var ahora = tsAhora();

        await db.collection('sesiones').add({
            actividadId: actId,
            actividadNombre: nombreDe(t),
            uid: user.uid,
            nombre: user.nombre || '',
            inicio: ahora,
            fin: ahora,
            horas: 0,
            estado: 'finalizada',
            tipo: 'tilde',
            creadoPor: user.uid,
            creadoEn: ahora,
            actualizadoEn: ahora,
            notas: ''
        });

        await _cerrarCicloActividad(actId, ref, t, user, false);
    }

    // ── ════════════════════════════════════════════════════════
    //  API DE CONSULTA DE SESIONES (para el gestor)
    // ════════════════════════════════════════════════════════════

    /**
     * Obtener sesiones con filtros
     * filtros: { uid, actividadId, estado, fechaDesde, fechaHasta, limite }
     */
    async function actObtenerSesiones(filtros) {
        filtros = filtros || {};
        var query = db.collection('sesiones');

        if (filtros.uid) {
            query = query.where('uid', '==', filtros.uid);
        }
        if (filtros.actividadId) {
            query = query.where('actividadId', '==', filtros.actividadId);
        }
        if (filtros.estado) {
            query = query.where('estado', '==', filtros.estado);
        }

        // Sin orderBy con where compuesto: se ordena en JS más abajo
        var snap = await query.get();
        var sesiones = [];
        snap.forEach(function(doc) {
            var s = doc.data();
            s.id = doc.id;

            // Filtrar por fecha en JS (evita índices compuestos)
            if (filtros.fechaDesde) {
                var desde = filtros.fechaDesde.toMillis ? filtros.fechaDesde.toMillis() : filtros.fechaDesde;
                var ini = (s.inicio && s.inicio.toMillis) ? s.inicio.toMillis() : 0;
                if (ini < desde) return;
            }
            if (filtros.fechaHasta) {
                var hasta = filtros.fechaHasta.toMillis ? filtros.fechaHasta.toMillis() : filtros.fechaHasta;
                var ini2 = (s.inicio && s.inicio.toMillis) ? s.inicio.toMillis() : 0;
                if (ini2 > hasta) return;
            }

            sesiones.push(s);
        });

        // Ordenar por inicio descendente (en JS)
        sesiones.sort(function (a, b) {
            var am = (a.inicio && a.inicio.toMillis) ? a.inicio.toMillis() : 0;
            var bm = (b.inicio && b.inicio.toMillis) ? b.inicio.toMillis() : 0;
            return bm - am;
        });

        if (filtros.limite && sesiones.length > filtros.limite) {
            sesiones = sesiones.slice(0, filtros.limite);
        }

        return sesiones;
    }

    /**
     * Obtener la sesión activa de un usuario (si existe)
     */
    async function actObtenerSesionActiva(uid) {
        var snap = await db.collection('sesiones')
            .where('uid', '==', uid)
            .where('estado', '==', 'en_curso')
            .limit(1)
            .get();

        if (snap.empty) return null;
        var doc = snap.docs[0];
        var s = doc.data();
        s.id = doc.id;
        return s;
    }

    /**
     * Actualizar una sesión (admin o dueño)
     */
    async function actActualizarSesion(sesionId, datos) {
        datos.actualizadoEn = serverTs();
        await db.collection('sesiones').doc(sesionId).update(datos);
    }

    /**
     * Eliminar una sesión (admin o dueño)
     */
    async function actEliminarSesion(sesionId) {
        await db.collection('sesiones').doc(sesionId).delete();
    }

    /**
     * Registrar sesión manualmente
     * AHORA acepta inicio y fin como Timestamp (v5.1)
     */
    async function actRegistrarManual(actividadId, user, inicio, fin, horas, notas) {
        if (!user || !user.uid) {
            throw new Error('Usuario no identificado');
        }

        var actSnap = await db.collection('actividades').doc(actividadId).get();
        var actNombre = '';
        if (actSnap.exists) {
            var actData = actSnap.data();
            actNombre = actData.titulo || actData.nombre || '';
        }

        var ahora = tsAhora();

        await db.collection('sesiones').add({
            actividadId: actividadId,
            actividadNombre: actNombre,
            uid: user.uid,
            nombre: user.nombre || '',
            inicio: inicio,
            fin: fin,
            horas: horas,
            estado: 'finalizada',
            tipo: 'manual',
            creadoPor: user.uid,
            creadoEn: ahora,
            actualizadoEn: ahora,
            notas: notas || ''
        });
    }

    // ── ════════════════════════════════════════════════════════
    //  CHEQUEO DE INVENTARIO (sin cambios)
    // ════════════════════════════════════════════════════════════

    function _faltanteONota(cantSugerida, cantConfirmada, nota) {
        return (cantConfirmada < (cantSugerida || 0)) || !!(nota && nota.trim());
    }

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
            titulo: itemNombre + (nota ? ' — ' + nota : ''),
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

    async function actValidarItemChequeo(itemId, cantidad, nota, user) {
        var itemRef = db.collection('actividades').doc(itemId);
        var itemSnap = await itemRef.get();
        if (!itemSnap.exists) throw new Error('Ítem no encontrado');
        var item = itemSnap.data();

        var sugerida = item.cantidadSugerida || 0;
        var faltante = _faltanteONota(sugerida, cantidad, nota);

        await itemRef.update({
            cantidadConfirmada: cantidad,
            notaChequeo: nota || '',
            hecho: !faltante,
            hechoPor: faltante ? null : (user && user.uid) || null,
            hechoEn: faltante ? null : serverTs()
        });

        // Si hay faltante, registrar
        if (faltante) {
            var cabana = item.cabana;
            if (cabana) {
                await actRegistrarFaltante(cabana, item.itemNombre || item.titulo, 'check-out', item.reservaId, nota, user);
            }
        }

        // Consolidar chequeo (verificar si todos los ítems están validados)
        if (item.chequeoId) {
            await _consolidarChequeo(item.chequeoId, user);
        }

        return { faltante: faltante };
    }

    async function _consolidarChequeo(chequeoId, user) {
        var snap = await db.collection('actividades').where('chequeoId', '==', chequeoId).get();
        if (snap.empty) return;

        var todosValidados = true;
        snap.forEach(function(d) {
            var it = d.data();
            if (it.cantidadConfirmada === null || it.cantidadConfirmada === undefined) {
                todosValidados = false;
            }
        });

        if (todosValidados) {
            // Marcar el contenedor como hecho
            var chkRef = db.collection('actividades').doc(chequeoId);
            var chkSnap = await chkRef.get();
            if (chkSnap.exists) {
                await chkRef.update({
                    hecho: true,
                    hechoPor: (user && user.uid) || null,
                    hechoEn: serverTs()
                });

                // Si es chequeo de entrada, generar el de salida
                var chk = chkSnap.data();
                if (chk.tipoChequeo === 'entrada' && chk.reservaId) {
                    await _generarChequeoSalida(chk.reservaId, chk.cabana, user);
                }

                // Si es chequeo de salida, actualizar inventario de la cabaña
                if (chk.tipoChequeo === 'salida' && chk.cabana) {
                    await _actualizarInventarioCabana(chk.cabana, chequeoId);
                }
            }
        }
    }

    async function _generarChequeoSalida(reservaId, cabana, user) {
        var chequeoId = 'chk-ctrl-' + reservaId;
        var refChk = db.collection('actividades').doc(chequeoId);
        var s = await refChk.get();

        if (s.exists) return; // Ya existe

        // Obtener ítems confirmados del chequeo de entrada
        var entradaId = 'chk-limp-' + reservaId;
        var itemsSnap = await db.collection('actividades').where('chequeoId', '==', entradaId).get();

        // Crear contenedor de chequeo de salida
        await refChk.set({
            titulo: 'Chequeo de salida - Reserva ' + reservaId,
            tipo: 'chequeo-inventario',
            tipoChequeo: 'salida',
            cabana: cabana,
            reservaId: reservaId,
            parentId: 'ctrl-' + reservaId,
            raizId: 'proj-limpiezas',
            tipoRaiz: 'proyecto',
            alcance: 'equipo',
            competencias: [],
            cronometrable: false,
            monto: 0,
            recurrencia: 0,
            esCompra: false,
            estado: 'pendiente',
            prioridad: 'verde',
            hecho: false,
            hechoPor: null,
            hechoEn: null,
            orden: Date.now(),
            creadoPor: (user && user.uid) || null,
            creadoNombre: (user && user.nombre) || '',
            creadoEn: serverTs(),
            sesionesActivas: []
        });

        // Crear categorías e ítems basados en el chequeo de entrada
        var categorias = {};
        itemsSnap.forEach(function(d) {
            var it = d.data();
            var cat = it.itemCategoria || 'general';
            if (!categorias[cat]) categorias[cat] = [];
            categorias[cat].push(it);
        });

        var cats = Object.keys(categorias);
        for (var i = 0; i < cats.length; i++) {
            var catNombre = cats[i];
            var catId = 'cat-chk-ctrl-' + reservaId + '-' + catNombre.replace(/[^a-z0-9]/g, '-');
            var catRef = db.collection('actividades').doc(catId);

            await catRef.set({
                titulo: catNombre,
                tipo: 'categoria-chequeo',
                chequeoId: chequeoId,
                cabana: cabana,
                reservaId: reservaId,
                parentId: chequeoId,
                raizId: 'proj-limpiezas',
                tipoRaiz: 'proyecto',
                alcance: 'equipo',
                competencias: [],
                cronometrable: false,
                monto: 0,
                recurrencia: 0,
                esCompra: false,
                estado: 'pendiente',
                prioridad: 'verde',
                hecho: false,
                hechoPor: null,
                hechoEn: null,
                orden: i,
                creadoPor: (user && user.uid) || null,
                creadoNombre: (user && user.nombre) || '',
                creadoEn: serverTs()
            });

            var items = categorias[catNombre];
            for (var j = 0; j < items.length; j++) {
                var it = items[j];
                var itemId = 'item-ctrl-' + reservaId + '-' + catNombre.replace(/[^a-z0-9]/g, '-') + '-' + j;
                await db.collection('actividades').doc(itemId).set({
                    titulo: it.itemNombre || it.titulo,
                    tipo: 'item-chequeo',
                    chequeoId: chequeoId,
                    itemNombre: it.itemNombre || it.titulo,
                    itemCategoria: catNombre,
                    cantidadSugerida: it.cantidadConfirmada || it.cantidadSugerida || 0,
                    cantidadConfirmada: null,
                    notaChequeo: '',
                    cabana: cabana,
                    reservaId: reservaId,
                    parentId: catId,
                    raizId: 'proj-limpiezas',
                    tipoRaiz: 'proyecto',
                    alcance: 'equipo',
                    competencias: [],
                    cronometrable: false,
                    monto: 0,
                    recurrencia: 0,
                    esCompra: false,
                    estado: 'pendiente',
                    prioridad: 'verde',
                    hecho: false,
                    hechoPor: null,
                    hechoEn: null,
                    orden: j,
                    creadoPor: (user && user.uid) || null,
                    creadoNombre: (user && user.nombre) || '',
                    creadoEn: serverTs()
                });
            }
        }
    }

    async function _actualizarInventarioCabana(cabana, chequeoId) {
        var itemsSnap = await db.collection('actividades').where('chequeoId', '==', chequeoId).get();
        var inventarioItems = [];
        itemsSnap.forEach(function(d) {
            var it = d.data();
            if (it.tipo === 'item-chequeo') {
                inventarioItems.push({
                    nombre: it.itemNombre || it.titulo,
                    categoria: it.itemCategoria || 'general',
                    cantidad: it.cantidadConfirmada || 0
                });
            }
        });

        if (inventarioItems.length > 0) {
            await db.collection('cabanas').doc(cabana).update({
                inventarioActual: inventarioItems
            });
        }
    }

    // ── Exportar API pública ─────────────────────────────────
    CVC.actCargarTemporada = actCargarTemporada;
    CVC.actSemaforo = actSemaforo;
    CVC.actCiclo = actCiclo;

    // Sesiones (v5.2: sin pausa)
    CVC.actIniciar = actIniciar;
    CVC.actFinalizar = actFinalizar;
    CVC.actTildar = actTildar;
    CVC.actObtenerSesiones = actObtenerSesiones;
    CVC.actObtenerSesionActiva = actObtenerSesionActiva;
    CVC.actActualizarSesion = actActualizarSesion;
    CVC.actEliminarSesion = actEliminarSesion;
    CVC.actRegistrarManual = actRegistrarManual;

    // Inventario
    CVC.actValidarItemChequeo = actValidarItemChequeo;
    CVC.actRegistrarFaltante = actRegistrarFaltante;

})();
