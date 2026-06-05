# Manual del Sistema — Casa Verde Canas
## Panel Administrativo v4.4 · Junio 2026

---

## ÍNDICE

| # | Sección | Para quién |
|---|---|---|
| 1 | Dashboard | Admin + Colaborador |
| 2 | Reservas | Admin |
| 3 | Presupuestos | Admin |
| 4 | Finanzas — Ingresos y Gastos | Admin |
| 5 | Retiros y Gastos Personales | Admin |
| 6 | Conciliación BTG | Admin |
| 7 | Panel Financiero | Admin |
| 8 | Tareas | Admin + Colaborador |
| 9 | Pendientes | Admin + Colaborador |
| 10 | Fiscal Brasil | Admin |
| 11 | Airbnb | Admin |
| 12 | Configuración | Admin |
| 13 | Roles y Permisos | Admin |
| 14 | Editar los textos de ayuda (?) | Admin |
| 15 | Preguntas Frecuentes | Todos |

---

## 1. DASHBOARD

> Primera pantalla al entrar. Estado del complejo de un vistazo. Cada sección ocupa el mínimo espacio si no tiene datos.

### Estructura

```
ALERTAS          (invisible si no hay nada urgente)
RESUMEN          5 tarjetas — cada una clickeable
ACCESOS          Menús desplegables igual que el nav superior
PRÓXIMOS CHECK-INS    7 días — una línea si está vacío
PENDIENTES       Ordenados por urgencia (rojo primero)
TAREAS URGENTES  Solo rojas y amarillas + botón "Ver todas"
RESERVAS SIN CONFIRMAR  Banner naranja por cada una
PRESUPUESTOS SIN SEÑA  Últimos 30 días
POSICIÓN BANCARIA  Solo admin
```

### Las 5 tarjetas de resumen

| Tarjeta | Qué cuenta | Al tocar |
|---|---|---|
| Reservas activas | Confirmadas + pendientes + Airbnb activas | Reservas |
| Pendientes | Sin completar | Pendientes |
| Tareas activas | Pendientes + en curso | Tareas |
| Tareas urgentes | Solo semáforo rojo | Tareas |
| Ingresos del mes | Reservas confirmadas con check-in este mes | Panel financiero |

> Cada tarjeta y cada acceso tiene un botón `?`. Tocarlo abre una explicación de esa sección sin salir de la pantalla.

### Alertas automáticas

| Situación | Nivel |
|---|---|
| Check-in en menos de 48h sin tarea de limpieza | CRITICO |
| Tareas con atraso severo | CRITICO |
| Honorarios pendientes más de 14 días | ATENCION |
| Movimientos BTG sin categorizar | INFO |

---

## 2. RESERVAS

### Flujo — reserva directa

```
Cliente consulta
     |
     v
Crear PRESUPUESTO (precio calculado automáticamente)
     |
     v
Cliente acepta → Registrar SEÑA en pagos.html
     |
     v  IMPORTANTE: el pago NO confirma la reserva automáticamente
     v  La confirmación es un paso separado en la pantalla de la reserva
     |
Reserva → CONFIRMADA
     |
     v
Crear TAREA DE LIMPIEZA para el día del check-out
     |
     v
CHECK-IN → ESTADÍA → CHECK-OUT → FINALIZAR
```

### Flujo — reserva Airbnb

```
Airbnb → Google Calendar (automático ~1h) → dashboard "Sincronizar" (manual)
     |
     v
Reserva creada con estado AIRBNB_ACTIVA
```

### Estados

```
pendiente --Confirmar--> confirmada --Finalizar--> finalizada
    |                        |
    +--Anular--> anulada     +--Anular--> anulada

airbnb_activa --Cancelación detectada--> airbnb_cancelada
```

> Los estados **confirmada** y **airbnb_activa** bloquean las fechas en el calendario público.

---

## 3. PRESUPUESTOS

### Cálculo del precio

```
Precio base × noches
+ precio por persona extra × personas adicionales
+ tarifa de limpieza
= PRECIO TOTAL (calculado automáticamente)
```

### Edición manual del precio

