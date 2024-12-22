import { Router } from "express";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { getEmpresaById, updateEmpresa } from "../controllers/empresaController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
const route = Router();
route.use(validarJWT);

route.get('/', getEmpresaById);

route.put('/', updateEmpresa);
export default route;