import type { Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { parseId } from '@/utils/params';
import { sendError } from '@/utils/send-error';
import * as memberService from './member.service';

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getAll(req: AuthRequest, res: Response) {
  try {
    const members =
      req.user?.tipo === 'ADMIN'
        ? await memberService.getAll()
        : await memberService.getDirectory();

    res.json(members);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener los socios',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const member =
      req.user?.tipo === 'ADMIN'
        ? await memberService.getById(id)
        : await memberService.getDirectoryEntry(id);

    res.json(member);
  } catch (error) {
    sendError(res, error, {
      status: 404,
      message: 'Error al obtener el socio',
    });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const member = await memberService.getOwnProfile(req.user!.socioId);

    res.json(member);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al obtener los datos de la empresa',
    });
  }
}

export async function updateMe(req: AuthRequest, res: Response) {
  try {
    const member = await memberService.updateOwnProfile(
      req.user!.socioId,
      req.body,
    );

    res.json(member);
  } catch (error) {
    sendError(res, error, {
      status: 500,
      message: 'Error al actualizar los datos de la empresa',
    });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const { socioId, email, passwordInicial } = await memberService.create(
      req.body,
    );

    res.status(201).json({
      message: 'Socio creado correctamente',
      socioId,
      email,
      passwordInicial,
    });
  } catch (error) {
    sendError(res, error, {
      status: 400,
      message: 'Error al crear el socio',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const member = await memberService.update(id, req.body);

    return res.status(200).json(member);
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al actualizar socio',
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await memberService.remove(id);

    return res.status(200).json({
      message: 'Socio desactivado correctamente',
    });
  } catch (error) {
    return sendError(res, error, {
      status: 400,
      message: 'Error al desactivar el socio',
    });
  }
}