```
Calcular → aparece el total con botón ✏️
     |
     v
Tocar ✏️ → campo editable con el precio calculado precargado
     |
     v
Escribir el nuevo precio
→ muestra diferencia: ↓ Descuento: R$ X (X%) en verde
                   o  ↑ Adicional: R$ X (X%) en naranja
     |
     v
Botón "Restaurar" → vuelve al precio calculado
     |
     v
Guardar → usa el precio editado
  Firestore guarda: totalBRL (final), totalCalculadoBRL (original), descuentoAplicado
```

---

## 4. FINANZAS — INGRESOS Y GASTOS

> Se accede desde pagos.html. Tiene 4 pestañas: Ingresos, Egresos, Honorarios, Retiros y personal.

### Los tres circuitos

```
FISCAL                    PERSONAL                  MIXTO
──────────────────────    ──────────────────────    ──────────────────────
Gastos de Casa Verde      Fondos propios de          Parte fiscal
en Brasil                 Mauro / Flor               + parte personal
                                                     en un mismo gasto
Pueden reducir el IRPF    No declarables en          El slider define
                          Brasil                     el porcentaje

Visibles para la          Solo admin y el            Admin ve todo
contadora                 propio usuario             Contadora ve solo
                                                     la parte fiscal
```

### Registrar un INGRESO (tab Ingresos)

```
"Registrar ingreso" → seleccionar reserva → monto → método → guardar
El saldo pagado de la reserva se actualiza automáticamente
```

### Registrar un GASTO FISCAL (tab Egresos)

```
"Registrar gasto" → elegir FISCAL CASA VERDE
→ Concepto / Categoría / Monto / Proveedor
→ ¿Deducible del IRPF? Sí / No
→ Foto del comprobante (opcional — recomendado)
  La foto se comprime y sube a Cloudinary automáticamente
→ Guardar
```

### Registrar con FACTURA — extractor IA

```
"Importar factura IA" → sacar foto
→ La IA extrae: proveedor, fecha, monto, categoría
→ Revisar datos → confirmar
→ Se guarda con el comprobante adjunto
```

### Registrar gasto MIXTO

```
"Registrar gasto" → elegir MIXTO
→ Ingresar monto total
→ Slider: ¿qué % es de Casa Verde?
  Sistema calcula: parte fiscal + parte personal
→ Guardar crea automáticamente AMBOS registros:
  un gasto fiscal + un retiro personal
```

---

## 5. RETIROS Y GASTOS PERSONALES

> Dinero propio de los socios que circula por las cuentas. Se registra para trazabilidad y para que no quede como "sin correlativo" en la conciliación BTG.

### Tab "Retiros y personal"

```
"Registrar retiro"
→ Seleccionar persona (Mauro / Flor / otro)
→ Monto / Moneda / Fecha / Concepto
→ Tipo de fondo:
   casa_verde = dinero de la operación
   propio     = ahorros personales
   uy         = fondos desde Uruguay
   prestamo   = préstamos familiares
→ Foto de ticket (opcional)
→ Registrar
```

### Balance personal

El tab muestra cuánto retiró cada persona en el período, con comprobantes adjuntos y flag si el retiro fue reclasificado como gasto fiscal.

---

## 6. CONCILIACIÓN BANCARIA BTG

> Verificar que cada movimiento del extracto tiene explicación. Cuando el 100% está explicado, la base fiscal es confiable.

### Flujo mensual

```
1. Llega extracto BTG (PDF del banco)
     |
     v
2. herramientas-btg.html → tab "Importar"
   Pegar el texto del extracto
   Seleccionar cuenta (BTG Mauro o BTG Flor)
   → Importar
     |
     v
3. Tab "Auto-conciliar"
   El sistema cruza cada movimiento contra:
   • Cobros registrados (pagos)
   • Gastos registrados (gastos)
   • Informes Airbnb (informes_airbnb)
   • Retiros personales (retiros)
     |
     v
4. RESULTADO EN TRES GRUPOS:

   NIVEL A [verde]  Sin acción
   Monto ±0,5% · Fecha ±3 días · Origen reconocido

   NIVEL B [amarillo]  Un toque para confirmar
   Candidato encontrado, criterio en el límite

   NIVEL C [rojo]  Registrar manualmente
   No hay registro que lo explique
     |
     v
5. Confirmar y guardar
     |
     v
6. Para los Nivel C: ir a pagos.html y registrar
   el gasto, retiro o transferencia correspondiente
```

### Tolerancias

