import { userError, userRol } from "../constants/usuarios.constants.js";
import bcrypt from 'bcrypt';
import { executeTransaction } from "../helpers/transactionSql.js";
import { generarJWT } from "../helpers/jwt.js";
import { executeSelectOne } from "../helpers/queryS.js";
import { estadoEmpresaPlanes } from "../constants/empresa_planes.constanst.js";

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

            // Paso 3: Registrar el plan "prueba"
            const fechaInicio = new Date();
            const fechaFin = new Date(fechaInicio);
            fechaFin.setDate(fechaFin.getDate() + 7); // Sumar 7 días

            const insertPlanQuery = `
                INSERT INTO empresa_planes (empresa_id, plan_id, fecha_inicio, fecha_fin, estado)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`;
            const planPruebaId = 1; // Asume que el plan "prueba" tiene ID 1
            await client.query(insertPlanQuery, [
                idEmpresa,
                planPruebaId,
                fechaInicio,
                fechaFin,
                estadoEmpresaPlanes.activo,
            ]);
            const token = await generarJWT(usuarioResult.rows[0].id, userNombre, idEmpresa, userRol.admin, fechaFin, planPruebaId);
            return {
                empresa: { id: idEmpresa, nombre },
                usuario: { ...usuarioResult.rows[0], planPruebaId },
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
            SELECT u.id, u.nombre, u.email, u.password, u.empresa_id, u.rol,ep.fecha_fin ,ep.estado as "empresaEstado",u.estado
            , ep,plan_id
            FROM usuarios u join empresa_planes ep 
            on u.empresa_id = ep.empresa_id 
            WHERE email = $1`;
        const user = await executeSelectOne(query, [emailLowerCase]);
        if (user.length === 0) {
            throw new Error(userError.notFound);
        }
        if (user[0].empresaEstado === estadoEmpresaPlanes.inactivo) {
            throw new Error(userError.inactiveCompany);
        }
        const [usuario] = user;
        const validPassword = bcrypt.compareSync(password, usuario.password);
        if (!validPassword) {
            throw new Error(userError.incorrectPassword);
        }
        if (usuario.estado !== true) {
            throw new Error(userError.inactiveUser);
        }
        const token = await generarJWT(usuario.id, usuario.nombre, usuario.empresa_id, usuario.rol, usuario.fecha_fin, usuario.plan_id);
        return { ...usuario, token };

    } catch (error) {
        throw error; // Propagar errores conocidos
    }
}
