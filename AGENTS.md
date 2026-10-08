# AGENTS.md — Hatria Backend (Express + PostgreSQL)

> Reglas de oro y mapa de trabajo para agentes que tocan este repositorio. Lee este archivo **antes** de modificar código.

## Qué es

API REST del SaaS **Hatria** (préstamos y cobranzas multi-empresa). Express 4 + `pg` sin ORM + JWT. Multi-tenant estricto por `empresa_id` extraído del JWT. Ver `README.md` para descripción de negocio completa.

> El repo se llama `01-login` por el scaffold original; ignora el nombre.

## Stack y comandos

| Acción | Comando | Notas |
|---|---|---|
| Instalar deps | `npm install` | |
| Servir dev | `npm run dev` | `node --watch src/index.js` (puerto `PORT` del `.env`, default 3000) |
| Servir prod | `npm start` | sin watch |
| Tests (todos) | `npm test` | `node --test` runner nativo de Node |
| Tests unitarios puros | `npm run test:unit` | solo `tests/calculos.test.js` (cálculo de cuotas) |
| Seed idempotente | `npm run seed` | `database/seed.js` |

## Requisitos

- **Node.js 20+** (el proyecto NO compila TS, corre JS ESM directo).
- **PostgreSQL 14+** accesible (local o Docker). El `.env` actual apunta a `localhost:5432` con DB `prestamos2DB` (Postgres nativo, no Docker).
- Copiar `.env.example` o `.env.template` → `.env` y completar.

## Regla #1: Multi-tenant

**Todo query a la BD DEBE filtrar por `empresa_id`.** El `empresa_id` viene del JWT y el middleware `validarJWT` lo pone en `req.empresa_id` (`src/middlewares/validar-jwt.js:57-69`). **Nunca** confiar en `empresa_id` del body o query params — siempre usar `req.empresa_id`.

Excepción: rutas bajo `/api/admin/*` (gestión de super_admin) y `/api/portal/*` (portal público del cliente, usa token propio).

## Regla #2: Auth y tokens

- Header `x-token` con JWT. **No** usar `Authorization: Bearer`.
- `validarJWT` rechaza con 401 si: no hay token, token inválido, **plan expirado** (`fecha_fin < now`), o no hay `rol` en el payload.
- Expiración de plan: cuando vence, `validar-jwt.js:50-56` llama `disabledPlanEmpresaService(empresa_id)` que desactiva la empresa. **El plan expirado es 401, no 200 con flag.**
- Las respuestas NUNCA incluyen el hash de `password` (revisar `userServices.js`).

## Regla #3: Cálculos puros y testeables

- Cálculos con reglas de negocio (cuotas, mora, waterfall de pagos, finiquito) viven en `src/helpers/` como **funciones puras sin acceso a BD**.
- Reciben datos por parámetro, devuelven resultado. Si tu lógica nueva toca `pg` directo, **refactorízala a helper puro primero** y después úsala desde el service.
- Tests unitarios en `tests/calculos.test.js`, `tests/mora.test.js`, `tests/waterfall.test.js`, `tests/finiquito.test.js` cubren estos helpers.

## Regla #4: Migraciones

- Cada cambio de esquema: nueva migration en `database/migrations/00N_descripcion.sql` (incremental, aditiva).
- Para deploy en producción, agregar el contenido al bundle `database/migrate_features_v2.sql` (idempotente, transaccional, `IF NOT EXISTS` y bloques `DO`).
- **Orden de deploy**: primero la migración de BD, después el código nuevo.
- La mora arranca **desactivada por defecto** en nuevas empresas; no cambia comportamiento de préstamos existentes hasta que se active.

## Estructura

```
src/
├── index.js            # bootstrap, middlewares, 15 routers, 3 cron jobs
├── config.js, db.js    # config + pool de PostgreSQL
├── routes/             # 16 archivos, uno por dominio
├── controllers/        # capa HTTP (valida, responde JSON)
├── services/           # lógica de negocio + queries
├── middlewares/        # validar-jwt, validar-rol, validar-campos
├── helpers/            # funciones puras (mora, waterfall, finiquito, jwt)
├── jobs/               # cron: incumplimiento, notificaciones, suscripciones
└── constants/          # enums: roles, estados, frecuencias
database/
├── db.sql              # esquema base completo
├── migrations/         # 001 a 009 incrementales
└── migrate_features_v2.sql  # bundle aditivo para prod
tests/                  # node --test, sin Jest
```

