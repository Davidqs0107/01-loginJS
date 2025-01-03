import { response } from "express";

export const validarRol = (...rolesPermitidos) => {
    return (req, res = response, next) => {
        const rol = req.rol;
        if (!rolesPermitidos.includes(rol)) {
            return res.status(403).json({
                ok: false,
                message: 'No tiene permisos para realizar esta acción',
            });
        }
        next();
    };
};
