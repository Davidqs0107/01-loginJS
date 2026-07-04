import cron from 'node-cron';
import { getSuscripcionesService } from '../services/suscripcionService.js';

/**
 * Job diario que reporta las empresas con suscripción por vencer o vencida.
 * (Punto de extensión: aquí se podría enviar email/WhatsApp al admin de cada empresa.)
 */
class SuscripcionJob {
    constructor() {
        this.isRunning = false;
    }

    async procesar() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('\n🗓️  Revisando vencimientos de suscripción...');
        try {
            // pageSize alto: el job necesita todas para el reporte, no una sola página
            const porVencer = await getSuscripcionesService({ estado: 'por_vencer', pageSize: 1000 });
            const vencidas = await getSuscripcionesService({ estado: 'vencido', pageSize: 1000 });

            const totalPorVencer = porVencer.meta.totalItems;
            const totalVencidas = vencidas.meta.totalItems;

            if (totalPorVencer > 0) {
                console.log(`   ⚠️  ${totalPorVencer} suscripción(es) por vencer:`);
                porVencer.data.forEach((s) => console.log(`      - ${s.empresa_nombre} (empresa ${s.empresa_id}): vence en ${s.dias_restantes} día(s)`));
            }
            if (totalVencidas > 0) {
                console.log(`   🔴 ${totalVencidas} suscripción(es) vencida(s).`);
            }
            if (totalPorVencer === 0 && totalVencidas === 0) {
                console.log('   ✅ Todas las suscripciones vigentes.');
            }
        } catch (error) {
            console.error('❌ Error en el job de suscripción:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /** Programa la ejecución diaria a las 7:00 AM. */
    iniciar() {
        console.log('🚀 Iniciando cron job de suscripciones (diario 7:00 AM)');
        cron.schedule('0 7 * * *', async () => {
            await this.procesar();
        });
    }

    async ejecutarManualmente() {
        await this.procesar();
    }
}

const suscripcionJob = new SuscripcionJob();
export default suscripcionJob;
