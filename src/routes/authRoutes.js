import { Router } from "express";
import { login, registerEmpresaUsuario } from "../controllers/authController.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
const route = Router();

route.post('/login', [
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validarCampos
], login);
route.post('/register', [
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validarCampos
], registerEmpresaUsuario);
export default route;