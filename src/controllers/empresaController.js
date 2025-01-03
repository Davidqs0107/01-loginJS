import { response } from 'express';
import { getEmpresaByIdService, getSummaryCobradorService, getSummaryService, updateEmpresaService } from '../services/empresaServices.js';

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