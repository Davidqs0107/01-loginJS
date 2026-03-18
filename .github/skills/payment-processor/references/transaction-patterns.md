# Payment Processor — Patrones de Transacción

## Patrón executeTransaction

Todos los pagos usan este helper para garantizar atomicidad:

```js
// src/helpers/transactionSql.js
export const executeTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
```

## Flujo de Pago Simple

```
POST /api/pagos
  ↓
crearPago (controller)
  ↓ extrae empresa_id, usuario_id del token
crearPagoService (service)
  ↓ executeTransaction
    1. SELECT cuota → verifica existencia y estado
    2. Calcula montoAplicado = min(monto, restante)
    3. INSERT pagos → genera pagoId
    4. UPDATE cuotas → nuevo monto_pagado y estado
  ↓ COMMIT
  ← respuesta con pagoId, cuotaActualizada, montoAplicado
```

## Flujo de Multipago

```
POST /api/pagos/multiple
  ↓
crearMultipago (controller)
  ↓
crearMultipagoService (service)
  ↓ executeTransaction
    1. SELECT cuotas WHERE prestamo_id AND estado IN ('pendiente','parcial') ORDER BY numero_cuota
    2. For each cuota while montoPendiente > 0:
       a. Calcula montoAplicado = min(montoPendiente, restanteCuota)
       b. INSERT pagos
       c. UPDATE cuotas
       d. montoPendiente -= montoAplicado
    3. Retorna pagosRealizados[] + montoExcedente
  ↓ COMMIT
```

## Flujo de Eliminación de Pago

```
DELETE /api/pagos/:id
  ↓
eliminarPago (controller)
  ↓
eliminarPagoService (service)
  ↓ executeTransaction
    1. SELECT pagos WHERE id → obtiene cuota_id y monto
    2. DELETE FROM pagos WHERE id
    3. UPDATE cuotas SET monto_pagado = monto_pagado - monto,
       estado = CASE WHEN ... THEN 'parcial' ELSE estado END
  ↓ COMMIT
```

## Problema Conocido: Estado Pendiente tras Eliminación

Cuando se elimina el único pago de una cuota parcial, el estado queda en `'parcial'` aunque `monto_pagado = 0`. Esto es porque la lógica actual solo transiciona a `'parcial'`, no a `'pendiente'`:

```sql
-- Lógica actual (incompleta)
estado = CASE
  WHEN (monto_pagado - $1) < monto THEN 'parcial'
  ELSE estado
END

-- Lógica corregida (si se desea)
estado = CASE
  WHEN (monto_pagado - $1) <= 0 THEN 'pendiente'
  WHEN (monto_pagado - $1) < monto THEN 'parcial'
  ELSE estado
END
```

## Validaciones de Seguridad en Pagos

- `empresa_id` viene del token JWT, nunca del body
- `usuario_id` viene del token JWT
- No se puede pagar una cuota ya completamente pagada (guard en servicio)
- Monto aplicado nunca excede el saldo restante (`Math.min`)