## Rutas (resumen)

Todas bajo `/api`. Requieren `x-token` salvo `/api/auth/*` y `/api/portal/*`.

`/auth` · `/admin` · `/user` · `/empresa` · `/clientes` · `/prestamos` · `/cuotas` · `/pagos` · `/descargos` · `/reportes` · `/configuracion` · `/auditoria` · `/arqueos` · `/portal` · `/comprobantes`

## Jobs programados (cron)

| Job | Hora | Archivo | Nota |
|---|---|---|---|
| Incumplimiento | 6:00 AM | `jobs/incumplimientoJob.js` | Marca préstamos con atraso > umbral |
| Suscripciones | 7:00 AM | `jobs/suscripcionJob.js` | Reporta planes por vencer/vencidos |
| Notificaciones | 8:00 AM | `jobs/notificacionesCuotasJob.js` | Solo si SMTP configurado |

## Tests

- Runner: `node --test` (nativo, sin Jest ni Vitest).
- Unitarios puros: `tests/calculos.test.js`, `tests/mora.test.js`, `tests/waterfall.test.js`, `tests/finiquito.test.js`.
- Integración: `tests/pagos.integration.test.js`, `tests/portal.test.js`, `tests/arqueo.test.js`, `tests/features.integration.test.js`, `tests/refinanciacion.test.js`, `tests/suscripcion.test.js` (necesitan Postgres real, BD `prestamos_db`).
- Convenciones: usar `node:assert/strict`, `node:test`, helpers en `tests/helpers/` si los hay.

## Endurecimiento pendiente (no ignorar al tocar)

1. **CORS abierto** (`src/index.js:37`): `app.use(cors())` sin whitelist. Cerrar antes de prod público.
2. **Sin rate limit** en `/api/auth`. `/api/auth/login` es público.
3. **JWT sin refresh real**: el frontend llama `/auth/renew` pero no hay rotación. Considerar refresh tokens + `httpOnly` cookie.
4. **`process.on('unhandledRejection')`** solo loguea (`index.js:94-99`). No tumbar el servidor está bien para dev, pero documentar para prod.

## Convenciones de código

- **ESM** (`"type": "module"`). Imports con extensión `.js` (`import x from './y.js'`).
- **Sin TypeScript**. Si necesitas tipos, JSDoc.
- **Money**: `numeric(15, 2)`. Redondear a 2 decimales antes de guardar (`Math.round(n * 100) / 100`).
- **Timestamps**: `timestamptz` con `DEFAULT CURRENT_TIMESTAMP`. Fechas de cuota: `date` (sin hora).
- **Roles**: usar constantes de `src/constants/`, no strings sueltos.
- **Errores HTTP**: responder `{ ok: false, msg: 'mensaje' }`. El handler global (`index.js:70-91`) ya cubre `LIMIT_FILE_SIZE` (413) y `entity.too.large`.

## Variables de entorno esperadas

Ver `.env.example`. Críticas:

- `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT`
- `PORT`, `HOST_API`
- `JWT_SECRET` — **rotar si se filtró**. Cambiar invalida todos los tokens activos.
- `EMAIL_*` — opcionales; sin ellas, el cron de notificaciones no arranca (por diseño, `index.js:107-117`).

## Cómo añadir un endpoint (checklist)

1. Service en `src/services/<dominio>Services.js` con queries que filtren por `empresa_id`.
2. Controller en `src/controllers/<dominio>Controller.js` que valide input y llame al service.
3. Route en `src/routes/<dominio>Routes.js` con `validarJWT` + `validarRol` (si aplica) + `validarCampos` (si aplica).
4. Registrar en `src/index.js` con `app.use('/api/<recurso>', <router>)`.
5. Si la lógica tiene cálculo, extraer a helper puro + test unitario.
6. Si cambia esquema, nueva migration en `database/migrations/`.
7. Si改了 comportamiento en prod, agregar al bundle `database/migrate_features_v2.sql`.

## No hacer

- **No** commitear `.env` (ya está en `.gitignore`).
- **No** añadir ORM. El proyecto usa `pg` directo por diseño — queries en `services/`, helpers en `helpers/`.
- **No** introducir Jest/Vitest. El runner es `node --test` nativo.
- **No** confiar en datos del cliente para `empresa_id` o `rol` — siempre del JWT.
- **No** meter timestamps locales en la BD — usar `timestamptz` con default server-side.
