import { construirApp } from './app.js';
import { env } from './env.js';
import { prisma } from './prisma.js';

async function principal(): Promise<void> {
  const app = await construirApp();

  const encerrar = async (sinal: string) => {
    app.log.info(`recebido ${sinal}, encerrando...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(`API UNIVC Check-in ouvindo em ${env.API_HOST}:${env.API_PORT}`);
}

principal().catch((erro) => {
  console.error('falha ao iniciar a API:', erro);
  process.exit(1);
});
