---
name: auth-middleware
description: "Skill para implementar autenticación JWT y control de roles en rutas Express. Usar cuando: crear nuevas rutas protegidas, agregar validación de roles (super_admin, admin, cobrador), proteger endpoints con empresa_id multi-tenant, renovar tokens, diagnosticar errores 401/403, entender el flujo de autenticación del sistema."
argument-hint: "Describe la ruta o módulo que necesita protección: ej. 'ruta GET /api/reportes solo para admin'"
---

# Auth Middleware Skill

## Contexto del Sistema

Este proyecto es una API REST Node.js + Express multi-tenant para gestión de préstamos.  
Cada usuario pertenece a una empresa (`empresa_id`). **Todas las rutas protegidas deben filtrar datos por `empresa_id` extraído del token, nunca del body/query.**

---

## Estructura del Token JWT

```js
// Payload almacenado en el token (header: x-token)
{
  (id, // ID del usuario
    name, // Nombre del usuario
    empresa_id, // ID de la empresa (multi-tenant key)
    rol, // Rol del usuario
    fecha_fin, // Fecha de expiración del plan de la empresa
    plan_id); // ID del plan activo
}
```

---

## Roles Disponibles

```js
// src/constants/usuarios.constants.js
export const userRol = {
  superAdmin: "super_admin", // Administrador del sistema
  admin: "admin", // Administrador de empresa
  cobrador: "cobrador", // Agente de cobros
};
```

---

## Middlewares Disponibles

| Middleware             | Archivo                             | Uso                                                 |
| ---------------------- | ----------------------------------- | --------------------------------------------------- |
| `validarJWT`           | `src/middlewares/validar-jwt.js`    | Verifica token, plan activo, inyecta `req.*`        |
| `validarRol(...roles)` | `src/middlewares/validar-rol.js`    | Verifica que `req.rol` esté en los roles permitidos |
| `validarCampos`        | `src/middlewares/validar-campos.js` | Valida errores de express-validator                 |

---

## Procedimiento: Crear una Ruta Protegida

### Paso 1 — Importar middlewares y constantes

```js
import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { userRol } from "../constants/usuarios.constants.js";
import { check } from "express-validator";
```

### Paso 2 — Definir la cadena de middlewares

```js
const route = Router();

// Ruta pública (sin auth)
route.post("/login", [...validaciones], controller);

// Ruta solo autenticada (cualquier rol válido)
route.get("/recurso", [validarJWT], controller);

// Ruta restringida a admin y super_admin
route.post(
  "/recurso",
  [
    validarJWT,
    validarRol(userRol.admin, userRol.superAdmin),
    check("campo", "Campo requerido").not().isEmpty(),
    validarCampos,
  ],
  controller,
);

// Ruta solo para cobrador
route.get("/cobros", [validarJWT, validarRol(userRol.cobrador)], controller);
```

### Paso 3 — Usar empresa_id en el controlador

```js
// ✅ CORRECTO: siempre desde req (inyectado por validarJWT)
export const miControlador = async (req, res) => {
  const { empresa_id, id: usuario_id, rol } = req;
  // Usar empresa_id para filtrar en DB
};

// ❌ INCORRECTO: nunca confiar en body/query para empresa_id
export const miControladorInseguro = async (req, res) => {
  const { empresa_id } = req.body; // Vulnerabilidad de escalada de privilegios
};
```

### Paso 4 — Registrar la ruta en index.js

```js
import miRouter from "./routes/miRoute.js";
app.use("/api/mi-recurso", miRouter);
```

---

## Formato de Respuesta Estándar

```js
// Éxito
res.status(200).json({ ok: true, data: resultado });
res.status(201).json({ ok: true, msg: "Creado con éxito", data: resultado });

// Error de cliente
res.status(400).json({ ok: false, msg: "Mensaje descriptivo del error" });

// No autorizado (sin token / token inválido)
res.status(401).json({ ok: false, message: "no hay token valido" });

// Sin permisos (rol insuficiente)
res
  .status(403)
  .json({ ok: false, message: "No tiene permisos para realizar esta acción" });

// No encontrado
res.status(404).json({ ok: false, msg: "Recurso no encontrado" });

// Error de servidor
res
  .status(500)
  .json({ ok: false, msg: "Error inesperado. Contacte al administrador." });
```

---

## Flujo Completo de Autenticación

```
Cliente                    Servidor
  │                           │
  │──POST /api/auth/login ──► │  1. Valida email + password
  │                           │  2. Verifica usuario activo y empresa activa
  │◄── { token, usuario } ───│  3. Genera JWT con payload completo
  │                           │
  │──GET /api/recurso ──────► │  1. validarJWT extrae token de header x-token
  │   x-token: <jwt>          │  2. Verifica firma y expiración
  │                           │  3. Verifica fecha_fin del plan
  │                           │  4. Inyecta req.id, req.empresa_id, req.rol, etc.
  │                           │  5. validarRol verifica rol permitido
  │◄── { ok: true, data } ───│  6. Controlador filtra por empresa_id
```

---

## Errores Comunes y Soluciones

| Error                             | Causa                                | Solución                                |
| --------------------------------- | ------------------------------------ | --------------------------------------- |
| `401 no hay token en la peticion` | Header `x-token` ausente             | Agregar header en el cliente            |
| `401 El plan ha expirado`         | `fecha_fin` del plan < hoy           | Renovar plan de la empresa              |
| `401 no hay token valido`         | Token malformado o expirado (>24h)   | Renovar token via `GET /api/auth/renew` |
| `403 No tiene permisos`           | Rol no incluido en `validarRol(...)` | Verificar roles requeridos para la ruta |

---

## Referencias Adicionales

- [Patrones detallados y ejemplos avanzados](./references/patterns.md)
- [Template de ruta completo](./assets/route-template.js)
