import { Router } from "express";
import { login, registerEmpresaUsuario, renewToken } from "../controllers/authController.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { validarJWT } from "../middlewares/validar-jwt.js";
const route = Router();

route.post('/login', [
    check('email', 'Este email debe ser valido').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    check('password', 'El password debe contener minimo 6 caracteres').isLength({ min: 6 }),
    validarCampos
], login);
route.post('/register', [
    check('email', 'Este email debe ser valido').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    check('password', 'El password debe contener minimo 6 caracteres').isLength({ min: 6 }),
    validarCampos
], registerEmpresaUsuario);

route.get('/renew',
    [
        validarJWT,
    ],
    renewToken);
export default route;