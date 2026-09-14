import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import * as applicantService from './applicant.service';

// Un postulante solo accede a su propio perfil. A los demás se les responde
// como si no existiera, para que no se pueda recorrer la lista probando IDs.
function isOtherApplicant(req: AuthRequest, id: number) {
  return req.user?.tipo === 'POSTULANTE' && req.user.postulanteId !== id;
}

export async function getAll(_req: Request, res: Response) {
  try {
    const applicants = await applicantService.getAll();

    res.json(applicants);
  } catch {
    res.status(500).json({
      message: 'Error al obtener los postulantes',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    if (isOtherApplicant(req, id)) {
      return res.status(404).json({
        message: 'Postulante no encontrado',
      });
    }

    const applicant = await applicantService.getById(id);

    res.json(applicant);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al obtener el postulante',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const applicant = await applicantService.create(req.body);

    res.status(201).json(applicant);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear el postulante',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    if (isOtherApplicant(req, id)) {
      return res.status(404).json({
        message: 'Postulante no encontrado',
      });
    }

    const applicant = await applicantService.update(id, req.body);

    res.json(applicant);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al actualizar el postulante',
    });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    await applicantService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al eliminar el postulante',
    });
  }
}
