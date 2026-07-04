import cron from 'node-cron';
import { marcarPrestamosIncumplidosService } from '../services/incumplimientoService.js';

/**
 * Job diario que marca como 'incumplido' los préstamos con atraso mayor al
 * umbral configurado por cada empresa (configuracion_empresa.incumplido_dias).
 */
class IncumplimientoJob {
    constructor() {
        this.isRunning = false;
    }

    async procesar() {
        if (this.isRunning) {
            console.log('⚠️ El job de incumplimiento ya está en ejecución, saltando...');
            return;
        }
        this.isRunning = true;
        console.log('\n⚖️  Revisando préstamos incumplidos...');
        try {
            const { afectados, ids } = await marcarPrestamosIncumplidosService();
            if (afectados > 0) {
                console.log(`   🔴 ${afectados} préstamo(s) marcados como incumplidos: [${ids.join(', ')}]`);
            } else {
                console.log('   ✅ Sin nuevos incumplimientos.');
            }
        } catch (error) {
            console.error('❌ Error en el job de incumplimiento:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Programa la ejecución diaria a las 6:00 AM (antes del job de notificaciones).
     */
    iniciar() {
        console.log('🚀 Iniciando cron job de incumplimiento (diario 6:00 AM)');
        cron.schedule('0 6 * * *', async () => {
            await this.procesar();
        });
    }

    async ejecutarManualmente() {
        await this.procesar();
    }
}

const incumplimientoJob = new IncumplimientoJob();
export default incumplimientoJob;
