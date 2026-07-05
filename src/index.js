import express from 'express';
import 'dotenv/config'
import cors from 'cors';
import authRouter from './routes/authRoutes.js'
import userRouter from './routes/userRoute.js'
import empresaRouter from './routes/empresaRoutes.js'
import clientesRouter from './routes/clientesRoutes.js';
import prestamosRouter from './routes/prestamosRoutes.js';
import cuotasRouter from './routes/cuotasRoutes.js';
import pagosRouter from './routes/pagosRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import descargoRouter from './routes/descargoRoutes.js';
import reportesRouter from './routes/reportesRoutes.js';
import configuracionRouter from './routes/configuracionRoutes.js';
import auditoriaRouter from './routes/auditoriaRoutes.js';
import arqueoRouter from './routes/arqueoRoutes.js';
import portalRouter from './routes/portalRoutes.js';
import comprobanteRouter from './routes/comprobanteRoutes.js';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';

// Cálculo de __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar jobs
import notificacionesCuotasJob from './jobs/notificacionesCuotasJob.js';
import incumplimientoJob from './jobs/incumplimientoJob.js';
import suscripcionJob from './jobs/suscripcionJob.js';
import { verificarConfiguracion } from './services/emailService.js';

const app = express();
const PORT = process.env.PORT;

//middlewares globales
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 1 * 1024 * 1024 },
}));
app.use('/api/uploads', express.static('uploads'));
//rutas
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);
app.use('/api/empresa', empresaRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/prestamos', prestamosRouter);
app.use('/api/cuotas', cuotasRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/descargos', descargoRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/configuracion', configuracionRouter);
app.use('/api/auditoria', auditoriaRouter);
app.use('/api/arqueos', arqueoRouter);
app.use('/api/portal', portalRouter);
app.use('/api/comprobantes', comprobanteRouter);
//middleware para rutas no encontradas
app.use((req, res, next) => {
    res.status(404).json({
        ok: false,
        msg: "Ruta no encontrada",
    });
});

// Middleware global de manejo de errores (captura throws síncronos y next(err))
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Error no controlado en request:', err);
    if (res.headersSent) return next(err);
    // express-fileupload lanza esto cuando el archivo supera limits.fileSize
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            ok: false,
            msg: 'La imagen o documento es demasiado grande. Máximo 1 MB.',
        });
    }
    // Otros errores de body parser (JSON malformado, body demasiado grande)
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({
            ok: false,
            msg: 'La solicitud es demasiado grande.',
        });
    }
    res.status(500).json({
        ok: false,
        msg: "Error interno del servidor",
    });
});

// Red de seguridad a nivel de proceso: registrar en vez de tumbar el servidor
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
app.listen(PORT, async () => {
    console.log(`Servicio levantado en el puerto: ${PORT}`);

    // Jobs que no dependen del email
    incumplimientoJob.iniciar();
    suscripcionJob.iniciar();

    // Verificar configuración de email
    console.log('\n📧 Verificando configuración de email...');
    const emailConfigOk = await verificarConfiguracion();

    if (emailConfigOk) {
        // Iniciar cron job de notificaciones
        notificacionesCuotasJob.iniciar();
    } else {
        console.log('⚠️ No se pudo iniciar el sistema de notificaciones por email');
        console.log('⚠️ Verifica las variables de entorno de configuración de email');
    }
});