---
name: dashboard-stats
description: "Skill para los KPIs y estadísticas del dashboard del sistema de gestión de préstamos. Usar cuando: agregar nuevos indicadores al resumen de empresa o cobrador, entender qué datos devuelve el summary, modificar las queries de estadísticas, crear nuevos endpoints de KPIs, trabajar con getSummaryService o getSummaryCobradorService en empresaServices.js, entender los endpoints GET /api/empresa/summary."
argument-hint: "Describe el KPI a agregar: ej. 'total de cuotas en mora' o 'préstamos por cobrador'"
---

# Dashboard Stats Skill

## Contexto del Sistema

Existen dos tipos de dashboard con queries SQL optimizadas:

- **Resumen de Empresa** (`admin`/`super_admin`): Vista global de la empresa
- **Resumen de Cobrador** (`cobrador`): Vista personal del cobrador del día

Ambos están en `src/services/empresaServices.js`.

---

## Resumen de Empresa — KPIs Actuales

**Endpoint:** `GET /api/empresa/summary` (requiere token, rol admin)

```js
// Campos devueltos por getSummaryService(empresa_id)
{
  prestamos_pendientes:    // COUNT préstamos activos/pendientes con clientes activos
  prestamos_completados:   // COUNT préstamos completados
  clientes_activos:        // COUNT clientes con estado=true
  cobradores_activos:      // COUNT usuarios con rol='cobrador' activos
  total_recaudado:         // SUM pagos de todos los usuarios de la empresa
  descargos_pendientes:    // SUM descargos con estado='pendiente'
  descargos_completados:   // SUM descargos con estado='aprobado'
}
```

---

## Resumen de Cobrador — KPIs Actuales

**Endpoint:** `GET /api/empresa/summary/cobrador` (requiere token, cualquier rol)

```js
// Campos devueltos por getSummaryCobradorService(usuario_id)
// Zona horaria: America/La_Paz usando formatDateWithDateFns(new Date())
{
  total_recaudado_hoy:          // SUM pagos del cobrador de HOY
  total_recaudado_hoy_qr:       // SUM pagos QR del cobrador de HOY
  total_recaudado_hoy_efectivo: // SUM pagos efectivo del cobrador de HOY
  total_recaudado:              // SUM pagos histórico del cobrador
  descargos_pendientes:         // SUM descargos del cobrador con estado='pendiente'
  descargos_completados:        // SUM descargos del cobrador con estado='aprobado'
}
```

---

## Procedimiento: Agregar Nuevo KPI al Resumen de Empresa

### Paso 1 — Agregar subquery en `getSummaryService`

```js
// src/services/empresaServices.js
const query = `select 
  -- ... KPIs existentes ...
  
  -- NUEVO KPI: Total de cuotas en mora
  (select count(cu.id)
   from cuotas cu
   join prestamos p on cu.prestamo_id = p.id
   where p.empresa_id = $1
     and cu.estado IN ('pendiente', 'parcial')
     and cu.fecha_pago < CURRENT_DATE) as cuotas_en_mora,
  
  -- NUEVO KPI: Monto pendiente total de cartera
  (select COALESCE(sum(cu.monto - cu.monto_pagado), 0)
   from cuotas cu
   join prestamos p on cu.prestamo_id = p.id
   where p.empresa_id = $1
     and cu.estado IN ('pendiente', 'parcial')) as cartera_pendiente
;`;
```

### Paso 2 — Si necesitas agregar filtro de fecha al summary

```js
// Modificar getSummaryService para aceptar fecha
export const getSummaryService = async (id, fecha = null) => {
  const fechaFiltro = fecha || formatDateWithDateFns(new Date());
  // Usar $2 para el filtro de fecha en las subqueries que lo necesiten
};
```

---

## Procedimiento: Crear Nuevo Endpoint de Estadísticas

```js
// src/services/empresaServices.js — agregar nueva función
export const getStatsPrestamosMoraService = async (empresa_id) => {
  const query = `
    SELECT 
      cu.id, cu.numero_cuota, cu.fecha_pago, cu.monto,
      cu.monto - cu.monto_pagado as saldo,
      CURRENT_DATE - cu.fecha_pago as dias_mora,
      c.nombre, c.apellido, c.telefono
    FROM cuotas cu
    JOIN prestamos p ON cu.prestamo_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    WHERE p.empresa_id = $1
      AND cu.estado IN ('pendiente', 'parcial')
      AND cu.fecha_pago < CURRENT_DATE
      AND c.estado = true
    ORDER BY cu.fecha_pago ASC
  `;
  const { data, meta } = await executeSelect(query, [empresa_id], 1, 100);
  return { data, meta };
};
```

```js
// src/controllers/empresaController.js — agregar controlador
export const getStatsPrestamosMora = async (req, res) => {
  const { empresa_id } = req;
  try {
    const result = await getStatsPrestamosMoraService(empresa_id);
    return res
      .status(200)
      .json({ ok: true, mora: result.data, meta: result.meta });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: "Error al obtener mora" });
  }
};
```

```js
// src/routes/empresaRoutes.js — agregar ruta
route.get(
  "/stats/mora",
  [validarJWT, validarRol(userRol.admin, userRol.superAdmin)],
  getStatsPrestamosMora,
);
```

---

## Queries SQL de Referencia para KPIs

```sql
-- Cartera total (suma de todos los saldos pendientes)
SELECT COALESCE(SUM(cu.monto - cu.monto_pagado), 0) as cartera
FROM cuotas cu JOIN prestamos p ON cu.prestamo_id = p.id
WHERE p.empresa_id = $1 AND cu.estado IN ('pendiente', 'parcial');

-- Cuotas vencidas hoy
SELECT COUNT(*) FROM cuotas cu JOIN prestamos p ON cu.prestamo_id = p.id
WHERE p.empresa_id = $1 AND cu.fecha_pago = CURRENT_DATE AND cu.estado IN ('pendiente','parcial');

-- Cobros del día por cobrador
SELECT u.nombre, u.apellido, COALESCE(SUM(pag.monto), 0) as cobrado_hoy
FROM usuarios u
LEFT JOIN pagos pag ON pag.usuario_id = u.id AND DATE(pag.fecha_pago) = CURRENT_DATE
WHERE u.empresa_id = $1 AND u.rol = 'cobrador' AND u.estado = true
GROUP BY u.id, u.nombre, u.apellido;

-- Préstamos nuevos del mes
SELECT COUNT(*) FROM prestamos
WHERE empresa_id = $1
  AND DATE_TRUNC('month', fecha_inicio) = DATE_TRUNC('month', CURRENT_DATE);

-- Tasa de cumplimiento (cuotas pagadas vs total)
SELECT
  COUNT(*) FILTER (WHERE estado = 'pagada') as pagadas,
  COUNT(*) as total,
  ROUND(COUNT(*) FILTER (WHERE estado = 'pagada') * 100.0 / NULLIF(COUNT(*), 0), 2) as tasa
FROM cuotas cu JOIN prestamos p ON cu.prestamo_id = p.id
WHERE p.empresa_id = $1;
```

---

## Zona Horaria

Todas las fechas usan `America/La_Paz` (UTC-4) via `formatDateWithDateFns`:

```js
import { formatDateWithDateFns } from "../helpers/functions.js";
const fechaHoy = formatDateWithDateFns(new Date()); // "2026-03-18"
```

Al hacer comparaciones de fechas en PostgreSQL con datos en UTC, usar:

```sql
-- Comparar pagos de hoy correctamente
DATE(p.fecha_pago AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') = $fecha_hoy
```
