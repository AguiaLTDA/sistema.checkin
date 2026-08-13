-- CreateEnum
CREATE TYPE "TipoRegistro" AS ENUM ('CHEGADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusRegistro" AS ENUM ('VALIDADO', 'PENDENTE_APROVACAO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "MetodoBiometrico" AS ENUM ('FACE_ID', 'DIGITAL', 'NENHUM');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('LOGIN_SUCESSO', 'LOGIN_FALHA', 'REFRESH_TOKEN', 'LOGOUT', 'TENTATIVA_CHECKIN', 'APROVACAO_MANUAL', 'REJEICAO_MANUAL');

-- CreateEnum
CREATE TYPE "ResultadoAuditoria" AS ENUM ('SUCESSO', 'REJEITADO', 'ERRO');

-- CreateTable
CREATE TABLE "professores" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "curso_vinculado" VARCHAR(120) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campi" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "latitude_central" DOUBLE PRECISION NOT NULL,
    "longitude_central" DOUBLE PRECISION NOT NULL,
    "raio_permitido_metros" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_ponto" (
    "id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "tipo" "TipoRegistro" NOT NULL,
    "timestamp_servidor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "distancia_do_campus_metros" DOUBLE PRECISION NOT NULL,
    "precisao_metros" DOUBLE PRECISION,
    "metodo_biometrico" "MetodoBiometrico" NOT NULL,
    "status" "StatusRegistro" NOT NULL,
    "sincronizado_offline" BOOLEAN NOT NULL DEFAULT false,
    "registrado_offline_em" TIMESTAMP(3),
    "justificativa_manual" VARCHAR(500),
    "campus_id" UUID,
    "decidido_por_id" UUID,
    "decidido_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registros_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "professor_id" UUID,
    "admin_id" UUID,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "revogado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" UUID NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "resultado" "ResultadoAuditoria" NOT NULL,
    "professor_id" UUID,
    "admin_id" UUID,
    "registro_id" UUID,
    "detalhes" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professores_cpf_key" ON "professores"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "professores_email_key" ON "professores"("email");

-- CreateIndex
CREATE INDEX "professores_curso_vinculado_idx" ON "professores"("curso_vinculado");

-- CreateIndex
CREATE INDEX "professores_ativo_idx" ON "professores"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "campi_nome_key" ON "campi"("nome");

-- CreateIndex
CREATE INDEX "campi_ativo_idx" ON "campi"("ativo");

-- CreateIndex
CREATE INDEX "registros_ponto_professor_id_idx" ON "registros_ponto"("professor_id");

-- CreateIndex
CREATE INDEX "registros_ponto_timestamp_servidor_idx" ON "registros_ponto"("timestamp_servidor");

-- CreateIndex
CREATE INDEX "registros_ponto_professor_id_timestamp_servidor_idx" ON "registros_ponto"("professor_id", "timestamp_servidor");

-- CreateIndex
CREATE INDEX "registros_ponto_status_idx" ON "registros_ponto"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_professor_id_idx" ON "refresh_tokens"("professor_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_admin_id_idx" ON "refresh_tokens"("admin_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expira_em_idx" ON "refresh_tokens"("expira_em");

-- CreateIndex
CREATE INDEX "logs_auditoria_criado_em_idx" ON "logs_auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "logs_auditoria_professor_id_idx" ON "logs_auditoria"("professor_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_acao_idx" ON "logs_auditoria"("acao");

-- AddForeignKey
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
