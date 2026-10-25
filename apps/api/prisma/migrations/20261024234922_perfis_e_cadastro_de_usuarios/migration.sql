-- AlterEnum
ALTER TYPE "AcaoAuditoria" ADD VALUE 'PERFIL_CRIADO';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'PERFIL_ATUALIZADO';

-- AlterTable
ALTER TABLE "professores" ADD COLUMN     "perfil_id" UUID;

-- CreateTable
CREATE TABLE "perfis" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(200),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

-- CreateIndex
CREATE INDEX "professores_perfil_id_idx" ON "professores"("perfil_id");

-- AddForeignKey
ALTER TABLE "professores" ADD CONSTRAINT "professores_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Perfis iniciais. O RH pode renomear, desativar ou criar outros pelo dashboard.
INSERT INTO "perfis" ("id", "nome", "descricao", "updated_at") VALUES
    (gen_random_uuid(), 'Professor', 'Docente vinculado a um curso', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Estagiário', 'Estagiário em atividade na instituição', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Estudante', 'Aluno com registro de presença', CURRENT_TIMESTAMP);

-- Quem ja estava cadastrado antes dos perfis era professor.
UPDATE "professores"
SET "perfil_id" = (SELECT "id" FROM "perfis" WHERE "nome" = 'Professor')
WHERE "perfil_id" IS NULL;

-- Supabase: mesma regra das demais tabelas, sem acesso pela Data API.
ALTER TABLE "perfis" ENABLE ROW LEVEL SECURITY;
