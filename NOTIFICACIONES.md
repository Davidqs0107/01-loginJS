# Sistema de Notificaciones por Email

Sistema automático de recordatorios de cuotas próximas a vencer mediante email.

## 📋 Características

- ✅ Envío automático de emails 2 días antes del vencimiento
- ✅ Cron job que se ejecuta diariamente a las 8:00 AM
- ✅ Registro de notificaciones enviadas (evita duplicados)
- ✅ Templates HTML profesionales
- ✅ Soporte para múltiples proveedores SMTP (Gmail, Outlook, etc.)
- ✅ Sistema de logs detallado

## 🚀 Configuración Inicial

### 1. Variables de Entorno

Copia las variables del archivo `.env.template` a tu archivo `.env`:

```env
# Configuración de Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu-email@gmail.com
EMAIL_PASSWORD=tu-password-de-aplicacion
```

### 2. Configurar Gmail (Recomendado)

Para usar Gmail, necesitas crear una **Contraseña de Aplicación**:

#### Pasos:

1. Ve a tu cuenta de Google: https://myaccount.google.com/
2. Selecciona **Seguridad**
3. En "Cómo inicias sesión en Google", selecciona **Verificación en dos pasos** (debes activarla)
4. Al final de la página, selecciona **Contraseñas de aplicaciones**
5. Selecciona "Correo" y "Otro (nombre personalizado)"
6. Escribe un nombre (ej: "Sistema de Préstamos")
7. Copia la contraseña generada de 16 caracteres
8. Pégala en `EMAIL_PASSWORD` en tu archivo `.env`

**Ejemplo de configuración:**

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=miempresa@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

### 3. Otras Alternativas de Email

#### Outlook/Hotmail

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu-email@outlook.com
EMAIL_PASSWORD=tu-password
```

#### SendGrid (Recomendado para producción)

```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=tu-api-key-de-sendgrid
```

#### AWS SES

```env
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu-smtp-username
EMAIL_PASSWORD=tu-smtp-password
```

## 🗄️ Base de Datos

### Ejecutar el script SQL

El sistema requiere la tabla `notificaciones_enviadas`. Ejecuta el archivo `database/db.sql` actualizado:

```sql
CREATE TABLE notificaciones_enviadas (
  id int8 GENERATED ALWAYS AS IDENTITY(...) NOT NULL,
  cuota_id int8 NOT NULL,
  cliente_id int8 NOT NULL,
  tipo varchar(20) NOT NULL,
  destinatario text NOT NULL,
  estado varchar(20) DEFAULT 'enviado',
  mensaje text NULL,
  error_mensaje text NULL,
  fecha_envio timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
  CONSTRAINT notificaciones_enviadas_pkey PRIMARY KEY (id),
  ...
);
```

## 🔄 Funcionamiento del Cron Job

### Horario de Ejecución

- **Frecuencia:** Diariamente
- **Hora:** 8:00 AM (horario del servidor)
- **Días anticipación:** 2 días antes del vencimiento

### Proceso Automático

1. **A las 8:00 AM cada día**, el sistema:
   - Busca cuotas que vencen en exactamente 2 días
   - Filtra clientes con email válido
   - Verifica que no se haya enviado notificación hoy
   - Envía el email de recordatorio
   - Registra el resultado en la base de datos

### Personalización del Horario

Para cambiar el horario, edita el archivo `src/jobs/notificacionesCuotasJob.js`:

```javascript
// Formato: segundo minuto hora dia mes día_semana
cron.schedule("0 8 * * *", async () => {
  // 8:00 AM diario
  await this.procesarNotificaciones();
});

// Ejemplos:
// '0 9 * * *'     -> 9:00 AM diario
// '0 6,18 * * *'  -> 6:00 AM y 6:00 PM diario
// '0 8 * * 1-5'   -> 8:00 AM de lunes a viernes
// '*/30 * * * *'  -> Cada 30 minutos (NO recomendado)
```

## 🧪 Pruebas

### Probar envío manual

Puedes ejecutar el job manualmente para pruebas:

```javascript
// En src/index.js o mediante un endpoint temporal
import notificacionesCuotasJob from "./jobs/notificacionesCuotasJob.js";

