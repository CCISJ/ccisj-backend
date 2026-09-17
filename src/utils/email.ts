export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 255;

/**
 * Los emails de acceso se guardan en minúsculas y se buscan sin distinguir
 * mayúsculas: en el celular el teclado suele poner la primera en mayúscula y
 * "Empresa@gmail.com" no entraba si la cuenta era "empresa@gmail.com".
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
