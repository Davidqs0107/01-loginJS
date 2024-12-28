import { response } from "express"
import { userRol } from "../constants/usuarios.constants.js";

export const validarRol = (req, res = response, next) => {
    const rol = req.rol;
    if (rol !== userRol.admin) {
        return res.status(401).json({
            ok: false,
            message: 'no tiene permisos'
        });
    }
    next();
}