| Criterio | Nivel A | Nivel B |
|---|---|---|
| Diferencia de monto | ≤ 0,5% | ≤ 2% |
| Diferencia de fecha | ≤ 3 días | ≤ 7 días |
| Origen reconocido | Requerido | No requerido |

---

## 7. PANEL FINANCIERO

> Vista de análisis. No para registrar — para entender.

### Elegir período

```
[Desde fecha]  [Hasta fecha]  [Ver]
Atajos: Este mes / Mes anterior / Este año / Todo
```

### Qué muestra

```
RESUMEN DEL PERÍODO
Ingresos | Gastos fiscales | Retiros personales | Neto | Base IRPF

BALANCE POR CUENTA
Cada cuenta BTG muestra:
  Saldo actual (real del banco)
  + Créditos / Débitos / Flujo neto del período
  + Estado: conciliada o N movimientos sin conciliar

BALANCE POR SOCIO
Mauro y Flor separados:
  Ingresos / Gastos / Retiros / Neto

RENTABILIDAD POR CABAÑA
Barra visual por unidad

MOVIMIENTOS SIN CONCILIAR → link a BTG
GASTOS SIN COMPROBANTE    → link a pagos
```

---

## 8. TAREAS

> Trabajos operativos con cronómetro. Generan honorarios automáticamente.

### Diferencia con pendientes

| | Tareas | Pendientes |
|---|---|---|
| Cronómetro | Sí | No (pero podés iniciar uno desde pendientes) |
| Genera honorarios | Automático | No |
| Fecha programada | Sí | No |
| Quién crea | Solo admin | Admin + colaboradores |

### Flujo para el colaborador

```
Abrir tareas.html
     |
     v
Ver lista ordenada por urgencia:
ROJO     → atendé primero (atraso crítico)
AMARILLO → próxima en prioridad
VERDE    → en plazo normal o en curso
GRIS     → fecha futura
     |
     v
Tocar tarea → se expande mostrando los botones
     |
     +── INICIAR          El cronómetro empieza
     |   Los botones cambian a PAUSAR y FINALIZAR
     |   SIN SALIR de la pantalla ni mover la lista
     |
     +── PAUSAR           El tiempo se guarda
     |   Podés reanudar después desde la misma card
     |
     +── FINALIZAR        Sistema calcula horas totales
     |   Genera honorario automáticamente
     |   La card desaparece con animación
     |
     +── OK / NO NECESARIA
         Registra que revisaste y no hacía falta
         Sin honorario, pero queda en el historial
         con responsable y nota
```

> Si finalizás sin haber cronometrado: el historial registra quién finalizó con 0 horas. El honorario queda en $0 pero la responsabilidad queda registrada.

### Flujo para el admin (tareas-admin.html)

```
CREAR TAREA          MONITOREAR           HISTORIAL
Nombre               Ver quién trabaja    Tocar cualquier fila
Tipo                 en qué ahora         → va directo al
Prioridad            Semáforo en          historial de esa tarea
Fecha de inicio      tiempo real
Recurrencia (días)

PAGAR
pagos.html → tab Honorarios
→ "Marcar como pagado"
```

### Semáforo de urgencia

```
Tarea en curso                → VERDE    "En curso"
Sin fecha o fecha futura      → GRIS     "Próximamente"
Fecha = hoy                   → VERDE    "Hoy"
Atrasada dentro del ciclo     → AMARILLO "Xd de atraso"
Superó ciclo o más de 10 días → ROJO     "Xd de atraso"
```

> El ciclo es el campo `recurrencia` en días. Por defecto: 3 días si no tiene recurrencia.

---

## 9. PENDIENTES

> Lista de cosas por hacer sin cronómetro. Para admin y colaboradores.

### Crear un pendiente

```
"Nuevo pendiente"
→ Texto descriptivo
→ Semáforo: ROJO Urgente / AMARILLO Atención / VERDE Normal / GRIS Sin prioridad
→ Visibilidad: Todos / Solo admin
→ Asignar a persona (opcional)
→ Guardar
```

### Botón ▶ — cronómetro para un pendiente

```
Tocar ▶ en cualquier pendiente activo
     |
     v
Sistema crea una tarea vinculada a ese pendiente
La inicia con cronómetro inmediatamente
     |
     v
El pendiente sigue en su lista hasta que se marque como realizado
La tarea aparece en tareas.html con el tiempo corriendo
     |
     v
Al finalizar la tarea: el tiempo queda en el historial
junto con las tareas normales
```

