# Guía de Uso del Sistema de Notificaciones

## 🚀 Inicio Rápido

### 1. Configurar Variables de Entorno

Copia el archivo `.env.example` a `.env` y configura tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` y configura tu email:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tuempresa@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop  # Contraseña de aplicación de Gmail
```

### 2. Crear la Tabla en la Base de Datos

Ejecuta el script de migración:

```bash
# Opción 1: Usando psql
psql -U postgres -d tu_database -f database/migration_notificaciones.sql

# Opción 2: Desde pgAdmin
# Abre el archivo database/migration_notificaciones.sql y ejecútalo
```

### 3. Iniciar el Servidor

```bash
npm run dev
```

Deberías ver en la consola:

```
Servicio levantado en el puerto: 3000
📧 Verificando configuración de email...
✅ Configuración de email verificada correctamente
🚀 Iniciando cron job de notificaciones de cuotas
⏰ Programado para ejecutarse diariamente a las 8:00 AM
✅ Cron job iniciado correctamente
```

---

## 📧 Cómo Obtener Contraseña de Aplicación de Gmail

### Video tutorial: https://support.google.com/accounts/answer/185833

### Pasos:

1. **Ir a tu cuenta de Google**
   - Visita: https://myaccount.google.com/

2. **Activar Verificación en 2 Pasos**
   - Ve a "Seguridad"
   - Busca "Verificación en dos pasos"
   - Actívala si no la tienes

3. **Crear Contraseña de Aplicación**
   - En la misma sección de Seguridad
   - Busca "Contraseñas de aplicaciones"
   - Selecciona "Correo" y "Otro (personalizado)"
   - Escribe: "Sistema de Préstamos"
   - Haz clic en "Generar"

4. **Copiar la Contraseña**
   - Te mostrará algo como: `abcd efgh ijkl mnop`
   - Copia y pega en tu archivo `.env`
   - **Importante:** NO uses espacios en el .env

```env
# ✅ Correcto:
EMAIL_PASSWORD=abcdefghijklmnop

# ❌ Incorrecto:
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

---

## 🧪 Probar el Sistema

### Opción 1: Esperar a las 8:00 AM

El cron job se ejecutará automáticamente.

### Opción 2: Ejecutar Manualmente (Recomendado para pruebas)

#### Usando el Endpoint de Admin

```bash
# 1. Autenticarse como super_admin
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@sistema.com",
  "password": "tu_password"
}

# 2. Copiar el token de la respuesta

# 3. Ejecutar el job manualmente
POST http://localhost:3000/api/admin/test-notificaciones
Authorization: Bearer tu_token_aqui
```

#### Usando cURL

```bash
# 1. Login
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sistema.com","password":"tu_password"}' \
  | jq -r '.token')

# 2. Ejecutar notificaciones
curl -X POST http://localhost:3000/api/admin/test-notificaciones \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Verificar Resultados

### Ver logs del servidor

Observa la consola del servidor, verás algo como:

```
🔔 Iniciando proceso de notificaciones de cuotas...
📅 Fecha: 24/1/2026 08:00:00

📋 Encontradas 3 cuotas próximas a vencer

📧 Enviando notificación a: juan.perez@email.com
   Cliente: Juan Pérez
   Cuota #1 - Monto: $500.00
   ✅ Enviado exitosamente

📧 Enviando notificación a: maria.lopez@email.com
   Cliente: María López
   Cuota #2 - Monto: $750.00
   ✅ Enviado exitosamente

📊 Resumen de ejecución:
   ✅ Exitosos: 2
   ❌ Fallidos: 0
   📧 Total procesados: 2
```

### Consultar la base de datos

```sql
-- Ver notificaciones de hoy
SELECT
  ne.*,
  c.nombre || ' ' || c.apellido as cliente,
  cu.numero_cuota,
  cu.monto
FROM notificaciones_enviadas ne
JOIN clientes c ON ne.cliente_id = c.id
JOIN cuotas cu ON ne.cuota_id = cu.id
WHERE ne.fecha_envio::date = CURRENT_DATE
ORDER BY ne.fecha_envio DESC;
```

---

## 🎯 Crear Datos de Prueba

Para probar el sistema, necesitas:

1. **Cliente con email válido**

```sql
-- Verificar/actualizar email de un cliente
UPDATE clientes
SET email = 'cliente.prueba@gmail.com'
WHERE id = 1;
```

2. **Préstamo activo**

```sql
-- Verificar préstamos
SELECT * FROM prestamos WHERE estado = true;
```

3. **Cuota que vence en 2 días**

```sql
-- Opción A: Crear una cuota de prueba
INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto, estado)
VALUES (1, 99, CURRENT_DATE + INTERVAL '2 days', 500.00, 'pendiente');

-- Opción B: Modificar una cuota existente (temporal)
UPDATE cuotas
SET fecha_pago = CURRENT_DATE + INTERVAL '2 days'
WHERE id = 1;
```

