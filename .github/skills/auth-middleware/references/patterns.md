# Auth Middleware — Patrones Avanzados

## Multi-tenant: Regla de Oro

Toda consulta a la base de datos que devuelva datos de negocio **debe incluir** `empresa_id` como filtro. Esto previene que un usuario de una empresa acceda a datos de otra.

```js
// ✅ Patrón correcto en el servicio
export const getClientesService = async (empresa_id) => {
  const query = `SELECT * FROM clientes WHERE empresa_id = $1 AND estado = true`;
  const { rows } = await pool.query(query, [empresa_id]);
  return rows;
};

// ✅ Patrón correcto en el controlador
export const getClientes = async (req, res) => {
  const { empresa_id } = req; // Del token, nunca del body
  try {
    const clientes = await getClientesService(empresa_id);
    return res.status(200).json({ ok: true, clientes });
  } catch (error) {
    return res
      .status(500)
      .json({ ok: false, msg: "Error al obtener clientes" });
  }
};
```

---

## Patrón de Validación de Ownership

Antes de modificar un recurso, verificar que pertenece a la empresa del token:

```js
export const updatePrestamoService = async (prestamo_id, empresa_id, datos) => {
  // 1. Verificar que el préstamo pertenece a la empresa
  const { rows } = await pool.query(
    `SELECT id FROM prestamos WHERE id = $1 AND empresa_id = $2`,
    [prestamo_id, empresa_id],
  );
  if (rows.length === 0) {
    throw new Error("Préstamo no encontrado o sin permisos");
  }
  // 2. Proceder con la actualización
  // ...
};
```

---

## Roles y Permisos por Módulo

| Módulo    | Lectura            | Creación           | Edición            | Eliminación        |
| --------- | ------------------ | ------------------ | ------------------ | ------------------ |
| Empresas  | super_admin        | super_admin        | super_admin        | super_admin        |
| Usuarios  | admin, super_admin | admin, super_admin | admin, super_admin | admin, super_admin |
| Clientes  | todos              | admin, cobrador    | admin, cobrador    | admin              |
| Préstamos | todos              | admin, cobrador    | admin              | admin              |
| Cuotas    | todos              | (auto)             | admin              | admin              |
| Pagos     | todos              | admin, cobrador    | admin              | admin              |
| Descargos | admin              | cobrador           | admin              | admin              |

---

## Patrón de Ruta con Validaciones Completas

```js
// Ruta con validación de body + auth + rol
route.post(
  "/prestamos",
  [
    validarJWT,
    validarRol(userRol.admin, userRol.cobrador),
    check("cliente_id", "El cliente es requerido").isInt({ min: 1 }),
    check("monto", "El monto debe ser un número positivo").isFloat({
      min: 0.01,
    }),
    check("tasa_interes", "La tasa de interés es requerida").isFloat({
      min: 0,
    }),
    check("frecuencia_pago", "La frecuencia de pago es requerida")
      .not()
      .isEmpty(),
    check(
      "total_cuotas",
      "El total de cuotas debe ser un entero positivo",
    ).isInt({ min: 1 }),
    check("fecha_inicio", "La fecha de inicio es requerida").isDate(),
    validarCampos,
  ],
  crearPrestamo,
);
```

---

## Generación y Renovación de Token

```js
// src/helpers/jwt.js — Payload del token
const payload = { id, name, empresa_id, rol, fecha_fin, plan_id };
// Expira en 24 horas

// Renovar token: GET /api/auth/renew (con x-token válido)
// El endpoint devuelve un nuevo token con los mismos datos actualizados
```

---

## Manejo de Errores en Controladores

```js
export const miControlador = async (req, res) => {
  const { empresa_id, id: usuario_id } = req;
  try {
    const resultado = await miServicio(empresa_id);
    return res.status(200).json({ ok: true, data: resultado });
  } catch (error) {
    // Errores de negocio conocidos
    if (error.message === "Recurso no encontrado") {
      return res.status(404).json({ ok: false, msg: error.message });
    }
    // Error inesperado
    console.error("Error en miControlador:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error inesperado. Contacte al administrador.",
    });
  }
};
```

---

## Variables de Entorno Requeridas

```env
JWT_SECRET=<clave_secreta_fuerte>   # Para firmar/verificar tokens
PORT=3000                           # Puerto del servidor
DB_HOST=...                         # Conexión PostgreSQL
```