### Tres vistas

| Vista | Muestra |
|---|---|
| General | Todos los activos, filtros por semáforo y visibilidad |
| Por persona | Agrupados por asignado |
| Realizados | Historial con fecha y quién completó |

---

## 10. FISCAL — OBLIGACIONES EN BRASIL

> Mauro y Flor son no residentes con CPF activo. Ingresos de alquiler sujetos al Carnê-Leão mensual (DARF 0190).

### Flujo mensual obligatorio

```
FIN DEL MES X
     |
     v
fiscal.html → "Ingresos y gastos"
Verificar que todos los ingresos y gastos deducibles del mes están registrados
     |
     v
fiscal.html → "Cálculo IRPF"
Seleccionar mes y año
Base = ingresos brutos − gastos deducibles del circuito fiscal
Sistema muestra el monto estimado del DARF
     |
     v
Pagar el DARF en el banco (fuera del sistema)
     |
     v
fiscal.html → "Calendario fiscal"
Tocar el mes → registrar: valor, fecha, número de referencia
El mes cambia a verde ✅
     |
VENCIMIENTO: último día hábil del mes X+1
```

### Qué gastos reducen el IRPF

```
REDUCEN la base:
  Gastos circuito "fiscal" con deducible = Sí
  Gastos circuito "mixto" — solo la parte fiscal (montoFiscal)

NO entran en el cálculo:
  Gastos circuito "personal"
  Retiros personales
  Gastos con deducible = No
```

### Tabla IRPF 2026

| Base mensual | Lo que se paga |
|---|---|
| Hasta R$ 5.000 | Nada |
| R$ 5.000 a R$ 7.350 | Poco (descuento gradual) |
| R$ 7.350 a R$ 10.028 | Base × 7,5% − R$ 428,95 |
| R$ 10.028 a R$ 13.628 | Base × 15% − R$ 1.220,99 |
| R$ 13.628 a R$ 27.500 | Base × 22,5% − R$ 2.248,10 |
| Más de R$ 27.500 | Base × 27,5% − R$ 3.623,10 |

> ⚠️ Si facturación supera R$ 240.000/año el sistema alerta. Implica posible obligación bajo reforma fiscal 2027 (LC 214/2025). Coordinar con contadora.

### Acceso contadora

```
acceso-contador.html → "Generar acceso"
→ Elegir vigencia: 3 / 7 / 14 / 30 días
→ Copiar link y enviar
La contadora abre el link sin usuario
→ Ve datos fiscales en portugués (sin datos personales)
→ Puede agregar notas y exportar PDF
Admin puede revocar en cualquier momento
```

---

## 11. AIRBNB

### Sincronización

```
Airbnb → Google Calendar (~1h automático) → botón "Sincronizar Airbnb" en dashboard
```

> El sync es **manual** para no bloquear la carga del dashboard.

### Liquidaciones

```
PDF mensual de Airbnb llega al email
     |
     v
informes-airbnb.html → subir PDF
La IA extrae: fechas, comisiones, neto
     |
     v
Cuando llega el depósito en BTG:
Motor de conciliación lo cruza automáticamente (Nivel A)
```

---

## 12. CONFIGURACIÓN

### Cabañas (cabanas-admin.html)
Nombre y descripción en 3 idiomas, fotos (GitHub), amenities, capacidad, tarifas por temporada, Google Calendar ID de Airbnb.

### Usuarios (usuarios.html)

```
Para agregar:
1. La persona crea cuenta en el login
2. Admin va a usuarios.html → asigna rol:
   Admin       = acceso completo
   Colaborador = solo sus tareas y honorarios
3. Activar

Para desactivar:
Toggle Activo/Inactivo (los datos se conservan)
```

### Manual del sistema

```
manual-sistema.html → "Subir archivo .md / .html"
→ Seleccionar el archivo generado por Claude
→ El sistema convierte Markdown a HTML automáticamente
→ Vista previa → "Guardar como manual"
→ Se actualiza al instante en Firestore
```

---

## 13. ROLES Y PERMISOS

