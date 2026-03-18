---
name: multitenant-filter
description: "Skill para garantizar el aislamiento multi-tenant de datos entre empresas. Usar cuando: crear nuevo servicio o query SQL, verificar que los datos están correctamente filtrados por empresa_id, prevenir que una empresa acceda a datos de otra, entender el patrón de ownership verification, diagnosticar fugas de datos entre empresas, agregar empresa_id a queries existentes, trabajar con executeSelect executeQuery executeInsert en queryS.js."
argument-hint: "Describe el servicio o query a revisar: ej. 'nuevo servicio de reportes' o 'query de búsqueda global'"
---

# Multi-tenant Filter Skill

## Regla de Oro

> **Todo dato de negocio filtrado siempre por `empresa_id` extraído del token JWT.**
> Nunca confiar en `empresa_id` del body, params o query string del request.

---

## Cómo Fluye empresa_id

```
Token JWT (firma segura)
  └─ validarJWT extrae: req.empresa_id = empresa_id
       └─ Controlador: const { empresa_id } = req;
            └─ Servicio: WHERE empresa_id = $1
```

---

## Checklist de Seguridad Multi-tenant

Para cada nuevo servicio/query, verificar:

- [ ] `empresa_id` viene de `req.empresa_id` (del token), nunca de `req.body`
- [ ] La query SQL incluye `WHERE ... empresa_id = $X`
- [ ] En queries con JOINs, el filtro aplica a la tabla raíz
- [ ] En updates/deletes, incluir `AND empresa_id = $X` además del `id`
- [ ] En inserts, incluir `empresa_id` como valor a insertar

---

## Patrones Correctos vs Incorrectos

### Patrón 1: Lectura (SELECT)

```js
// ✅ CORRECTO
export const getRecursosService = async (empresa_id) => {
  return await executeSelect(`SELECT * FROM tabla WHERE empresa_id = $1`, [
    empresa_id,
  ]);
};

// ❌ INCORRECTO — sin filtro multi-tenant
export const getRecursosService = async () => {
  return await executeSelect(`SELECT * FROM tabla`); // Devuelve datos de TODAS las empresas
};
```

### Patrón 2: Lectura por ID (ownership check)

```js
// ✅ CORRECTO — verifica que el recurso pertenece a la empresa
export const getRecursoByIdService = async (id, empresa_id) => {
  const result = await executeSelectOne(
    `SELECT * FROM tabla WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
  if (result.length === 0) throw new Error("Recurso no encontrado");
  return result[0];
};

// ❌ INCORRECTO — cualquier empresa puede ver el recurso de otra empresa
export const getRecursoByIdService = async (id) => {
  const result = await executeSelectOne(`SELECT * FROM tabla WHERE id = $1`, [
    id,
  ]);
  return result[0];
};
```

### Patrón 3: JOINs multi-tabla

```js
// ✅ CORRECTO — empresa_id en la tabla raíz
`SELECT cu.*, p.monto as prestamo_monto
 FROM cuotas cu
 JOIN prestamos p ON cu.prestamo_id = p.id
 WHERE p.empresa_id = $1`
// También válido: empresa_id en tabla hija con relación directa
`SELECT * FROM clientes WHERE empresa_id = $1 AND estado = true`;
```

### Patrón 4: Update / Delete

```js
// ✅ CORRECTO — doble filtro id + empresa_id
`UPDATE tabla SET campo = $1 WHERE id = $2 AND empresa_id = $3 RETURNING *`
// ❌ INCORRECTO — cualquier empresa podría modificar registros ajenos
`UPDATE tabla SET campo = $1 WHERE id = $2 RETURNING *`;
```

### Patrón 5: Insert

```js
// ✅ CORRECTO — empresa_id incluido en los datos
export const crearRecursoService = async (data) => {
  const { empresa_id, ...campos } = data;
  // empresa_id viene del token, se incluye en el insert
  const {
    campos: cs,
    valores,
    placeholders,
  } = buildDynamicQuery({ ...campos, empresa_id });
  const query = buildQueryCreate(cs, placeholders, "tabla");
  return await executeInsert(query, valores);
};
```

---

## Procedimiento: Auditar un Servicio Existente

### Paso 1 — Buscar todas las queries del servicio

```bash
# Buscar todos los executeSelect/Query/Insert en el servicio
grep -n "executeSelect\|executeQuery\|executeInsert\|executeSelectOne" src/services/miServicio.js
```

### Paso 2 — Verificar cada query

Para cada query encontrada, confirmar que:

1. El array de parámetros incluye `empresa_id`
2. La query SQL usa ese parámetro en el WHERE

### Paso 3 — Verificar el controlador

Confirmar que el controlador extrae `empresa_id` de `req` y no de `req.body`:

```js
// ✅ Correcto
const { empresa_id } = req; // Del token JWT

// ❌ Inseguro
const { empresa_id } = req.body; // Puede ser manipulado
```

---

## Casos Especiales

### Rutas de Admin (super_admin)

El módulo admin (`/api/admin`) puede ver datos de TODAS las empresas porque es el administrador del sistema. Es correcto que no filtre por `empresa_id` del token.

```js
// src/services/adminService.js — CORRECTO
// La query no filtra por empresa_id porque super_admin ve todo
`SELECT e.*, ep.* FROM empresas e JOIN empresa_planes ep ON e.id = ep.empresa_id`;
```

### Búsqueda Global (searchTerm)

Al agregar búsqueda libre, siempre mantener el filtro de empresa:

```js
let query = `SELECT * FROM clientes WHERE empresa_id = $1`;
const params = [empresa_id];

if (searchTerm) {
  query += ` AND (nombre ILIKE $2 OR apellido ILIKE $2 OR ci = $3)`;
  params.push(`%${searchTerm}%`, searchTerm);
}
```

### Paginación

El helper `executeSelect` requiere `empresa_id` en los params de la query base (no el `executeSelect` en sí):

```js
// ✅ La query lleva empresa_id, el executeSelect maneja la paginación
await executeSelect(
  `SELECT * FROM tabla WHERE empresa_id = $1`,
  [empresa_id],
  page,
  pageSize,
);
```

---

## Variables Disponibles en req (del token JWT)

```js
req.id; // ID del usuario
req.name; // Nombre del usuario
req.empresa_id; // ID de la empresa ← usar para filtros
req.rol; // Rol del usuario
req.fecha_fin; // Fecha fin del plan
req.plan_id; // ID del plan activo
```
