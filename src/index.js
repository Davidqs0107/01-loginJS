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
const app = express();
const PORT = process.env.PORT;

//middlewares globales
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/empresa', empresaRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/prestamos', prestamosRouter);
app.use('/api/cuotas', cuotasRouter);
app.use('/api/pagos', pagosRouter);

//middleware para rutas no encontradas
app.use((req, res, next) => {
    res.status(404).json({
        ok: false,
        msg: "Ruta no encontrada",
    });
});
app.listen(PORT, () => {
    console.log(`Servicio levantado en el puerto: ${PORT}`);
});