# Hatria API — Backend

API REST de un **sistema SaaS de préstamos y cobranzas multi-empresa** (tipo software para financieras/prestamistas). Gestiona el ciclo completo: clientes, préstamos, cuotas, pagos, mora, cobranzas en ruta, reportes y un portal para el cliente final.

> El nombre "login" viene del scaffold inicial; hoy el sistema hace mucho más que autenticar.

## Stack

- **Node.js** + **Express** (ESM, `type: module`)
- **PostgreSQL** con el driver `pg` (sin ORM; queries y helpers propios)
- **JWT** (`jsonwebtoken`) + **bcrypt** para auth
- **node-cron** para tareas programadas
- **nodemailer** para notificaciones por email
- **express-fileupload** para adjuntos (documentos y comprobantes)

## Requisitos

- Node.js 20+
- PostgreSQL 14+ (o Docker)

## Puesta en marcha (desarrollo)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno: copia la plantilla y complétala
cp .env.example .env        # (o .env.template)

# 3. Base de datos con Docker (opcional, crea Postgres local)
docker-compose up -d

# 4. Cargar el esquema en la base 'prestamos_db'
#    $DATABASE_URL es tu cadena de conexión, p.ej.:
#    postgresql://postgres:postgres@localhost:5432/prestamos_db
#    (la primera sentencia del db.sql crea el schema public; en una BD nueva
#     hay que dropearlo antes)
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS public CASCADE;"
psql "$DATABASE_URL" -f database/db.sql
psql "$DATABASE_URL" -f database/migrations/001_add_max_usuarios_to_planes.sql
psql "$DATABASE_URL" -f database/migrate_features_v2.sql   # config, mora, arqueos, refinanciación, portal

# 5. (Opcional) Datos de ejemplo: super_admin + admin + cobrador + préstamos demo
npm run seed

# 6. Levantar el servidor
npm run dev
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT` | Conexión a PostgreSQL |
| `PORT`, `HOST_API` | Puerto y URL base del API |
| `JWT_SECRET` | Clave para firmar los tokens (cámbiala en producción) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` | SMTP para notificaciones (ver `.env.example` para Gmail/SendGrid/etc.) |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática (`node --watch`) |
| `npm start` | Servidor en modo producción |
| `npm test` | Tests con el runner nativo de Node (`node --test`) |
| `npm run test:unit` | Solo los tests unitarios puros (sin BD) |
| `npm run seed` | Carga datos de ejemplo (idempotente) |

## Roles

- **`super_admin`** — dueño de la plataforma: gestiona empresas, planes y suscripciones.
- **`admin`** — dueño de una financiera: gestiona su empresa, usuarios, préstamos, configuración.
- **`cobrador`** — registra pagos en ruta, cierra su caja (arqueo), valida comprobantes.

## Módulos / funcionalidades

- **Multi-tenant**: todo se aísla por `empresa_id` (extraído del JWT).
- **Préstamos**: dos modelos de interés — *fijo* (interés por periodo, capital al final) y *cuota* (capital + interés repartidos). Frecuencias diaria → anual.
- **Pagos**: pago simple, parcial y **multipago**; con *waterfall* de mora (el pago cubre primero la mora).
- **Mora** configurable por empresa (% diario sobre saldo, % de cuota, o monto fijo/día) con días de gracia y tope.
- **Incumplimiento automático**: job diario que marca préstamos con atraso mayor al umbral de la empresa.
- **Refinanciación**: capitaliza el saldo pendiente (+ monto adicional) en un préstamo nuevo enlazado al anterior.
- **Arqueo de caja**: cierre diario del cobrador (cobrado vs entregado → diferencia), aprobado por admin.
- **Portal del cliente**: acceso público por token; el cliente ve su deuda y sube comprobantes que el staff valida (y que generan el pago real).
- **Score del cliente**: semáforo crediticio (verde/amarillo/rojo) calculado del historial.
- **Auditoría**: bitácora append-only de acciones sensibles (eliminar pago, cambiar config, aprobar, refinanciar).
- **Suscripciones**: planes por empresa con vencimiento; panel para el super_admin.
- **Reportes**: mora detallada, cartera por estado, cobros por cobrador, agenda de cobro, recaudación mensual, ficha del cliente, préstamos por cliente.
- **Notificaciones por email** (cron): recordatorio de cuota próxima a vencer.

## Tareas programadas (cron)

| Job | Horario | Qué hace |
|---|---|---|
| Notificaciones de cuotas | 8:00 AM | Email recordatorio 2 días antes del vencimiento (requiere SMTP válido) |
| Incumplimiento | 6:00 AM | Marca préstamos incumplidos según el umbral de cada empresa |
| Suscripciones | 7:00 AM | Reporta empresas con plan por vencer / vencido |

## Estructura

```
src/
├── index.js            # bootstrap: middlewares, rutas, jobs
├── config.js, db.js    # configuración y pool de PostgreSQL
├── routes/             # definición de endpoints por dominio
├── controllers/        # capa HTTP (valida, responde)
├── services/           # lógica de negocio y acceso a datos
├── middlewares/        # validar-jwt, validar-rol, validar-campos
├── helpers/            # queries, transacciones, mora, waterfall, jwt
├── jobs/               # tareas cron
└── constants/          # enums (roles, estados, frecuencias)
database/
├── db.sql              # esquema base completo
├── migrations/         # migraciones incrementales (001–005)
└── migrate_features_v2.sql  # bundle de 002–005 para aplicar en producción
```

## Rutas principales

Todas bajo `/api`. Requieren header `x-token` (JWT), salvo `/api/auth/*` y `/api/portal/*` (público).

`/auth` · `/admin` · `/user` · `/empresa` · `/clientes` · `/prestamos` · `/cuotas` · `/pagos` · `/descargos` · `/reportes` · `/configuracion` · `/auditoria` · `/arqueos` · `/portal` · `/comprobantes`

## Migraciones en producción

Las migraciones nuevas (002–005) están agrupadas en `database/migrate_features_v2.sql`. Es **aditivo, transaccional e idempotente** (usa `IF NOT EXISTS` y bloques `DO`), así que es seguro aplicarlo sobre datos existentes:

```bash
# Respalda primero
pg_dump "$DATABASE_URL" > backup_pre_v2.sql
# Aplica
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrate_features_v2.sql
```

> Orden de despliegue: **primero** la migración de BD, **luego** el código nuevo. La mora arranca desactivada por defecto, así que el comportamiento de los préstamos existentes no cambia hasta que se active desde Configuración.

## Tests

Tests con el runner nativo de Node. Los de integración usan una base PostgreSQL real (`prestamos_db`) y hacen seed/limpieza por empresa.

```bash
npm test          # todos
npm run test:unit # solo unitarios puros (cálculo de cuotas, mora, waterfall)
```
