import pkg from 'nodemailer';
const { createTransport } = pkg;

/**
 * Configuración del transportador de email
 * Soporta Gmail, Outlook, y SMTP personalizado
 */
const createTransporter = () => {
    // Configuración según el proveedor
    const emailConfig = {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true para 465, false para otros puertos
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD, // Para Gmail usar App Password
        },
    };

    return createTransport(emailConfig);
};

/**
 * Enviar recordatorio de cuota por email
 * @param {Object} cliente - Datos del cliente
 * @param {Object} cuota - Datos de la cuota
 * @param {Object} empresa - Datos de la empresa
 * @returns {Promise<Object>} Resultado del envío
 */
const enviarRecordatorioCuota = async (cliente, cuota, empresa) => {
    try {
        const transporter = createTransporter();

        // Formatear fecha
        const fechaPago = new Date(cuota.fecha_pago);
        const fechaFormateada = fechaPago.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const mailOptions = {
            from: `"${empresa.nombre}" <${process.env.EMAIL_USER}>`,
            to: cliente.email,
            subject: `Recordatorio: Cuota #${cuota.numero_cuota} próxima a vencer`,
            html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .cuota-info { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4CAF50; }
            .cuota-info p { margin: 8px 0; }
            .monto { font-size: 24px; font-weight: bold; color: #4CAF50; }
            .footer { background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
            .warning { color: #ff9800; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Recordatorio de Cuota</h1>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${cliente.nombre} ${cliente.apellido}</strong>,</p>
              
              <p>Le recordamos amablemente que tiene una cuota próxima a vencer:</p>
              
              <div class="cuota-info">
                <p><strong>📝 Cuota #${cuota.numero_cuota}</strong></p>
                <p><strong>💰 Monto:</strong> <span class="monto">$${parseFloat(cuota.monto).toFixed(2)}</span></p>
                <p><strong>📅 Fecha de vencimiento:</strong> ${fechaFormateada}</p>
                <p><strong>💳 Monto pagado:</strong> $${parseFloat(cuota.monto_pagado || 0).toFixed(2)}</p>
                <p><strong>💵 Saldo pendiente:</strong> $${parseFloat(cuota.monto - (cuota.monto_pagado || 0)).toFixed(2)}</p>
              </div>
              
              <p class="warning">⚠️ Esta cuota vence en 2 días</p>
              
              <p>Para realizar su pago, puede contactarnos a través de:</p>
              <ul>
                ${empresa.telefono ? `<li>📞 Teléfono: ${empresa.telefono}</li>` : ''}
                ${empresa.direccion ? `<li>📍 Dirección: ${empresa.direccion}</li>` : ''}
              </ul>
              
              <p>Gracias por su confianza y puntualidad.</p>
              
              <p>Saludos cordiales,<br><strong>${empresa.nombre}</strong></p>
            </div>
            <div class="footer">
              <p>Este es un mensaje automático, por favor no responda a este correo.</p>
              <p>Si tiene alguna consulta, comuníquese con nosotros directamente.</p>
            </div>
          </div>
        </body>
        </html>
      `,
            // Versión texto plano como alternativa
            text: `
Estimado/a ${cliente.nombre} ${cliente.apellido},

Le recordamos que tiene una cuota próxima a vencer:

Cuota #${cuota.numero_cuota}
Monto: $${parseFloat(cuota.monto).toFixed(2)}
Fecha de vencimiento: ${fechaFormateada}
Saldo pendiente: $${parseFloat(cuota.monto - (cuota.monto_pagado || 0)).toFixed(2)}

⚠️ Esta cuota vence en 2 días

Gracias por su confianza.

Saludos,
${empresa.nombre}
      `.trim(),
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ Email enviado a ${cliente.email}: ${info.messageId}`);

        return {
            success: true,
            messageId: info.messageId,
            destinatario: cliente.email,
        };
    } catch (error) {
        console.error(`❌ Error enviando email a ${cliente.email}:`, error.message);
        return {
            success: false,
            error: error.message,
            destinatario: cliente.email,
        };
    }
};

/**
 * Verificar configuración de email
 * @returns {Promise<boolean>}
 */
const verificarConfiguracion = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Configuración de email verificada correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error en configuración de email:', error.message);
        return false;
    }
};

/**
 * Enviar email genérico
 * @param {string} to - Destinatario
 * @param {string} subject - Asunto
 * @param {string} html - Contenido HTML
 * @param {string} text - Contenido texto plano
 * @returns {Promise<Object>}
 */
const enviarEmail = async (to, subject, html, text = '') => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML si no hay texto
        };

        const info = await transporter.sendMail(mailOptions);

        return {
            success: true,
            messageId: info.messageId,
            destinatario: to,
        };
    } catch (error) {
        console.error(`Error enviando email a ${to}:`, error.message);
        return {
            success: false,
            error: error.message,
            destinatario: to,
        };
    }
};

export {
    enviarRecordatorioCuota,
    verificarConfiguracion,
    enviarEmail
};
