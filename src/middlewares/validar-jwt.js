import { response } from "express"
import jwt from "jsonwebtoken";

export const validarJWT = (req, res = response, next) => {
    //x-token headers

    const token = req.header('x-token');
    if (!token) {
        return res.status(401).json({
            ok: false,
            message: 'no hay token en la peticion'
        });
    }
    try {
        const { id, name, empresa_id } = jwt.verify(
            token,
            process.env.JWT_SECRET
        );
        req.id = id;
        req.name = name;
        req.empresa_id = empresa_id;
    } catch (error) {
        return res.status(401).json({
            ok: false,
            message: 'no hay token valido'
        })
    }
    next();
}
