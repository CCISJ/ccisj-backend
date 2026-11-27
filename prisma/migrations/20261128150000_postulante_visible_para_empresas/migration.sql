-- El postulante elige si las empresas socias lo pueden encontrar en la bolsa
-- de candidatos sin que se postule. Apagado por defecto: nadie aparece en la
-- bolsa sin haberlo elegido, tampoco los que ya estaban registrados.
ALTER TABLE "postulante"
ADD COLUMN "visible_para_empresas" BOOLEAN NOT NULL DEFAULT false;
