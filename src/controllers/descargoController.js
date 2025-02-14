import { estadoDescargo, tipoPago } from "../constants/commons.constans.js";
import { formatDateWithDateFns } from "../helpers/functions.js";
import { aprobarDescargoService, crearDescargoService, getDescargosServices, getDescargosServicesByUser } from "../services/descargoService.js";

export const getDescargos = async (req, res) => {
    const fecha = formatDateWithDateFns(new Date());
    const { page = 1, pageSize = 10, fecha_inicio = fecha, fecha_fin = fecha, searchTerm } = req.query;
    const { empresa_id } = req; // ID de la empresa desde el middleware
    try {
        const result = await getDescargosServices({ page, pageSize, empresa_id, fecha_inicio, fecha_fin, searchTerm });
        return res.status(200).json({
            ok: true,
            descargos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        res.status(500).json({ msg: error });
    }
};
export const getDescargosByUser = async (req, res) => {
    const fecha = formatDateWithDateFns(new Date());
    const { page = 1, pageSize = 10, fecha_inicio = fecha, fecha_fin = fecha } = req.query;
    const { empresa_id, id } = req; // ID de la empresa desde el middleware
    try {
        const result = await getDescargosServicesByUser({ page, pageSize, empresa_id, id, fecha_inicio, fecha_fin });
        return res.status(200).json({
            ok: true,
            descargos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        res.status(500).json({ msg: error });
    }
};
export const crearDescargo = async (req, res) => {
    const dateNow = formatDateWithDateFns(new Date());

    const { empresa_id, id: usuario_id } = req;
    const { nota, fecha = dateNow, monto, tipo_pago = tipoPago.efectivo } = req.body;
    try {
        if (tipo_pago !== tipoPago.efectivo && tipo_pago !== tipoPago.qr) {
            return res.status(400).json({
                ok: false,
                msg: 'Tipo de pago no válido',
            });
        }
        const result = await crearDescargoService({ empresa_id, usuario_id, nota, fecha, monto, tipo_pago });
        // Lógica de creación de descargo
        return res.status(201).json({
            ok: true,
            descargo: result,
        });
    } catch (error) {
        res.status(500).json({ msg: error });
    }
}

export const aprobarDescargo = async (req, res) => {
    const { id, estado = estadoDescargo.aprobado } = req.body;
    try {
        // Lógica de aprobación de descargo
        const result = await aprobarDescargoService({ id, estado });
        return res.status(200).json({
            ok: true,
            descargo: result,
        });
    } catch (error) {
        res.status(500).json({ msg: error });
    }
}
export const actualizarDescargo = async (req, res) => {
    const { empresa_id, id: usuario_id } = req;
    const { id, nota, fecha, monto, tipo_pago } = req.body;
    try {
        // Lógica de actualización de descargo
        return res.status(200).json({
            ok: true,
            msg: 'Descargo actualizado',
        });
    } catch (error) {
        res.status(500).json({ msg: error });
    }
}