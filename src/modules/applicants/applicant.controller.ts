import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';
import * as applicantService from './applicant.service';

// Un postulante solo accede a su propio perfil. A los demás se les responde
// como si no existiera, para que no se pueda recorrer la lista probando IDs.
function isOtherApplicant(req: AuthRequest, id: number) {
  return req.user?.tipo === 'POSTULANTE' && req.user.postulanteId !== id;
}

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

function notFound(res: Response) {
  return res.status(404).json({
    message: 'Postulante no encontrado',
  });
}

export async function getAll(_req: Request, res: Response) {
  try {
    const applicants = await applicantService.getAll();

    res.json(applicants);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener los postulantes',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    if (isOtherApplicant(req, id)) return notFound(res);

    const applicant = await applicantService.getById(id);

    res.json(applicant);
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener el postulante',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const applicant = await applicantService.create(req.body);

    res.status(201).json(applicant);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al crear el postulante',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    if (isOtherApplicant(req, id)) return notFound(res);

    const applicant = await applicantService.update(id, req.body);

    res.json(applicant);
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al actualizar el postulante',
    });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await applicantService.remove(id);

    res.status(204).send();
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al eliminar el postulante',
    });
  }
}
