import type {
  MetodoBiometrico,
  RegistroPontoDTO,
  RespostaPaginada,
  TipoRegistro,
} from '@univc/shared';
import { comQuery, requisitar } from './cliente';

/** Chamadas do painel do usuario (mesmas rotas que o app mobile usa). */

export interface UltimoRegistro {
  ultimo: RegistroPontoDTO | null;
  proximo_tipo_esperado: TipoRegistro;
}

export interface RespostaCheckin {
  registro: RegistroPontoDTO;
  motivo: string;
  mensagem: string;
}

export function buscarUltimo(): Promise<UltimoRegistro> {
  return requisitar('/checkin/ultimo', { escopo: 'usuario' });
}

export function listarHistorico(
  pagina: number,
  porPagina = 10,
): Promise<RespostaPaginada<RegistroPontoDTO>> {
  return requisitar(
    comQuery('/checkin/historico', { pagina, por_pagina: porPagina }),
    { escopo: 'usuario' },
  );
}

export function registrarPonto(corpo: {
  tipo: TipoRegistro;
  latitude: number;
  longitude: number;
  metodo_biometrico: MetodoBiometrico;
  precisao_metros?: number;
}): Promise<RespostaCheckin> {
  return requisitar('/checkin', { metodo: 'POST', corpo, escopo: 'usuario' });
}
