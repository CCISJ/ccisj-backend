import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { HttpError, statusFor } from '@/utils/http-error';
import { parseId } from '@/utils/params';
import * as offerService from './offer.service';

// Las validaciones del service lanzan HttpError con un mensaje pensado para
// el usuario. Cualquier otro error es inesperado: no se reenvía su mensaje,
// que puede traer detalles internos de la base.
function sendError(res: Response, error: unknown, fallback: string) {
  res.status(statusFor(error, 500)).json({
    message: error instanceof HttpError ? error.message : fallback,
  });
}

function invalidId(res: Response) {
  return res.status(400).json({
    message: 'ID inválido',
  });
}

export async function getAll(_req: Request, res: Response) {
  try {
    const offers = await offerService.getAll();

    res.json(offers);
  } catch (error) {
    sendError(res, error, 'Error al obtener las ofertas');
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const offer = await offerService.getById(id);

    res.json(offer);
  } catch (error) {
    sendError(res, error, 'Error al obtener la oferta');
  }
}

export async function getMine(req: AuthRequest, res: Response) {
  try {
    const offers = await offerService.getMine(req.user!);

    res.json(offers);
  } catch (error) {
    sendError(res, error, 'Error al obtener las ofertas');
  }
}

export async function getMineById(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const offer = await offerService.getMineById(id, req.user!);

    res.json(offer);
  } catch (error) {
    sendError(res, error, 'Error al obtener la oferta');
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const offer = await offerService.create(req.body, req.user!);

    res.status(201).json(offer);
  } catch (error) {
    sendError(res, error, 'Error al crear la oferta');
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    const offer = await offerService.update(id, req.body, req.user!);

    res.json(offer);
  } catch (error) {
    sendError(res, error, 'Error al actualizar la oferta');
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const id = parseId(req.params.id);

    if (!id) return invalidId(res);

    await offerService.remove(id, req.user!);

    res.status(204).send();
  } catch (error) {
    sendError(res, error, 'Error al eliminar la oferta');
  }
}
