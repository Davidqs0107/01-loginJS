import { userError, userRol } from "../constants/usuarios.constants.js";
import bcrypt from 'bcrypt';
import { executeTransaction } from "../helpers/transactionSql.js";
import { generarJWT } from "../helpers/jwt.js";
import { executeSelectOne } from "../helpers/queryS.js";

export const registrarEmpresaUsuarioService = async (data) => {
    try {
        const { nombre, email, password, userNombre } = data;
        const emailLowerCase = email.toLowerCase();
        const query = `SELECT id FROM usuarios WHERE email = $1`;
        const user = await executeSelectOne(query, [emailLowerCase]);
        if (user.length > 0) {
            throw new Error(userError.emailInUse);
        }
        return await executeTransaction(async (client) => {
            // Paso 1: Crear la empresa
            const insertEmpresaQuery = `
                       INSERT INTO empresas (nombre)
                       VALUES ($1)
                       RETURNING id`;
            const empresaResult = await client.query(insertEmpresaQuery, [nombre]);
            const idEmpresa = empresaResult.rows[0].id;
            // Paso 2: Crear el usuario
            const hashedPassword = bcrypt.hashSync(password, 10);
            const insertUsuarioQuery = `
                       INSERT INTO usuarios (empresa_id, rol, nombre, email, password)
                       VALUES ($1, $2, $3, $4, $5)
                       RETURNING *`;
            const usuarioResult = await client.query(insertUsuarioQuery, [
                idEmpresa,
                userRol.admin,
                userNombre,
                emailLowerCase,
                hashedPassword,
            ]);
            const token = await generarJWT(usuarioResult.rows[0].id, userNombre, idEmpresa, userRol.admin);
            return {
                empresa: { id: idEmpresa, nombre },
                usuario: usuarioResult.rows[0],
                token
            };
        });

    } catch (error) {
        throw error;
    }
}

export const loginService = async (data) => {
    try {
        const { email, password } = data;
        const emailLowerCase = email.toLowerCase();
        const query = `
            SELECT id, nombre, email, password, empresa_id, rol
            FROM usuarios
            WHERE email = $1`;
        const user = await executeSelectOne(query, [emailLowerCase]);
        if (user.length === 0) {
            throw new Error(userError.notFound);
        }
        const [usuario] = user;
        const validPassword = bcrypt.compareSync(password, usuario.password);
        if (!validPassword) {
            throw new Error(userError.incorrectPassword);
        }
        const token = await generarJWT(usuario.id, usuario.nombre, usuario.empresa_id, usuario.rol);
        return { ...usuario, token };

    } catch (error) {
        throw error; // Propagar errores conocidos
    }
}
