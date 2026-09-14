import type { Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { HttpError, statusFor } from '@/utils/http-error';
import { parseId } from '@/utils/params';
import * as memberService from './member.service';

export async function getAll(req: AuthRequest, res: Response) {
  try {
    const members =
      req.user?.tipo === 'ADMIN'
        ? await memberService.getAll()
        : await memberService.getDirectory();

    res.json(members);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener los socios',
    });
  }
}

export async function getById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const member =
      req.user?.tipo === 'ADMIN'
        ? await memberService.getById(id)
        : await memberService.getDirectoryEntry(id);

    res.json(member);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al obtener el socio',
    });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const member = await memberService.getOwnProfile(req.user!.socioId);

    res.json(member);
  } catch (error) {
    res.status(statusFor(error, 500)).json({
      message:
        error instanceof HttpError
          ? error.message
          : 'Error al obtener los datos de la empresa',
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
    res.status(statusFor(error, 500)).json({
      message:
        error instanceof HttpError
          ? error.message
          : 'Error al actualizar los datos de la empresa',
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
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear el socio',
    });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const member = await memberService.update(id, req.body);

    return res.status(200).json(member);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al actualizar socio';

    if (message === 'Socio no encontrado') {
      return res.status(404).json({
        message,
      });
    }

    return res.status(400).json({
      message,
    });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    await memberService.remove(id);

    return res.status(200).json({
      message: 'Socio desactivado correctamente',
    });
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar el socio',
    });
  }
}
