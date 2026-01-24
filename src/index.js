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
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';

// Cálculo de __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar job de notificaciones
import notificacionesCuotasJob from './jobs/notificacionesCuotasJob.js';
import { verificarConfiguracion } from './services/emailService.js';

const app = express();
const PORT = process.env.PORT;

//middlewares globales
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 5 * 1024 * 1024 },
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
//middleware para rutas no encontradas
app.use((req, res, next) => {
    res.status(404).json({
        ok: false,
        msg: "Ruta no encontrada",
    });
});
app.listen(PORT, async () => {
    console.log(`Servicio levantado en el puerto: ${PORT}`);

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