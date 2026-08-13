-- Executado apenas na primeira criacao do volume do Postgres.
-- Cria o banco usado pelos testes de integracao (DATABASE_URL_TEST), separado
-- do banco de desenvolvimento para que `npm test` nunca apague dados do dev.
CREATE DATABASE univc_checkin_test;