| Función | Admin | Colaborador |
|---|---|---|
| Dashboard completo | Sí | No |
| Ver sus tareas | Sí | Sí |
| Iniciar/pausar/finalizar tareas | Sí | Sí |
| Botón OK/No necesaria | Sí | Sí |
| Crear y editar tareas | Sí | No |
| Ver todos los pendientes | Sí | Solo visibilidad: todos |
| Crear pendientes | Sí | Sí (siempre visibilidad: todos) |
| Usar cronómetro en pendiente | Sí | Sí |
| Ver finanzas completas | Sí | No |
| Ver sus honorarios | Sí | Sí |
| Ver retiros personales | Sí | Solo los propios |
| Datos fiscales | Sí | No |
| Gestionar usuarios | Sí | No |
| Editar textos de ayuda (?) | Sí | No |

---

## 14. EDITAR LOS TEXTOS DE AYUDA (?)

> Los textos que aparecen al tocar el `?` están guardados en Firestore y se pueden editar sin redeploy.

### Dónde están

```
Firebase Console → Firestore → colección: config → documento: ayuda
Campo: items (map)
  Estructura:
  {
    "pagina.html": {
      "titulo": "Nombre de la sección",
      "resumen": "Explicación breve visible al tocar ?",
      "detalle": "Texto más largo si lo querés agregar"
    }
  }
```

### Páginas configuradas

| Clave | Sección |
|---|---|
| `dashboard.html` | Dashboard |
| `reservas.html` | Reservas |
| `presupuestos.html` | Presupuestos |
| `clientes.html` | Clientes |
| `calendario.html` | Calendario |
| `panel-financiero.html` | Panel Financiero |
| `pagos.html` | Ingresos y Egresos |
| `informes-airbnb.html` | Informes Airbnb |
| `cuentas.html` | Cuentas |
| `movimientos.html` | Movimientos |
| `herramientas-btg.html` | BTG / Conciliación |
| `categorias.html` | Categorías |
| `tareas.html` | Tareas |
| `tareas-admin.html` | Gestión de Tareas |
| `pendientes.html` | Pendientes |
| `fiscal.html` | Panel Fiscal |
| `acceso-contador.html` | Acceso Contador |
| `cabanas-admin.html` | Cabañas |
| `usuarios.html` | Usuarios |
| `manual-sistema.html` | Manual |

### Cómo editar desde Firebase Console

```
1. console.firebase.google.com → proyecto casaverdecanas-199
2. Firestore → config → ayuda
3. Tocar el campo items → editar el valor del mapa
4. Cambiar el texto del "resumen" de la página que querés actualizar
5. Guardar
```

El cambio es visible inmediatamente sin subir ningún archivo.

---

## 15. PREGUNTAS FRECUENTES

**La pantalla quedó cargando**
Esperá 15 segundos. Si sigue: recargar. Si persiste, verificar conexión.

**Una reserva de Airbnb no aparece**
Tocar "Sincronizar Airbnb" en el dashboard. Si sigue sin aparecer, esperar 1 hora más.

**Un movimiento bancario aparece en "Sin correlativo"**
No tiene registro previo. Registrar el gasto, retiro o transferencia en pagos.html.

**Puedo editar un gasto ya guardado?**
No actualmente. Para correcciones menores usá el campo "Referencia". Si el monto está mal: eliminar y volver a cargar.

**Qué pasa si finalizo una tarea sin cronometrar?**
Se finaliza correctamente. El historial registra quién la cerró con 0 horas, sin honorario. Útil para tareas de supervisión o verificación.

**Qué es "OK / No era necesaria"?**
Es para tareas recurrentes que revisaste y no hacían falta hacer esta vez. Se registra en el historial con tu nombre y la nota que escribás. La tarea avanza su fecha automáticamente. Es tan válido como realizarla — el control está en el registro.

**Cómo sé cuánto pagar de impuesto este mes?**
fiscal.html → "Cálculo IRPF" → seleccionar el mes.

**Puedo ver el balance de un mes específico?**
Sí. panel-financiero.html → usar Desde/Hasta o los atajos.

**Qué es un gasto mixto?**
Un gasto donde parte es de Casa Verde y parte es personal. El slider define el porcentaje. El sistema crea automáticamente el gasto fiscal y el retiro personal.

**Cómo actualizo los textos de los ?**
Desde Firebase Console → Firestore → config → ayuda. Ver sección 14 de este manual.

---

*Manual Casa Verde Canas · v4.4 · Junio 2026*
*Para actualizar: manual-sistema.html → "Subir archivo .md / .html"*
