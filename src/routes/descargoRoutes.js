/*
/api/descargos
*/
import { Router } from "express";

import { validarJWT } from "../middlewares/validar-jwt.js";
import { aprobarDescargo, crearDescargo, getDescargos, getDescargosByUser } from "../controllers/descargoController.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { userRol } from "../constants/usuarios.constants.js";
import { validarRol } from "../middlewares/validar-rol.js";
const { admin } = userRol;

const route = Router();
route.use(validarJWT);


route.get('/', getDescargos);
route.get('/usuario', getDescargosByUser);
route.post('/', [
    check('monto', 'El monto es obligatorio').not().isEmpty(),
    check('tipo_pago', 'El tipo pago es obligatorio').not().isEmpty(),

    validarCampos
], crearDescargo);
route.put('/', [validarRol(admin)], aprobarDescargo);
export default route;
