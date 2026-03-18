# Loan Generator — Detalle de Cálculo de Cuotas

## Ejemplo Completo: Tipo `cuota` (Amortización Simple)

**Parámetros:** Monto=1000, Tasa=10%, Cuotas=3, Frecuencia=mensual, Inicio=2026-03-18

```
montoTotal = 1000 * (1 + 10/100) = 1100
montoCuota = 1100 / 3 = 366.67

Cuota 1: 2026-04-18 → $366.67
Cuota 2: 2026-05-18 → $366.67
Cuota 3: 2026-06-18 → $366.67
```

## Ejemplo Completo: Tipo `fijo` (Interés Fijo)

**Parámetros:** Monto=1000, Tasa=10%, Cuotas=3, Frecuencia=mensual, Inicio=2026-03-18

```
montoInteres = 1000 * (10/100) = 100

Cuota 1: 2026-04-18 → $100.00  (solo interés)
Cuota 2: 2026-05-18 → $100.00  (solo interés)
Cuota 3: 2026-06-18 → $1100.00 (interés + capital)
```

## Mapeo de Frecuencia a Unidad Moment.js

| frecuencia_pago | unidad moment | cantidad por cuota `i` |
| --------------- | ------------- | ---------------------- |
| `diario`        | `days`        | `i`                    |
| `semanal`       | `weeks`       | `i`                    |
| `quincenal`     | `days`        | `i * 15`               |
| `mensual`       | `months`      | `i`                    |
| `trimestral`    | `months`      | `i` (suma 3 al mes 0)  |
| `semestral`     | `months`      | `i` (suma 6 al mes 0)  |
| `anual`         | `years`       | `i`                    |

> **Atención:** Para `trimestral` y `semestral`, la función `calcularCuotas` actual usa `i` como multiplicador. Verificar si el comportamiento es correcto: con `trimestral` y `i=1` el add sería `1 month`, no `3 months`. Si se desea corregir, pasar la cantidad correcta al `add`.

## Consideración de Zona Horaria

Todas las fechas se calculan en UTC con `moment.utc()` para evitar desfases por la zona America/La_Paz (UTC-4). Al guardar en PostgreSQL tipo `date`, no aplica conversión de zona horaria.

## Inserción Masiva de Cuotas (Batch Insert)

El sistema usa un `VALUES` concatenado para insertar todas las cuotas en una sola query SQL, lo que es muy eficiente:

```js
const cuotasValues = cuotas
  .map(
    (cuota, index) =>
      `(${idPrestamo}, ${index + 1}, '${cuota.fechaPago}', ${cuota.monto}, 'pendiente')`,
  )
  .join(", ");

const cuotasQuery = `
  INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto, estado)
  VALUES ${cuotasValues} RETURNING *`;
```

> **Seguridad:** Este patrón es seguro ya que los valores son calculados internamente (no vienen de inputs de usuario). Si en el futuro se usaran inputs de usuario directamente, se debe usar parámetros `$1, $2...` con pg client.

## Consulta de Préstamos con Saldo

La query principal incluye cálculo de saldo en tiempo real:

```sql
SELECT p.*,
  c.nombre, c.apellido, c.telefono, c.direccion, c.email,
  COALESCE(SUM(cu.monto), 0) as monto_total_cuotas,
  COALESCE(SUM(cu.monto_pagado), 0) as monto_pagado,
  COALESCE(SUM(cu.monto), 0) - COALESCE(SUM(cu.monto_pagado), 0) as saldo
FROM prestamos p
JOIN clientes c ON p.cliente_id = c.id
LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
WHERE p.empresa_id = $1 AND p.estado = true AND c.estado = true
GROUP BY p.id, c.id
```
