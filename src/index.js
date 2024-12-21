import express from 'express';
import 'dotenv/config'
import cors from 'cors';
import authRouter from './routes/authRoutes.js'
import userRouter from './routes/userRoute.js'
const app = express();
const PORT = process.env.PORT;
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.listen(PORT, () => {
    console.log(`Servicio levantado en el puerto: ${PORT}`);
});