import { Router } from "express";
import { getEmpresaById, getSummary, getSummaryCobrador, updateEmpresa } from "../controllers/empresaController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
const { superAdmin, admin } = userRol;

const route = Router();
route.use(validarJWT);

route.get('/', getEmpresaById);
route.get('/summary', getSummary);
route.get('/summary/cobrador', getSummaryCobrador);

route.put('/', [validarRol(superAdmin, admin)], updateEmpresa);
export default route;