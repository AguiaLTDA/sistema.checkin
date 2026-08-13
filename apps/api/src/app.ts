import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import type { ErroApi } from '@univc/shared';
import { env, origensCors } from './env.js';
import { ErroHttp } from './lib/erros.js';
import { rotasAdmin } from './routes/admin.js';
import { rotasAuth } from './routes/auth.js';
import { rotasCheckin } from './routes/checkin.js';

export async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : env.NODE_ENV === 'development'
          ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
          : true,
    // Confia no X-Forwarded-For para que `request.ip` (usado no rate limit e na
    // auditoria) reflita o cliente real quando houver proxy na frente.
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(cors, {
    origin: origensCors,
    credentials: true,
  });

  /**
   * Rate limit registrado como nao-global: so vale nas rotas que declaram
   * `config.rateLimit` (hoje, POST /checkin). A chave combina IP e uma marca
   * do token, para que o limite seja por professor e nao pela rede inteira do
   * campus, onde todos compartilham o mesmo IP de saida.
   */
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => {
      const autorizacao = request.headers.authorization ?? '';
      const marca = autorizacao
        ? createHash('sha256').update(autorizacao).digest('hex').slice(0, 32)
        : 'anonimo';
      return `${request.ip}:${marca}`;
    },
    errorResponseBuilder: (_request, contexto) => ({
      erro: 'LIMITE_EXCEDIDO',
      mensagem: `Muitas tentativas de check-in. Tente novamente em ${Math.ceil(
        contexto.ttl / 1000,
      )} segundos.`,
    }),
  });

  app.get('/health', async () => ({
    status: 'ok',
    servidor_em: new Date().toISOString(),
  }));

  app.setNotFoundHandler((request, reply) => {
    const corpo: ErroApi = {
      erro: 'NAO_ENCONTRADO',
      mensagem: `Rota ${request.method} ${request.url} nao existe.`,
    };
    return reply.status(404).send(corpo);
  });

  app.setErrorHandler((erro, request, reply) => {
    if (erro instanceof ErroHttp) {
      const corpo: ErroApi = {
        erro: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
      };
      return reply.status(erro.statusCode).send(corpo);
    }

    // Erros do proprio Fastify (payload malformado, 415, etc.) ja trazem
    // statusCode e codigo proprios; repassamos no mesmo formato da API.
    const erroFastify = erro as { statusCode?: number; code?: string; message?: string };
    if (erroFastify.statusCode && erroFastify.statusCode < 500) {
      const corpo: ErroApi = {
        erro: erroFastify.code ?? 'REQUISICAO_INVALIDA',
        mensagem: erroFastify.message ?? 'Requisicao invalida.',
      };
      return reply.status(erroFastify.statusCode).send(corpo);
    }

    request.log.error({ erro }, 'erro nao tratado');
    const corpo: ErroApi = {
      erro: 'ERRO_INTERNO',
      mensagem: 'Erro interno no servidor.',
    };
    return reply.status(500).send(corpo);
  });

  // As rotas sao registradas depois dos handlers de erro: o Fastify associa o
  // error handler vigente no momento em que a rota e criada.
  await app.register(rotasAuth);
  await app.register(rotasCheckin);
  await app.register(rotasAdmin);

  return app;
}