// Ejecutar inmediatamente
await notificacionesCuotasJob.ejecutarManualmente();
```

### Crear endpoint de prueba (opcional)

```javascript
// En src/routes/adminRoutes.js
router.get(
  "/test-notifications",
  validarJWT,
  validarRol(["super_admin"]),
  async (req, res) => {
    try {
      await notificacionesCuotasJob.ejecutarManualmente();
      res.json({ ok: true, msg: "Job ejecutado manualmente" });
    } catch (error) {
      res.status(500).json({ ok: false, msg: error.message });
    }
  },
);
```

## 📧 Template de Email

El email incluye:

- ✅ Nombre del cliente
- ✅ Número de cuota
- ✅ Monto total
- ✅ Monto pagado
- ✅ Saldo pendiente
- ✅ Fecha de vencimiento (2 días)
- ✅ Datos de contacto de la empresa
- ✅ Diseño HTML profesional

## 📊 Consultar Notificaciones Enviadas

### Ver notificaciones del día

```sql
SELECT * FROM notificaciones_enviadas
WHERE fecha_envio::date = CURRENT_DATE
ORDER BY fecha_envio DESC;
```

### Ver notificaciones fallidas

```sql
SELECT * FROM notificaciones_enviadas
WHERE estado = 'fallido'
ORDER BY fecha_envio DESC
LIMIT 50;
```

### Estadísticas por cliente

```sql
SELECT
  c.nombre, c.apellido, c.email,
  COUNT(*) as total_notificaciones,
  SUM(CASE WHEN ne.estado = 'enviado' THEN 1 ELSE 0 END) as exitosos,
  SUM(CASE WHEN ne.estado = 'fallido' THEN 1 ELSE 0 END) as fallidos
FROM notificaciones_enviadas ne
JOIN clientes c ON ne.cliente_id = c.id
GROUP BY c.id, c.nombre, c.apellido, c.email
ORDER BY total_notificaciones DESC;
```

## 🔧 Troubleshooting

### Error: "Invalid login: 535-5.7.8 Username and Password not accepted"

- **Causa:** Contraseña incorrecta o Gmail bloqueando el acceso
- **Solución:** Usar contraseña de aplicación (ver sección configuración Gmail)

### Error: "Connection timeout"

- **Causa:** Puerto o host incorrecto
- **Solución:** Verificar EMAIL_HOST y EMAIL_PORT en .env

### Error: "Self signed certificate"

- **Causa:** Problemas SSL/TLS
- **Solución:** Asegurar que `EMAIL_SECURE=false` para puerto 587

### No se envían notificaciones

- **Verificar:** Los clientes tienen email válido en la base de datos
- **Verificar:** Las cuotas están en estado 'pendiente' o 'parcial'
- **Verificar:** La fecha de la cuota es exactamente en 2 días
- **Verificar:** No se envió notificación hoy (revisar tabla notificaciones_enviadas)

### Revisar logs del servidor

```bash
# Al iniciar el servidor verás:
✅ Configuración de email verificada correctamente
🚀 Iniciando cron job de notificaciones de cuotas
⏰ Programado para ejecutarse diariamente a las 8:00 AM
✅ Cron job iniciado correctamente

# Durante la ejecución diaria:
🔔 Iniciando proceso de notificaciones de cuotas...
📋 Encontradas X cuotas próximas a vencer
📧 Enviando notificación a: cliente@email.com
✅ Enviado exitosamente
📊 Resumen de ejecución: ✅ Exitosos: X ❌ Fallidos: Y
```

## 📈 Mejoras Futuras

- [ ] Panel de administración para ver notificaciones
- [ ] Soporte para WhatsApp (próximamente)
- [ ] Plantillas personalizables por empresa
- [ ] Notificaciones el día del vencimiento
- [ ] Notificaciones de cuotas vencidas
- [ ] Estadísticas y reportes

## 📝 Notas Importantes

- El sistema **NO** envía el mismo email dos veces en el mismo día
- Los emails se envían con un delay de 1 segundo entre cada uno para no saturar el servidor SMTP
- Las notificaciones fallidas se registran con el mensaje de error
- Asegúrate de tener los clientes con emails válidos en la base de datos
