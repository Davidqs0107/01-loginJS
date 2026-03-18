---
name: notification-scheduler
description: "Skill para el sistema de notificaciones automáticas de cuotas próximas a vencer. Usar cuando: modificar el cron job de notificaciones, cambiar el criterio de cuotas a notificar, personalizar el template de email, agregar nuevos canales (WhatsApp, SMS), entender la tabla notificaciones_enviadas, evitar duplicados de notificación, probar el job manualmente, trabajar con notificacionesCuotasJob.js o emailService.js."
argument-hint: "Describe qué cambiar: ej. 'notificar 3 días antes en lugar de 2' o 'agregar canal WhatsApp'"
---

# Notification Scheduler Skill

## Contexto del Sistema

El sistema envía recordatorios automáticos de cuotas por email usando:

- **`node-cron`**: Ejecuta el job todos los días a las **8:00 AM**
- **`nodemailer`**: Envía emails vía SMTP (Gmail, Outlook u otro)
- **`notificaciones_enviadas`**: Tabla que evita duplicados por día

El job se inicializa en `src/index.js` **solo si la configuración de email es válida**.

---

## Criterio de Cuotas a Notificar

El job busca cuotas que cumplen TODAS estas condiciones:

```sql
WHERE
  cu.estado IN ('pendiente', 'parcial')
  AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '2 days')::date
  AND cl.estado = true
  AND cl.email IS NOT NULL AND cl.email != ''
  AND NOT EXISTS (
    SELECT 1 FROM notificaciones_enviadas ne
    WHERE ne.cuota_id = cu.id
      AND ne.tipo = 'email'
      AND ne.estado = 'enviado'
      AND ne.fecha_envio::date = CURRENT_DATE
  )
```

---

## Variables de Entorno Requeridas

```env
EMAIL_HOST=smtp.gmail.com          # Servidor SMTP
EMAIL_PORT=587                     # Puerto (587=TLS, 465=SSL)
EMAIL_SECURE=false                 # true solo para puerto 465
EMAIL_USER=tu@email.com            # Usuario/remitente
EMAIL_PASSWORD=app_password_aqui   # App Password (no la contraseña real de Gmail)
```

> Para Gmail: activar "Verificación en 2 pasos" y generar una "Contraseña de aplicación" en https://myaccount.google.com/apppasswords

---

## Tabla de Notificaciones

```sql
-- Canales soportados
tipo: 'email' | 'whatsapp' | 'sms'
-- Estados
estado: 'enviado' | 'fallido' | 'pendiente'
```

---

## Procedimiento: Cambiar Días de Anticipación

Para notificar 3 días antes en lugar de 2:

```js
// src/jobs/notificacionesCuotasJob.js — método obtenerCuotasProximasVencer()
// Cambiar:
AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '2 days')::date
// Por:
AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '3 days')::date
```

También actualizar el texto en el email:

```js
// src/services/emailService.js
// Cambiar:
<p class="warning">⚠️ Esta cuota vence en 2 días</p>
// Por:
<p class="warning">⚠️ Esta cuota vence en 3 días</p>
```

---

## Procedimiento: Cambiar Horario del Cron Job

```js
// src/jobs/notificacionesCuotasJob.js — método iniciar()
// Formato: '0 8 * * *' = todos los días a las 8:00 AM
// Cambiar a 7:30 AM:
cron.schedule("30 7 * * *", async () => {
  await this.procesarNotificaciones();
});

// Referencia de formato cron:
// '0 8 * * *'     → 8:00 AM diario
// '0 8 * * 1-5'   → 8:00 AM solo lunes a viernes
// '0 8,14 * * *'  → 8:00 AM y 2:00 PM diario
// '*/30 * * * *'  → Cada 30 minutos
```

---

## Procedimiento: Personalizar Template de Email

El template HTML está en `src/services/emailService.js`, función `enviarRecordatorioCuota`.

Campos disponibles en el template:

```js
// Datos del cliente
(cliente.nombre, cliente.apellido, cliente.email, cliente.telefono);

// Datos de la cuota
(cuota.numero_cuota, cuota.fecha_pago, cuota.monto, cuota.monto_pagado);
// Saldo: cuota.monto - (cuota.monto_pagado || 0)

// Datos de la empresa
(empresa.nombre, empresa.telefono, empresa.direccion);
```

---

## Procedimiento: Probar el Job Manualmente

Desde el frontend o con curl/Postman (requiere `super_admin`):

```bash
POST /api/admin/test-notificaciones
x-token: <jwt_super_admin>
```

O directamente desde código si tienes acceso al servidor:

```js
import notificacionesCuotasJob from "./src/jobs/notificacionesCuotasJob.js";
await notificacionesCuotasJob.ejecutarManualmente();
```

---

## Procedimiento: Agregar Canal WhatsApp

### Paso 1 — Crear servicio de WhatsApp

```js
// src/services/whatsappService.js
export const enviarMensajeWhatsApp = async (telefono, mensaje) => {
  // Integrar con API: Twilio, Meta Business, WPPConnect, etc.
  // Retornar { success: true/false, messageId, error? }
};
```

### Paso 2 — Agregar método en el Job

```js
// src/jobs/notificacionesCuotasJob.js — dentro de procesarNotificaciones()
// Después de enviar el email, agregar:
if (cuota.cliente_telefono) {
  const resultWA = await enviarMensajeWhatsApp(
    cuota.cliente_telefono,
    `Recordatorio: Su cuota #${cuota.numero_cuota} vence en 2 días. Monto: $${cuota.monto}`,
  );
  await this.registrarNotificacion(
    cuota.cuota_id,
    cuota.cliente_id,
    "whatsapp",
    cuota.cliente_telefono,
    resultWA.success ? "enviado" : "fallido",
    resultWA.success ? "Recordatorio WhatsApp" : null,
    resultWA.success ? null : resultWA.error,
  );
}
```

---

## Estructura del Job (Clase)

```
NotificacionesCuotasJob
├── isRunning (mutex para evitar ejecuciones concurrentes)
├── obtenerCuotasProximasVencer() → SQL con filtro de 2 días + deduplicación
├── registrarNotificacion(cuotaId, clienteId, tipo, destinatario, estado, msg, err)
├── procesarNotificaciones() → loop principal con contadores exitosos/fallidos
├── iniciar() → registra cron job '0 8 * * *'
└── ejecutarManualmente() → para pruebas y endpoint admin
```

---

## Resumen del Flujo Completo

```
8:00 AM (cron) → procesarNotificaciones()
  ↓
obtenerCuotasProximasVencer()
  → cuotas que vencen en 2 días, sin notificación hoy, cliente activo con email
  ↓
Para cada cuota:
  → enviarRecordatorioCuota(cliente, cuota, empresa)
    → nodemailer.sendMail()
  → registrarNotificacion(... 'enviado' | 'fallido')
  → esperar 1 segundo (anti-spam SMTP)
  ↓
Log resumen: exitosos / fallidos / total
```
