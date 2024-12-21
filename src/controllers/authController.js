import { response } from "express"
import { loginService, registrarEmpresaUsuarioService } from "../services/authServices.js";
import { userError } from "../constants/usuarios.constants.js";

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
        if (error.message === userError.notFound || error.message === userError.incorrectPassword) {
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
    const { empresa, usuario } = req.body; // Datos enviados desde el cliente
    const { nombre } = empresa;
    const { nombre: userNombre, email, password } = usuario;
    const emailLowerCase = email.toLowerCase();
    try {
        const result = await registrarEmpresaUsuarioService({ nombre, email: emailLowerCase, password, userNombre });

        res.status(201).json({
            ok: true,
            msg: "Empresa y usuario creados con éxito",
            data: result,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error.message || "Error al registrar empresa y usuario. Contacte al administrador.",
        });
    }
};