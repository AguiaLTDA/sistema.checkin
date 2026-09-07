/**
 * Seed de desenvolvimento.
 *
 * Cria o campus da UNIVC, um usuario de RH, professores ficticios de cursos
 * diferentes e alguns registros de ponto historicos — incluindo um pendente de
 * aprovacao e um dia com chegada sem saida — para que o dashboard e o relatorio
 * de jornada ja tenham o que mostrar no primeiro `docker compose up`.
 *
 * O script e idempotente: rodar de novo atualiza os cadastros e nao duplica os
 * registros de exemplo.
 */
import { PrismaClient, type TipoRegistro } from '@prisma/client';
// Importado pelo efeito colateral de carregar o .env da raiz do monorepo.
import { env } from '../src/env.js';
import { inicioDoDia } from '../src/lib/datas.js';
import { chaveDoDia } from '../src/lib/jornada.js';
import { gerarHashSenha } from '../src/lib/senha.js';

const prisma = new PrismaClient();

/**
 * Instante UTC correspondente a `hora:minuto` de `diasAtras` dias atras, no
 * fuso configurado em RELATORIO_TIMEZONE. Sem isso os horarios do seed sairiam
 * no fuso da maquina (UTC dentro do container) e apareceriam deslocados no
 * dashboard.
 */
function momentoLocal(diasAtras: number, hora: number, minuto: number): Date {
  const dia = new Date();
  dia.setDate(dia.getDate() - diasAtras);
  const chave = chaveDoDia(dia, env.RELATORIO_TIMEZONE);
  const meiaNoite = inicioDoDia(chave, env.RELATORIO_TIMEZONE);
  return new Date(meiaNoite.getTime() + (hora * 60 + minuto) * 60_000);
}

const SENHA_PROFESSOR = 'senha123';
const SENHA_ADMIN = 'admin123';

/**
 * Endereco oficial: R. Humberto de Almeida Francklin, 217, Universitario,
 * Sao Mateus - ES, 29933-415. Coordenadas conferidas por geocodificacao
 * reversa (OpenStreetMap) sobre o endereco informado pela gestao — a marcacao
 * do OSM para "Centro Universitario Vale do Cricare - Univc" cai neste mesmo
 * numero da rua, o que confirma o ponto.
 */
const CAMPUS_UNIVC = {
  nome: 'Campus Sao Mateus - UNIVC',
  latitudeCentral: -18.722385,
  longitudeCentral: -39.844867,
  raioPermitidoMetros: 300,
};

const PROFESSORES = [
  {
    nome: 'Ana Beatriz Rocha',
    cpf: '11122233344',
    email: 'ana.rocha@univc.br',
    cursoVinculado: 'Direito',
  },
  {
    nome: 'Carlos Eduardo Menezes',
    cpf: '22233344455',
    email: 'carlos.menezes@univc.br',
    cursoVinculado: 'Odontologia',
  },
  {
    nome: 'Mariana Alves Prado',
    cpf: '33344455566',
    email: 'mariana.prado@univc.br',
    cursoVinculado: 'Enfermagem',
  },
  {
    nome: 'Rafael Nunes Portela',
    cpf: '44455566677',
    email: 'rafael.portela@univc.br',
    cursoVinculado: 'Medicina Veterinaria',
  },
  {
    nome: 'Juliana Castro Lima',
    cpf: '55566677788',
    email: 'juliana.lima@univc.br',
    cursoVinculado: 'Administracao',
  },
] as const;

const ADMIN = {
  nome: 'Rejane Ferreira (RH)',
  email: 'rh@univc.br',
};

/** Um ponto a ~1,8 km do campus, usado para o registro pendente de exemplo. */
const PONTO_FORA_DO_RAIO = { latitude: -18.71600, longitude: -39.86322 };

