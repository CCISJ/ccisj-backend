import type { Response } from 'express';

import type { AuthRequest } from '@/middlewares/auth.middleware';
import { HttpError } from '@/utils/http-error';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';

import * as cvService from './cv.service';

/** El postulante de la sesión. Las rutas ya exigen el rol POSTULANTE. */
function ownApplicantId(req: AuthRequest) {
  const id = req.user?.postulanteId;

  if (!id) {
    throw new HttpError(404, 'Postulante no encontrado');
  }

  return id;
}

function cvIdParam(req: AuthRequest) {
  const id = parseId(req.params.cvId);

  if (!id) {
    throw new HttpError(400, 'ID inválido');
  }

  return id;
}

export async function getMyCv(req: AuthRequest, res: Response) {
  try {
    res.json(await cvService.getCv(ownApplicantId(req)));
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al obtener el CV' });
  }
}

export async function saveMyCv(req: AuthRequest, res: Response) {
  try {
    res.json(await cvService.saveCv(ownApplicantId(req), req.body));
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al guardar el CV' });
  }
}

export async function saveMyProfile(req: AuthRequest, res: Response) {
  try {
    res.json(await cvService.saveProfile(ownApplicantId(req), req.body));
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al guardar el perfil',
    });
  }
}

export async function uploadMyCvFiles(req: AuthRequest, res: Response) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];

    const created = await cvService.uploadFiles(ownApplicantId(req), files);

    res.status(201).json(created);
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al subir el CV' });
  }
}

export async function getMyCvFileUrl(req: AuthRequest, res: Response) {
  try {
    res.json(await cvService.getFileUrl(ownApplicantId(req), cvIdParam(req)));
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al obtener el CV' });
  }
}

export async function deleteMyCvFile(req: AuthRequest, res: Response) {
  try {
    await cvService.deleteFile(ownApplicantId(req), cvIdParam(req));

    res.status(204).send();
  } catch (error) {
    sendError(res, error, { status: 400, message: 'Error al eliminar el CV' });
  }
}
