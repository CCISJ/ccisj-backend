-- El postulante puede retirar su postulación en cualquier estado (RF-40).
-- La postulación no se borra: queda como RETIRADA para que la empresa vea
-- que el postulante se dio de baja.
ALTER TYPE "estado_postulacion" ADD VALUE 'RETIRADA';
