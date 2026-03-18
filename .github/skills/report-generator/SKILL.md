---
name: report-generator
description: "Skill para crear reportes y consultas analíticas del sistema de préstamos. Usar cuando: crear reporte de cartera, reporte de mora, reporte de cobros por fecha o cobrador, reporte de préstamos por estado, agregar endpoint de exportación, construir queries complejas con múltiples tablas, entender el patrón executeSelect con paginación, crear reportes con filtros de fecha."
argument-hint: "Describe el reporte: ej. 'reporte de mora con días vencidos' o 'cobros del mes por cobrador'"
---

# Report Generator Skill

## Contexto del Sistema

Los reportes usan `executeSelect` (con paginación) o `executeQuery`/`executeSelectOne` (sin paginación). Todos los reportes filtran por `empresa_id` del token JWT.

---

## Helpers de Consulta Disponibles

```js
import {
  executeSelect,
  executeQuery,
  executeSelectOne,
  executeInsert,
} from "../helpers/queryS.js";

// Con paginación → devuelve { data: [], meta: { totalItems, page, pageSize, totalPages } }
await executeSelect(query, params, page, pageSize);

// Sin paginación, múltiples rows
await executeQuery(query, params);

// Sin paginación, asume pocos rows
await executeSelectOne(query, params); // returns rows[]

// Para INSERT/UPDATE con RETURNING
await executeInsert(query, params); // returns rows[0]
```

---

## Reportes Disponibles Actualmente

### Préstamos con Saldo (en `getPrestamosServices`)

- Filtros: `fecha_inicio`, `fecha_fin`, `searchTerm`, `empresa_id`
- Campos: préstamo + cliente + `monto_total_cuotas`, `monto_pagado`, `saldo`

### Descargos por Fecha (en `getDescargosServices`)

- Filtros: `fecha_inicio`, `fecha_fin`, `empresa_id`, `searchTerm`
- Campos: descargo + usuario (nombre, apellido, ci, email, teléfono)

### Pagos por Usuario (en `getPagosbyUserIdServices`)

- Filtros: `usuario_id`
- Campos: pagos

---

## Procedimiento: Crear Nuevo Reporte

### Estructura estándar

```js
// src/services/reportesService.js (crear si no existe)
export const getReporteMoraService = async ({
  empresa_id,
  page = 1,
  pageSize = 50,
}) => {
  const query = `
    SELECT
      c.nombre || ' ' || c.apellido as cliente,
      c.telefono,
      p.id as prestamo_id,
      cu.numero_cuota,
      cu.fecha_pago,
      cu.monto,
      cu.monto - cu.monto_pagado as saldo_pendiente,
      CURRENT_DATE - cu.fecha_pago as dias_mora
    FROM cuotas cu
    JOIN prestamos p ON cu.prestamo_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    WHERE p.empresa_id = $1
      AND cu.estado IN ('pendiente', 'parcial')
      AND cu.fecha_pago < CURRENT_DATE
      AND c.estado = true
    ORDER BY cu.fecha_pago ASC, c.apellido ASC
  `;
  return await executeSelect(
    query,
    [empresa_id],
    parseInt(page),
    parseInt(pageSize),
  );
};
```

```js
// src/controllers/reportesController.js
export const getReporteMora = async (req, res) => {
  const { empresa_id } = req;
  const { page = 1, pageSize = 50 } = req.query;
  try {
    const result = await getReporteMoraService({ empresa_id, page, pageSize });
    return res
      .status(200)
      .json({ ok: true, mora: result.data, meta: result.meta });
  } catch (error) {
    console.error("Error en getReporteMora:", error);
    return res
      .status(500)
      .json({ ok: false, msg: "Error al generar reporte de mora" });
  }
};
```

```js
// src/routes/reportesRoutes.js
import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import { getReporteMora } from "../controllers/reportesController.js";

const route = Router();
route.use(validarJWT);

route.get(
  "/mora",
  [validarRol(userRol.admin, userRol.superAdmin)],
  getReporteMora,
);

export default route;
```

```js
// src/index.js — registrar ruta
import reportesRouter from "./routes/reportesRoutes.js";
app.use("/api/reportes", reportesRouter);
```

---

## Queries SQL de Referencia

### Reporte de Mora Detallado

```sql
SELECT
  c.nombre || ' ' || c.apellido as cliente,
  c.telefono, c.email,
  p.id as prestamo_id,
  cu.numero_cuota,
  cu.fecha_pago as fecha_vencimiento,
  cu.monto as monto_cuota,
  cu.monto_pagado,
  cu.monto - cu.monto_pagado as saldo_pendiente,
  CURRENT_DATE - cu.fecha_pago as dias_mora
FROM cuotas cu
JOIN prestamos p ON cu.prestamo_id = p.id
JOIN clientes c ON p.cliente_id = c.id
WHERE p.empresa_id = $1
  AND cu.estado IN ('pendiente', 'parcial')
  AND cu.fecha_pago < CURRENT_DATE
  AND c.estado = true
ORDER BY dias_mora DESC
```

