import { Router } from "express";
import { getEmpresaById, getSummary, getSummaryCobrador, updateEmpresa } from "../controllers/empresaController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
const route = Router();
route.use(validarJWT);

route.get('/', getEmpresaById);
route.get('/summary', getSummary);
route.get('/summary/cobrador', getSummaryCobrador);

route.put('/', updateEmpresa);
export default route;