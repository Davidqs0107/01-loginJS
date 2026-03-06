import cron from 'node-cron';
import { pool } from '../db.js';
import { enviarRecordatorioCuota } from '../services/emailService.js';

/**
 * Job que se ejecuta diariamente para enviar recordatorios de cuotas
 * Busca cuotas que vencen en 2 días y aún no tienen notificación enviada
 */
class NotificacionesCuotasJob {
    constructor() {
        this.isRunning = false;
    }

    /**
     * Obtener cuotas próximas a vencer (2 días antes)
     */
    async obtenerCuotasProximasVencer() {
        const query = `
      SELECT DISTINCT ON (cl.id, cu.id)
        cu.id as cuota_id,
        cu.numero_cuota,
        cu.fecha_pago,
        cu.monto,
        cu.monto_pagado,
        cu.estado,
        cl.id as cliente_id,
        cl.nombre as cliente_nombre,
        cl.apellido as cliente_apellido,
        cl.email as cliente_email,
        cl.telefono as cliente_telefono,
        e.id as empresa_id,
        e.nombre as empresa_nombre,
        e.telefono as empresa_telefono,
        e.direccion as empresa_direccion,
        p.id as prestamo_id
      FROM cuotas cu
      INNER JOIN prestamos p ON cu.prestamo_id = p.id
      INNER JOIN clientes cl ON p.cliente_id = cl.id
      INNER JOIN empresas e ON p.empresa_id = e.id
      WHERE 
        cu.estado IN ('pendiente', 'parcial')
        AND cu.fecha_pago::date = (CURRENT_DATE + INTERVAL '2 days')::date
        AND cl.estado = true
        AND cl.email IS NOT NULL
        AND cl.email != ''
        AND NOT EXISTS (
          SELECT 1 
          FROM notificaciones_enviadas ne
          WHERE ne.cuota_id = cu.id
            AND ne.tipo = 'email'
            AND ne.estado = 'enviado'
            AND ne.fecha_envio::date = CURRENT_DATE
        )
      ORDER BY cl.id, cu.id, cu.fecha_pago
    `;

        try {
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('Error obteniendo cuotas próximas a vencer:', error);
            throw error;
        }
    }

    /**
     * Registrar notificación enviada en la base de datos
     */
    async registrarNotificacion(cuotaId, clienteId, tipo, destinatario, estado, mensaje = null, errorMensaje = null) {
        const query = `
      INSERT INTO notificaciones_enviadas 
        (cuota_id, cliente_id, tipo, destinatario, estado, mensaje, error_mensaje)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

        try {
            const result = await pool.query(query, [
                cuotaId,
                clienteId,
                tipo,
                destinatario,
                estado,
                mensaje,
                errorMensaje,
            ]);
            return result.rows[0];
        } catch (error) {
            console.error('Error registrando notificación:', error);
            throw error;
        }
    }

    /**
     * Procesar y enviar notificaciones
     */
    async procesarNotificaciones() {
        if (this.isRunning) {
            console.log('⚠️ El job ya está en ejecución, saltando...');
            return;
        }

        this.isRunning = true;
        console.log('\n🔔 Iniciando proceso de notificaciones de cuotas...');
        console.log(`📅 Fecha: ${new Date().toLocaleString('es-ES')}`);

        try {
            // Obtener cuotas próximas a vencer
            const cuotas = await this.obtenerCuotasProximasVencer();

            if (cuotas.length === 0) {
                console.log('✅ No hay cuotas próximas a vencer (2 días)');
                return;
            }

            console.log(`📋 Encontradas ${cuotas.length} cuotas próximas a vencer\n`);

            let exitosos = 0;
            let fallidos = 0;

            // Procesar cada cuota
            for (const cuota of cuotas) {
                try {
                    console.log(`📧 Enviando notificación a: ${cuota.cliente_email}`);
                    console.log(`   Cliente: ${cuota.cliente_nombre} ${cuota.cliente_apellido}`);
                    console.log(`   Cuota #${cuota.numero_cuota} - Monto: $${cuota.monto}`);

                    // Preparar datos para el email
                    const cliente = {
                        id: cuota.cliente_id,
                        nombre: cuota.cliente_nombre,
                        apellido: cuota.cliente_apellido,
                        email: cuota.cliente_email,
                        telefono: cuota.cliente_telefono,
                    };

                    const cuotaData = {
                        id: cuota.cuota_id,
                        numero_cuota: cuota.numero_cuota,
                        fecha_pago: cuota.fecha_pago,
                        monto: cuota.monto,
                        monto_pagado: cuota.monto_pagado || 0,
                        estado: cuota.estado,
                    };

                    const empresa = {
                        id: cuota.empresa_id,
                        nombre: cuota.empresa_nombre,
                        telefono: cuota.empresa_telefono,
                        direccion: cuota.empresa_direccion,
                    };

                    // Enviar email
                    const resultado = await enviarRecordatorioCuota(cliente, cuotaData, empresa);

                    // Registrar en base de datos
                    if (resultado.success) {
                        await this.registrarNotificacion(
                            cuota.cuota_id,
                            cuota.cliente_id,
                            'email',
                            cuota.cliente_email,
                            'enviado',
                            `Recordatorio cuota #${cuota.numero_cuota}`,
                            null
                        );
                        exitosos++;
                        console.log(`   ✅ Enviado exitosamente\n`);
                    } else {
                        await this.registrarNotificacion(
                            cuota.cuota_id,
                            cuota.cliente_id,
                            'email',
                            cuota.cliente_email,
                            'fallido',
                            null,
                            resultado.error
                        );
                        fallidos++;
                        console.log(`   ❌ Error: ${resultado.error}\n`);
                    }

                    // Pequeña pausa entre envíos para no saturar el servidor SMTP
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`❌ Error procesando cuota ${cuota.cuota_id}:`, error.message);
                    fallidos++;

                    // Intentar registrar el error
                    try {
                        await this.registrarNotificacion(
                            cuota.cuota_id,
                            cuota.cliente_id,
                            'email',
                            cuota.cliente_email,
                            'fallido',
                            null,
                            error.message
                        );
                    } catch (regError) {
                        console.error('Error registrando fallo:', regError.message);
                    }
                }
            }

            // Resumen
            console.log('\n📊 Resumen de ejecución:');
            console.log(`   ✅ Exitosos: ${exitosos}`);
            console.log(`   ❌ Fallidos: ${fallidos}`);
            console.log(`   📧 Total procesados: ${cuotas.length}`);
            console.log(`   🕐 Fin: ${new Date().toLocaleString('es-ES')}\n`);

        } catch (error) {
            console.error('❌ Error en el proceso de notificaciones:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Inicializar el cron job
     * Ejecuta todos los días a las 8:00 AM
     */
    iniciar() {
        console.log('🚀 Iniciando cron job de notificaciones de cuotas');
        console.log('⏰ Programado para ejecutarse diariamente a las 8:00 AM');

        // Programar para las 8:00 AM todos los días
        // Formato: segundo minuto hora dia mes día_semana
        // 0 8 * * * = A las 8:00 AM todos los días
        cron.schedule('0 8 * * *', async () => {
            await this.procesarNotificaciones();
        });

        console.log('✅ Cron job iniciado correctamente\n');
    }

    /**
     * Ejecutar manualmente (útil para pruebas)
     */
    async ejecutarManualmente() {
        console.log('🔧 Ejecutando job manualmente...\n');
        await this.procesarNotificaciones();
    }
}

// Crear instancia del job
const notificacionesCuotasJob = new NotificacionesCuotasJob();

export default notificacionesCuotasJob;
