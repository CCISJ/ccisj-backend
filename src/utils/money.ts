const MAX_IMPORTE = 99_999_999.99;

export function validarImporteUYU(valor: unknown): number {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error('El importe debe ser un número válido');
  }

  if (typeof valor === 'number' && !Number.isFinite(valor)) {
    throw new Error('El importe debe ser un número válido');
  }

  const texto = String(valor);

  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw new Error('El importe debe tener como máximo dos decimales');
  }

  const importe = Number(texto);

  if (importe <= 0) {
    throw new Error('El importe debe ser mayor a cero');
  }

  if (importe > MAX_IMPORTE) {
    throw new Error('El importe supera el máximo permitido');
  }

  return importe;
}
