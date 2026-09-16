-- Momento del último cambio de contraseña. Las sesiones emitidas antes dejan
-- de valer (ver requireAuth). Nullable: las cuentas existentes no cambian.
ALTER TABLE "usuario" ADD COLUMN "password_actualizada" TIMESTAMP(6);
