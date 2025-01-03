import { response } from "express"
import { loginService, registrarEmpresaUsuarioService } from "../services/authServices.js";
import { userError } from "../constants/usuarios.constants.js";
import { generarJWT } from "../helpers/jwt.js";

export const login = async (req, res = response) => {
    const { email, password } = req.body;
    try {
        const user = await loginService({ email, password });
        if (!user) {
            return res.status(400).json({
                ok: false,
                msg: "Usuario o contraseña incorrectos",
            });
        }
        return res.status(200).json({
            ok: true,
            usuario: user
        });
    } catch (error) {
        if (error.message === userError.notFound || error.message === userError.incorrectPassword || error.message === userError.inactiveUser || error.message === userError.inactiveCompany) {
            return res.status(400).json({
                ok: false,
                msg: error.message,
            });
        }

        console.error('Error inesperado en login:', error);
        return res.status(500).json({
            ok: false,
            msg: "Error al iniciar sesión. Contacte al administrador.",
        });

    }

}

export const registerEmpresaUsuario = async (req, res) => {
    const { empresa, nombre: userNombre, email, password } = req.body; // Datos enviados desde el cliente
    const { nombre } = empresa;
    const emailLowerCase = email.toLowerCase();
    try {
        const { empresa, usuario, token } = await registrarEmpresaUsuarioService({ nombre, email: emailLowerCase, password, userNombre });

        res.status(201).json({
            ok: true,
            msg: "Empresa y usuario creados con éxito",
            usuario: { ...usuario, token },
        });
    } catch (error) {
        if (error.message === userError.emailInUse) {
            return res.status(400).json({
                ok: false,
                msg: error.message,
            });
        }
        res.status(500).json({
            ok: false,
            msg: error.message || "Error al registrar empresa y usuario. Contacte al administrador.",
        });
    }
};

export const renewToken = async (req, res = response) => {
    const { id, name, empresa_id, rol, fecha_fin } = req
    const token = await generarJWT(id, name, empresa_id, rol, fecha_fin);
    res.json({
        ok: true,
        id,
        name,
        empresa_id,
        rol,
        token
    });
}