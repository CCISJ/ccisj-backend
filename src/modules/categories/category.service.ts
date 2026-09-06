import { CreateCategoryData, UpdateCategoryData } from '@/types/category.type';
import * as categoryRepository from './category.repository';

export async function getAll() {
  return categoryRepository.findAll();
}

export async function getById(id: number) {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new Error('Categoría no encontrada');
  }

  return category;
}

export async function create(data: CreateCategoryData) {
  if (!data.nombre) {
    throw new Error('El nombre es obligatorio');
  }

  const existingCategory = await categoryRepository.findByName(data.nombre);

  if (existingCategory) {
    throw new Error('La categoría ya existe');
  }

  return categoryRepository.create(data);
}

export async function update(id: number, data: UpdateCategoryData) {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new Error('Categoría no encontrada');
  }

  if (data.nombre && data.nombre !== category.nombre) {
    const existingCategory = await categoryRepository.findByName(data.nombre);

    if (existingCategory) {
      throw new Error('La categoría ya existe');
    }
  }

  return categoryRepository.update(id, data);
}

export async function remove(id: number) {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new Error('Categoría no encontrada');
  }

  return categoryRepository.remove(id);
}
