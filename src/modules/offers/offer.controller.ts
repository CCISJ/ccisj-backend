import type { Request, Response } from 'express';
import * as offerService from './offer.service';

export async function getAll(_req: Request, res: Response) {
  try {
    const offers = await offerService.getAll();

    res.json(offers);
  } catch {
    res.status(500).json({
      message: 'Error al obtener las ofertas',
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const offer = await offerService.getById(id);

    res.json(offer);
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al obtener la oferta',
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const offer = await offerService.create(req.body);

    res.status(201).json(offer);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : 'Error al crear la oferta',
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: 'ID inválido',
      });
    }

    const offer = await offerService.update(id, req.body);

    res.json(offer);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Error al actualizar la oferta',
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

    await offerService.remove(id);

    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      message:
        error instanceof Error ? error.message : 'Error al eliminar la oferta',
    });
  }
}