4. **Ejecutar el test**

```bash
# Usando curl después de autenticarte
curl -X POST http://localhost:3000/api/admin/test-notificaciones \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔍 Consultas Útiles

### Cuotas que recibirán notificación mañana (a las 8 AM)

```sql
SELECT
    c.nombre, c.apellido, c.email,
    cu.numero_cuota, cu.fecha_pago, cu.monto,
    e.nombre as empresa
FROM cuotas cu
JOIN prestamos p ON cu.prestamo_id = p.id
JOIN clientes c ON p.cliente_id = c.id
JOIN empresas e ON p.empresa_id = e.id
WHERE cu.estado IN ('pendiente', 'parcial')
  AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '2 days')::date
  AND c.email IS NOT NULL
  AND c.email != '';
```

### Clientes sin email (no recibirán notificaciones)

```sql
SELECT id, nombre, apellido, telefono
FROM clientes
WHERE (email IS NULL OR email = '')
  AND estado = true
ORDER BY nombre;
```

### Historial de notificaciones por cliente

```sql
SELECT
    c.nombre || ' ' || c.apellido as cliente,
    c.email,
    COUNT(*) FILTER (WHERE ne.tipo = 'email') as emails_enviados,
    COUNT(*) FILTER (WHERE ne.estado = 'fallido') as fallidos,
    MAX(ne.fecha_envio) as ultima_notificacion
FROM clientes c
LEFT JOIN notificaciones_enviadas ne ON c.id = ne.cliente_id
GROUP BY c.id, c.nombre, c.apellido, c.email
HAVING COUNT(*) > 0
ORDER BY ultima_notificacion DESC;
```

---

## ⚠️ Troubleshooting

### Problema: No se envían emails

**Checklist:**

- [ ] Variables EMAIL\_\* configuradas en `.env`
- [ ] Usando contraseña de aplicación (no contraseña normal)
- [ ] Cliente tiene email válido en BD
- [ ] Cuota vence en exactamente 2 días
- [ ] Cuota en estado 'pendiente' o 'parcial'
- [ ] No se envió notificación hoy (revisar tabla)

**Verificar configuración:**

```bash
# Ver variables de entorno cargadas
node -e "require('dotenv').config(); console.log({
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? '***configurado***' : 'NO CONFIGURADO'
})"
```

### Problema: Error "Invalid login"

**Solución:**

1. Verifica que usas contraseña de aplicación (no la normal)
2. La contraseña debe ser sin espacios: `abcdefghijklmnop`
3. Verifica que la verificación en 2 pasos esté activa

### Problema: Email va a spam

**Soluciones:**

- Usa un email profesional del dominio de tu empresa
- Configura SPF, DKIM y DMARC en tu dominio
- Considera usar SendGrid o AWS SES para producción

---

## 📈 Personalización

### Cambiar horario del cron

Edita `src/jobs/notificacionesCuotasJob.js`:

```javascript
// Línea 193
cron.schedule("0 8 * * *", async () => {
  // <- Cambiar aquí
  await this.procesarNotificaciones();
});

// Ejemplos:
// '0 9 * * *'       -> 9:00 AM todos los días
// '0 8,20 * * *'    -> 8:00 AM y 8:00 PM
// '0 8 * * 1-5'     -> 8:00 AM de lunes a viernes
// '0 */6 * * *'     -> Cada 6 horas
```

### Cambiar días de anticipación

Edita `src/jobs/notificacionesCuotasJob.js`, línea 28:

```javascript
// Cambiar el '2 days' por lo que necesites
AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '3 days')::date  -- 3 días
```

### Personalizar template del email

Edita `src/services/emailService.js`, línea 41:

```javascript
const mailOptions = {
  from: `"${empresa.nombre}" <${process.env.EMAIL_USER}>`,
  to: cliente.email,
  subject: `Recordatorio: Cuota #${cuota.numero_cuota} próxima a vencer`,
  html: `
    <!-- Tu HTML personalizado aquí -->
  `,
};
```

---

## 📚 Recursos Adicionales

- **Documentación Nodemailer:** https://nodemailer.com/
- **Documentación node-cron:** https://github.com/node-cron/node-cron
- **Cron expression generator:** https://crontab.guru/
- **Contraseñas de aplicación Gmail:** https://support.google.com/accounts/answer/185833
- **SendGrid (profesional):** https://sendgrid.com/
- **AWS SES (enterprise):** https://aws.amazon.com/ses/

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs del servidor
2. Verifica las consultas SQL en esta guía
3. Revisa el archivo `NOTIFICACIONES.md`
4. Verifica la configuración en `.env`

**Archivos importantes:**

- `src/services/emailService.js` - Lógica de envío de emails
- `src/jobs/notificacionesCuotasJob.js` - Cron job
- `database/migration_notificaciones.sql` - Script SQL
- `NOTIFICACIONES.md` - Documentación completa
