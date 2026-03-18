---
name: loan-generator
description: "Skill para crear préstamos y generar cuotas automáticas en el sistema de gestión. Usar cuando: crear nuevo préstamo, calcular cuotas, entender tipos de interés (cuota vs fijo), frecuencias de pago, agregar campos al préstamo, modificar lógica de cálculo de cuotas, entender la transacción de creación, trabajar con prestamosServices.js o prestamosController.js."
argument-hint: "Describe el tipo de préstamo: ej. 'préstamo mensual de 1000 con 10% de interés en 12 cuotas'"
---

# Loan Generator Skill

## Contexto del Sistema

Los préstamos se crean en una transacción atómica que simultáneamente:

1. Inserta el registro en `prestamos`
2. Calcula y genera todas las cuotas en `cuotas`

Si cualquier paso falla, se hace ROLLBACK automático vía `executeTransaction`.

---

## Tipos de Préstamo

```js
// src/constants/commons.constans.js
export const tipoPrestamoInteresEnum = {
  cuota: "cuota", // Interés distribuido en todas las cuotas (amortización simple)
  fijo: "fijo", // Solo interés en cuotas intermedias, capital + interés en última cuota
};
```

### Tipo `cuota` (Amortización Simple)

```
montoTotal = monto * (1 + tasaInteres / 100)
montoCuota = montoTotal / totalCuotas  // Igual para todas las cuotas
```

### Tipo `fijo` (Interés Fijo por Periodo)

```
montoInteres = monto * (tasaInteres / 100)  // Igual para cuotas intermedias
Cuotas 1..N-1: solo montoInteres
Cuota N:       montoInteres + monto (capital)
```

---

## Frecuencias de Pago

```js
export const frecuenciaPagoEnum = {
  diario: "diario", // +1 día por cuota
  semanal: "semanal", // +1 semana por cuota
  quincenal: "quincenal", // +15 días por cuota (i * 15)
  mensual: "mensual", // +1 mes por cuota
  trimestral: "trimestral", // +3 meses por cuota (usa "months" con i)
  semestral: "semestral", // +6 meses por cuota (usa "months" con i)
  anual: "anual", // +1 año por cuota
};
```

> **Nota:** El cálculo de fecha usa `moment.utc(fechaInicio).add(cantidad, unidad)` para evitar problemas de zona horaria.

---

## Estados del Préstamo

```js
export const estadoPrestamo = {
  pendiente: "pendiente", // Recién creado, sin activar
  activo: "activo", // En curso
  completado: "completado", // Todas las cuotas pagadas
  incumplido: "incumplido", // En mora / no cumplido
};
```

---

## API Endpoints

| Método | Ruta                                     | Descripción                                         | Roles              |
| ------ | ---------------------------------------- | --------------------------------------------------- | ------------------ |
| GET    | `/api/prestamos`                         | Listar con filtros de fecha / búsqueda              | Todos              |
| GET    | `/api/prestamos/:id`                     | Detalle + cuotas opcionales (`?mostrarCuotas=true`) | Todos              |
| GET    | `/api/prestamos/user/:userId`            | Por usuario asignado                                | Todos              |
| GET    | `/api/prestamos/client/:clientId`        | Por cliente                                         | Todos              |
| POST   | `/api/prestamos`                         | Crear préstamo + cuotas                             | admin, super_admin |
| PUT    | `/api/prestamos/:id`                     | Actualizar documento/estado                         | admin, super_admin |
| POST   | `/api/prestamos/:id/archivos`            | Subir archivo (PDF, JPG, PNG, max 5MB)              | admin, super_admin |
| GET    | `/api/prestamos/:id/archivos`            | Obtener archivos del préstamo                       | Todos              |
| DELETE | `/api/prestamos/:id/archivos/:archivoId` | Eliminar archivo                                    | Todos              |

---

## Procedimiento: Crear un Préstamo

### Body requerido (POST `/api/prestamos`)

```json
{
  "cliente_id": 123,
  "tipo_prestamo": "cuota",
  "monto": 1000.0,
  "tasa_interes": 10,
  "frecuencia_pago": "mensual",
  "total_cuotas": 12,
  "fecha_inicio": "2026-03-18",
  "documento": "DOC-001"
}
```

### Respuesta exitosa (201)

```json
{
  "ok": true,
  "msg": "Prestamo creado",
  "prestamo": [{ "id": 45, "cliente_id": 123, ... }],
  "cuotas": [
    { "id": 1, "numero_cuota": 1, "fecha_pago": "2026-04-18", "monto": 91.67 },
    ...
  ]
}
```

---

## Procedimiento: Agregar Campo al Modelo de Préstamo

### Paso 1 — Agregar columna en la base de datos

```sql
ALTER TABLE prestamos ADD COLUMN nuevo_campo TEXT;
```

### Paso 2 — Agregar al INSERT en `crearPrestamoService`

```js
// En src/services/prestamosServices.js
const query = `
  INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes,
    frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo, documento, nuevo_campo)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  RETURNING *`;
await client.query(query, [...valores, nuevo_campo]);
```

### Paso 3 — Agregar validación en la ruta

```js
// En src/routes/prestamosRoutes.js
check('nuevo_campo', 'El campo es requerido').not().isEmpty(),
```

### Paso 4 — Extraer del body en el controlador

```js
// En src/controllers/prestamosController.js
const { nuevo_campo, ...resto } = req.body;
data.nuevo_campo = nuevo_campo;
```

---

## Procedimiento: Modificar Lógica de Cálculo de Cuotas

Las funciones de cálculo están al final de `src/services/prestamosServices.js`:

- `calcularCuotas()` → Para tipo `cuota` (amortización)
- `calcularCuotasInteresFijo()` → Para tipo `fijo`

Para agregar un nuevo tipo:

```js
// 1. Agregar constante
export const tipoPrestamoInteresEnum = {
  cuota: "cuota",
  fijo: "fijo",
  nuevo: "nuevo", // ← agregar aquí
};

// 2. Crear función de cálculo
const calcularCuotasNuevoTipo = ({
  monto,
  tasaInteres,
  totalCuotas,
  frecuenciaPago,
  fechaInicio,
}) => {
  // lógica de cálculo
  return cuotas; // Array de { numeroCuota, fechaPago, monto }
};

// 3. Agregar al selector de función en crearPrestamoService
const calcularCuotasFn =
  tipo_prestamo === tipoPrestamoInteresEnum.fijo
    ? calcularCuotasInteresFijo
    : tipo_prestamo === tipoPrestamoInteresEnum.nuevo
      ? calcularCuotasNuevoTipo
      : calcularCuotas;
```

---

## Helpers Clave

```js
// Zona horaria del sistema
import { formatDateWithDateFns } from "../helpers/functions.js";
// Usa "America/La_Paz" (UTC-4)
const fechaHoy = formatDateWithDateFns(new Date()); // "2026-03-18"

// Transacción atómica
import { executeTransaction } from "../helpers/transactionSql.js";
await executeTransaction(async (client) => {
  // client.query() dentro de la transacción
});
```

---

## Referencias

- [Lógica completa de cálculo de cuotas](./references/cuotas-calc.md)
- [Template de servicio de préstamo](./assets/loan-service-template.js)
