export type CreateCategoryData = {
  nombre: string;
  descripcion?: string;
};

export type UpdateCategoryData = {
  nombre?: string;
  descripcion?: string;
  activa?: boolean;
};