### Reporte de Cobros por Cobrador y Fecha

```sql
SELECT
  u.nombre || ' ' || u.apellido as cobrador,
  COUNT(pag.id) as num_pagos,
  COALESCE(SUM(pag.monto), 0) as total_cobrado,
  COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'efectivo'), 0) as total_efectivo,
  COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'qr'), 0) as total_qr
FROM usuarios u
LEFT JOIN pagos pag ON pag.usuario_id = u.id
  AND DATE(pag.fecha_pago) BETWEEN $2 AND $3
WHERE u.empresa_id = $1 AND u.rol = 'cobrador' AND u.estado = true
GROUP BY u.id, u.nombre, u.apellido
ORDER BY total_cobrado DESC
```

### Reporte de Cartera por Estado

```sql
SELECT
  p.estado_prestamo,
  COUNT(p.id) as num_prestamos,
  COALESCE(SUM(p.monto), 0) as monto_total,
  COALESCE(SUM(cu.monto - cu.monto_pagado), 0) as saldo_total
FROM prestamos p
LEFT JOIN cuotas cu ON cu.prestamo_id = p.id AND cu.estado IN ('pendiente', 'parcial')
WHERE p.empresa_id = $1 AND p.estado = true
GROUP BY p.estado_prestamo
```

### Reporte de Cuotas del Día

```sql
SELECT
  c.nombre || ' ' || c.apellido as cliente,
  c.telefono, c.direccion,
  cu.numero_cuota,
  cu.monto,
  cu.monto_pagado,
  cu.monto - cu.monto_pagado as saldo,
  cu.estado,
  p.id as prestamo_id,
  u.nombre || ' ' || u.apellido as cobrador
FROM cuotas cu
JOIN prestamos p ON cu.prestamo_id = p.id
JOIN clientes c ON p.cliente_id = c.id
JOIN usuarios u ON p.usuario_id = u.id
WHERE p.empresa_id = $1
  AND cu.fecha_pago = $2
  AND cu.estado IN ('pendiente', 'parcial')
  AND c.estado = true
ORDER BY u.nombre, c.apellido
```

### Reporte Resumen Mensual

```sql
SELECT
  TO_CHAR(DATE_TRUNC('month', cu.fecha_pago), 'YYYY-MM') as mes,
  COUNT(cu.id) as total_cuotas,
  COALESCE(SUM(cu.monto), 0) as monto_esperado,
  COALESCE(SUM(cu.monto_pagado), 0) as monto_recaudado,
  COALESCE(SUM(cu.monto - cu.monto_pagado), 0) as saldo_pendiente,
  COUNT(cu.id) FILTER (WHERE cu.estado = 'pagada') as cuotas_pagadas,
  COUNT(cu.id) FILTER (WHERE cu.estado = 'parcial') as cuotas_parciales,
  COUNT(cu.id) FILTER (WHERE cu.estado = 'pendiente') as cuotas_pendientes
FROM cuotas cu
JOIN prestamos p ON cu.prestamo_id = p.id
WHERE p.empresa_id = $1
  AND cu.fecha_pago BETWEEN $2 AND $3
GROUP BY DATE_TRUNC('month', cu.fecha_pago)
ORDER BY mes DESC
```

---

## Filtros Comunes con buildDynamicQuery

Para reportes con filtros opcionales, usar el patrón de query dinámica:

```js
export const getReporteConFiltrosService = async ({
  empresa_id,
  fecha_inicio,
  fecha_fin,
  cobrador_id,
  estado,
  page,
  pageSize,
}) => {
  let query = `
    SELECT cu.*, c.nombre, c.apellido, c.telefono
    FROM cuotas cu
    JOIN prestamos p ON cu.prestamo_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    WHERE p.empresa_id = $1
  `;
  const params = [empresa_id];

  if (fecha_inicio && fecha_fin) {
    params.push(fecha_inicio, fecha_fin);
    query += ` AND cu.fecha_pago BETWEEN $${params.length - 1} AND $${params.length}`;
  }
  if (cobrador_id) {
    params.push(cobrador_id);
    query += ` AND p.usuario_id = $${params.length}`;
  }
  if (estado) {
    params.push(estado);
    query += ` AND cu.estado = $${params.length}`;
  }
  query += ` ORDER BY cu.fecha_pago DESC`;

  return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};
```

---

## Formato de Respuesta Estándar para Reportes

```json
{
  "ok": true,
  "reporte": [...],
  "meta": {
    "totalItems": 150,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3
  }
}
```
