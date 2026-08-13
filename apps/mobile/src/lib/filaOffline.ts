import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErroDeRede, enviarCheckin } from '../api/cliente';
import type { RegistroPendente } from '../tipos';

/**
 * Fila de check-ins feitos sem conexao.
 *
 * O registro fica no AsyncStorage com o horario declarado pelo aparelho e e
 * reenviado quando a internet volta. O servidor continua sendo quem carimba o
 * `timestamp_servidor`: o horario local viaja em `registrado_offline_em` apenas
 * como informacao de auditoria, e o registro entra como PENDENTE_APROVACAO ate
 * o RH conferir.
 */

const CHAVE_FILA = 'univc.fila_offline';

export async function lerFila(): Promise<RegistroPendente[]> {
  const bruto = await AsyncStorage.getItem(CHAVE_FILA);
  if (!bruto) return [];
  try {
    return JSON.parse(bruto) as RegistroPendente[];
  } catch {
    // Fila corrompida: descartar e comecar limpo e melhor que travar o app.
    await AsyncStorage.removeItem(CHAVE_FILA);
    return [];
  }
}

async function gravarFila(itens: RegistroPendente[]): Promise<void> {
  await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(itens));
}

export async function enfileirar(
  item: Omit<RegistroPendente, 'id_local' | 'tentativas'>,
): Promise<RegistroPendente[]> {
  const fila = await lerFila();
  const novo: RegistroPendente = {
    ...item,
    id_local: `local-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    tentativas: 0,
  };
  const atualizada = [...fila, novo];
  await gravarFila(atualizada);
  return atualizada;
}

export async function removerDaFila(idLocal: string): Promise<RegistroPendente[]> {
  const fila = await lerFila();
  const atualizada = fila.filter((item) => item.id_local !== idLocal);
  await gravarFila(atualizada);
  return atualizada;
}

export interface ResultadoSincronizacao {
  enviados: number;
  descartados: number;
  restantes: RegistroPendente[];
}

/**
 * Tenta enviar a fila inteira, na ordem em que foi criada.
 *
 * - Falha de rede: para o processamento e mantem o restante para a proxima vez.
 * - Erro 4xx (sequencia invalida, payload recusado): o item e descartado, ja
 *   que reenviar produziria o mesmo erro para sempre. O motivo fica guardado
 *   no ultimo item processado para o app poder mostrar.
 */
export async function sincronizarFila(): Promise<ResultadoSincronizacao> {
  const fila = await lerFila();
  if (fila.length === 0) {
    return { enviados: 0, descartados: 0, restantes: [] };
  }

  let enviados = 0;
  let descartados = 0;
  const restantes: RegistroPendente[] = [];
  let interrompido = false;

  for (const item of fila) {
    if (interrompido) {
      restantes.push(item);
      continue;
    }

    try {
      await enviarCheckin({
        tipo: item.tipo,
        latitude: item.latitude,
        longitude: item.longitude,
        precisao_metros: item.precisao_metros,
        metodo_biometrico: item.metodo_biometrico,
        sincronizado_offline: true,
        registrado_offline_em: item.registrado_offline_em,
      });
      enviados += 1;
    } catch (erro) {
      if (erro instanceof ErroDeRede) {
        interrompido = true;
        restantes.push({ ...item, tentativas: item.tentativas + 1 });
        continue;
      }

      const status = (erro as { status?: number }).status ?? 0;
      if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
        descartados += 1;
        continue;
      }

      interrompido = true;
      restantes.push({
        ...item,
        tentativas: item.tentativas + 1,
        ultimo_erro: (erro as Error).message,
      });
    }
  }

  await gravarFila(restantes);
  return { enviados, descartados, restantes };
}
