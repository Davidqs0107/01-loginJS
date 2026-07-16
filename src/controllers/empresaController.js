import { response } from 'express';
import { getEmpresaByIdService, getSummaryCobradorService, getSummaryService, updateEmpresaService } from '../services/empresaServices.js';
import { getSuscripcionEstadoService } from '../services/suscripcionService.js';
import { normalizarPhoneCode } from '../helpers/phoneCode.js';

export const getSuscripcion = async (req, res = response) => {
    try {
        const suscripcion = await getSuscripcionEstadoService(req.empresa_id);
        res.status(200).json({ ok: true, suscripcion });
    } catch (error) {
        console.error('Error en getSuscripcion:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener la suscripción.' });
    }
};

export const getEmpresaById = async (req, res = response) => {
    const empresaId = req.empresa_id;
    try {
        const empresa = await getEmpresaByIdService(empresaId);
        res.status(200).json({
            ok: true,
            empresa,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error,
        });
    }
};
export const getSummary = async (req, res = response) => {
    const empresaId = req.empresa_id;
    try {
        const empresa = await getSummaryService(empresaId);
        res.status(200).json({
            ok: true,
            empresa,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error,
        });
    }
};

export const getSummaryCobrador = async (req, res = response) => {
    const id = req.id;
    try {
        const empresa = await getSummaryCobradorService(id);
        res.status(200).json({
            ok: true,
            empresa,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error,
        });
    }
};
export const updateEmpresa = async (req, res = response) => {
    const empresaId = req.empresa_id;
    const data = req.body;
    try {
        if (data.codigo_pais !== undefined) {
            data.codigo_pais = normalizarPhoneCode(data.codigo_pais);
        }
        const updatedEmpresa = await updateEmpresaService(empresaId, data);
        return res.status(200).json({
            ok: true,
            empresa: updatedEmpresa,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error,
        });
    }
};