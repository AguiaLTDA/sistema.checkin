-- Remove a biometria do fluxo de check-in.
--
-- A presenca do professor passa a ser comprovada exclusivamente pela
-- localizacao (geocerca do campus, ver `campi.raio_permitido_metros`). Com a
-- coluna vai embora tambem o enum que a tipava: o sistema nao guarda mais nem
-- o rotulo do metodo biometrico.
ALTER TABLE "registros_ponto" DROP COLUMN "metodo_biometrico";

DROP TYPE "MetodoBiometrico";