async function main(): Promise<void> {
  console.log('> seed: campus');
  const campus = await prisma.campus.upsert({
    where: { nome: CAMPUS_UNIVC.nome },
    update: CAMPUS_UNIVC,
    create: CAMPUS_UNIVC,
  });

  console.log('> seed: administrador de RH');
  const senhaHashAdmin = await gerarHashSenha(SENHA_ADMIN);
  await prisma.admin.upsert({
    where: { email: ADMIN.email },
    update: { nome: ADMIN.nome, senhaHash: senhaHashAdmin, ativo: true },
    create: { ...ADMIN, senhaHash: senhaHashAdmin },
  });

  console.log('> seed: professores');
  const senhaHashProfessor = await gerarHashSenha(SENHA_PROFESSOR);
  const professores = [];
  for (const dados of PROFESSORES) {
    professores.push(
      await prisma.professor.upsert({
        where: { email: dados.email },
        update: { ...dados, senhaHash: senhaHashProfessor, ativo: true },
        create: { ...dados, senhaHash: senhaHashProfessor },
      }),
    );
  }

  const jaTemRegistros = await prisma.registroPonto.count();
  if (jaTemRegistros > 0) {
    console.log(
      `> seed: ${jaTemRegistros} registros ja existem, pulando os de exemplo`,
    );
    await resumo();
    return;
  }

  console.log('> seed: registros de ponto de exemplo');

  const [direito, odontologia, enfermagem] = professores;
  if (!direito || !odontologia || !enfermagem) {
    throw new Error('seed: professores nao foram criados como esperado');
  }

  const dentroDoCampus = {
    latitude: CAMPUS_UNIVC.latitudeCentral + 0.0004,
    longitude: CAMPUS_UNIVC.longitudeCentral + 0.0004,
  };

  type RegistroSeed = {
    professorId: string;
    tipo: TipoRegistro;
    diasAtras: number;
    hora: number;
    minuto: number;
    latitude: number;
    longitude: number;
    status: 'VALIDADO' | 'PENDENTE_APROVACAO';
    campusId: string | null;
  };

  const base = (
    professorId: string,
    diasAtras: number,
    tipo: TipoRegistro,
    hora: number,
    minuto: number,
  ): RegistroSeed => ({
    professorId,
    tipo,
    diasAtras,
    hora,
    minuto,
    latitude: dentroDoCampus.latitude,
    longitude: dentroDoCampus.longitude,
    status: 'VALIDADO',
    campusId: campus.id,
  });

  const registros: RegistroSeed[] = [
    // Dois dias completos da professora de Direito.
    base(direito.id, 3, 'CHEGADA', 8, 2),
    base(direito.id, 3, 'SAIDA', 12, 5),
    base(direito.id, 2, 'CHEGADA', 8, 0),
    base(direito.id, 2, 'SAIDA', 11, 58),

    // Professor de Odontologia: um dia completo e um registro fora do raio,
    // que o dashboard mostra como pendente de aprovacao do RH.
    base(odontologia.id, 3, 'CHEGADA', 13, 30),
    base(odontologia.id, 3, 'SAIDA', 17, 45),
    {
      ...base(odontologia.id, 1, 'CHEGADA', 13, 40),
      ...PONTO_FORA_DO_RAIO,
      status: 'PENDENTE_APROVACAO',
    },

    // Professora de Enfermagem: chegada sem saida, para exercitar o alerta de
    // inconsistencia do relatorio de jornada.
    base(enfermagem.id, 2, 'CHEGADA', 7, 55),
  ];

  for (const registro of registros) {
    const momento = momentoLocal(
      registro.diasAtras,
      registro.hora,
      registro.minuto,
    );

    const distancia = distanciaAproximadaMetros(
      registro.latitude,
      registro.longitude,
      CAMPUS_UNIVC.latitudeCentral,
      CAMPUS_UNIVC.longitudeCentral,
    );

    await prisma.registroPonto.create({
      data: {
        professorId: registro.professorId,
        tipo: registro.tipo,
        timestampServidor: momento,
        latitude: registro.latitude,
        longitude: registro.longitude,
        distanciaDoCampusMetros: distancia,
        status: registro.status,
        campusId: registro.campusId,
        sincronizadoOffline: false,
      },
    });
  }

  await resumo();
}

/** Haversine simplificada, duplicada aqui para o seed nao depender da API. */
function distanciaAproximadaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_008.8;
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function resumo(): Promise<void> {
  console.log('\n=== Usuarios de teste ===');
  console.log(`Dashboard (RH):  ${ADMIN.email} / ${SENHA_ADMIN}`);
  for (const professor of PROFESSORES) {
    console.log(
      `App (professor): ${professor.email.padEnd(28)} / ${SENHA_PROFESSOR}  [${professor.cursoVinculado}]`,
    );
  }
  console.log(
    `\nCampus: ${CAMPUS_UNIVC.nome} (${CAMPUS_UNIVC.latitudeCentral}, ${CAMPUS_UNIVC.longitudeCentral}) raio ${CAMPUS_UNIVC.raioPermitidoMetros} m\n`,
  );
}

main()
  .catch((erro) => {
    console.error('falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
