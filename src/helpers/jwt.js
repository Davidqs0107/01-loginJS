import jwt from "jsonwebtoken";

export const generarJWT = (id, name, empresa_id) => {
    return new Promise((resolve, reject) => {
        const payload = { id, name, empresa_id };
        jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '24h'
        }, (err, token) => {
            if (err) {
                console.log(err);
                reject('No se pudo generar el token');
            }
            resolve(token);
        });
    })
}