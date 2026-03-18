---
name: payment-processor
description: "Skill para registrar pagos de cuotas en el sistema de gestión de préstamos. Usar cuando: registrar pago de una cuota individual, registrar multipago que cubre varias cuotas, eliminar un pago con rollback automático, entender cómo se actualiza el estado de cuota (pendiente/parcial/pagada), agregar tipos de pago, trabajar con pagosServices.js o pagosController.js, diagnosticar errores en pagos."
argument-hint: "Describe la operación de pago: ej. 'multipago de 500 al préstamo 12' o 'eliminar pago 34'"
---

# Payment Processor Skill

## Contexto del Sistema

Todos los pagos usan transacciones atómicas con `executeTransaction`. Cualquier error revierte todos los cambios. El estado de la cuota se actualiza automáticamente en el mismo `executeTransaction` que registra el pago.

---

## Tipos de Pago

```js
// src/constants/commons.constans.js
export const tipoPago = {
  efectivo: "efectivo",
  qr: "qr",
};
```

---

## Estados de Cuota (ciclo de vida)

```
pendiente → parcial → pagada
             ↑          ↓
          (si se elimina un pago que la dejaba pagada)
```

```js
export const cuotasEstado = {
  pendiente: "pendiente", // Sin ningún pago
  parcial: "parcial", // Monto pagado < monto total
  pagada: "pagada", // Monto pagado >= monto total
};
```

---

## Operaciones Disponibles

### 1. Pago Simple (`POST /api/pagos`)

Paga una cuota específica por su `cuota_id`.

```json
// Body
{
  "cuota_id": 42,
  "monto": 150.0,
  "fecha_pago": "2026-03-18",
  "tipo_pago": "efectivo"
}
```

**Lógica interna:**

1. Verifica que la cuota existe y no está completamente pagada
2. Aplica `montoAplicado = Math.min(monto, restante)` — nunca paga de más
3. Registra en tabla `pagos`
4. Actualiza `cuotas.monto_pagado` y `cuotas.estado`
5. Devuelve el excedente si el monto enviado fue mayor al necesario

```json
// Respuesta 201
{
  "ok": true,
  "pagoId": 89,
  "msg": "El monto del pago excedió el requerido. Se aplicaron 83.33 y el excedente es 66.67.",
  "cuotaActualizada": {
    "monto": 83.33,
    "monto_pagado": 83.33,
    "estado": "pagada"
  },
  "montoAplicado": 83.33
}
```

---

### 2. Multipago (`POST /api/pagos/multiple`)

Aplica un monto total a múltiples cuotas pendientes del préstamo en orden.

```json
// Body
{
  "prestamo_id": 12,
  "montoTotal": 500.0,
  "fecha_pago": "2026-03-18",
  "tipo_pago": "qr"
}
```

**Lógica interna:**

1. Obtiene todas las cuotas `pendiente` o `parcial` del préstamo, ordenadas por `numero_cuota ASC`
2. Itera cuota por cuota aplicando el monto disponible
3. Registra un pago por cada cuota afectada
4. Devuelve el excedente si sobró dinero

```json
// Respuesta 201
{
  "ok": true,
  "msg": "Multipago completado. Se aplicaron pagos a 3 cuotas.",
  "montoTotalPagado": 500.0,
  "montoExcedente": 0,
  "totalCuotasAfectadas": 3,
  "pagos": [
    {
      "pagoId": 90,
      "cuotaId": 42,
      "numeroCuota": 1,
      "montoAplicado": 166.67,
      "estadoFinal": "pagada"
    },
    {
      "pagoId": 91,
      "cuotaId": 43,
      "numeroCuota": 2,
      "montoAplicado": 166.67,
      "estadoFinal": "pagada"
    },
    {
      "pagoId": 92,
      "cuotaId": 44,
      "numeroCuota": 3,
      "montoAplicado": 166.66,
      "estadoFinal": "parcial"
    }
  ]
}
```

---

### 3. Eliminar Pago (`DELETE /api/pagos/:id`)

Revierte un pago: elimina de `pagos` y descuenta de `monto_pagado` en la cuota.

```js
// Lógica de reversión en la cuota
UPDATE cuotas
SET monto_pagado = monto_pagado - :monto_pago,
    estado = CASE
      WHEN (monto_pagado - :monto_pago) < monto THEN 'parcial'
      ELSE estado
    END
WHERE id = :cuota_id
```

> **Nota:** Si después de revertir el `monto_pagado` queda en 0, la cuota queda en estado `parcial`. Para volver a `pendiente` se necesitaría lógica adicional.

---

## Procedimiento: Agregar Nuevo Tipo de Pago

### Paso 1 — Agregar constante

```js
// src/constants/commons.constans.js
export const tipoPago = {
  efectivo: "efectivo",
  qr: "qr",
  transferencia: "transferencia", // ← nuevo
};
```

### Paso 2 — Agregar validación en controlador de descargos

```js
// src/controllers/descargoController.js — crearDescargo
if (
  tipo_pago !== tipoPago.efectivo &&
  tipo_pago !== tipoPago.qr &&
  tipo_pago !== tipoPago.transferencia
) {
  return res.status(400).json({ ok: false, msg: "Tipo de pago no válido" });
}
```

### Paso 3 — Actualizar CHECK en base de datos si aplica

```sql
-- Si la columna tiene un CHECK constraint, ajustarlo
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_tipo_pago_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_tipo_pago_check
  CHECK (tipo_pago IN ('efectivo', 'qr', 'transferencia'));
```

---

## Procedimiento: Agregar Nueva Ruta de Pago

```js
// src/routes/pagosRoutes.js
import { nuevaOperacionPago } from "../controllers/pagosController.js";

route.post(
  "/nueva-operacion",
  [
    validarJWT,
    check("campo_requerido", "Requerido").not().isEmpty(),
    validarCampos,
  ],
  nuevaOperacionPago,
);
```

---

## Errores Comunes

| Error   | Mensaje                                        | Causa                                                  |
| ------- | ---------------------------------------------- | ------------------------------------------------------ |
| 500     | `"No se encontro la cuota especificada."`      | `cuota_id` no existe en DB                             |
| 500     | `"La cuota ya esta completamente pagada."`     | Se intenta pagar una cuota con `monto_pagado >= monto` |
| 500     | `"El monto total del pago debe ser positivo."` | `montoTotal <= 0` en multipago                         |
| 400/500 | `"No tiene cuotas..."`                         | Préstamo sin cuotas pendientes/parciales               |

---

## Consultas Frecuentes

```js
// Pagos por usuario
GET /api/pagos/user/:user_id?page=1&pageSize=10

// Pagos de una cuota específica
GET /api/pagos/cuota/:cuota_id

// Pago por ID
GET /api/pagos/:id
```

---

## Referencias

- [Lógica detallada de transacciones](./references/transaction-patterns.md)
