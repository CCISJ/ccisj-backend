import { HttpError } from '@/utils/http-error';
import * as categoryRepository from './category.repository';

// Los mismos largos que la base (`VarChar(100)` y `VarChar(255)`): pasarse
// terminaba en un error de Prisma en vez de un mensaje claro.
const NAME_MAX = 100;
const DESCRIPTION_MAX = 255;

type CategoryChanges = {
  nombre?: string;
  descripcion?: string | null;
  activa?: boolean;
};

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
}

function parseName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'El nombre es obligatorio');
  }

  const nombre = value.trim();

  if (nombre.length > NAME_MAX) {
    throw new HttpError(
      400,
      `El nombre no puede superar los ${NAME_MAX} caracteres`,
    );
  }

  return nombre;
}

function parseDescription(value: unknown) {
  if (value === null) return null;

  if (typeof value !== 'string') {
    throw new HttpError(400, 'La descripción no es válida');
  }

  const descripcion = value.trim();

  if (descripcion.length > DESCRIPTION_MAX) {
    throw new HttpError(
      400,
      `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres`,
    );
  }

  return descripcion || null;
}

/**
 * "Ventas" y "ventas" son la misma categoría. Si la que ya existe está
 * desactivada se avisa, porque lo que corresponde es reactivarla.
 */
async function assertNameAvailable(nombre: string, exceptId?: number) {
  const existing = await categoryRepository.findByName(nombre);

  if (!existing || existing.id === exceptId) return;

  throw new HttpError(
    400,
    existing.activa
      ? 'La categoría ya existe'
      : 'La categoría ya existe y está desactivada: reactivala en lugar de crear otra',
  );
}

async function findExisting(id: number) {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new HttpError(404, 'Categoría no encontrada');
  }

  return category;
}

export async function getAll() {
  return categoryRepository.findAll();
}

export async function getById(id: number) {
  return findExisting(id);
}

export async function create(body: unknown) {
  assertObject(body);

  // Solo nombre y descripción: toda categoría nueva nace activa.
  const nombre = parseName(body.nombre);
  const descripcion =
    body.descripcion === undefined ? null : parseDescription(body.descripcion);

  await assertNameAvailable(nombre);

  return categoryRepository.create({ nombre, descripcion });
}

export async function update(id: number, body: unknown) {
  assertObject(body);

  const category = await findExisting(id);
  const changes: CategoryChanges = {};

  if (body.nombre !== undefined) {
    changes.nombre = parseName(body.nombre);

    if (changes.nombre !== category.nombre) {
      await assertNameAvailable(changes.nombre, id);
    }
  }

  if (body.descripcion !== undefined) {
    changes.descripcion = parseDescription(body.descripcion);
  }

  if (body.activa !== undefined) {
    if (typeof body.activa !== 'boolean') {
      throw new HttpError(400, 'El campo activa no es válido');
    }

    changes.activa = body.activa;
  }

  return categoryRepository.update(id, changes);
}

/**
 * Una categoría no se borra: se desactiva. Borrarla la quitaba de las ofertas
 * que la tenían (alguna podía quedar sin categorías). Desactivada ya no se
 * puede elegir en ofertas nuevas, las que la tenían la conservan y se
 * reactiva con `activa: true`.
 */
export async function remove(id: number) {
  await findExisting(id);

  return categoryRepository.update(id, { activa: false });
}
