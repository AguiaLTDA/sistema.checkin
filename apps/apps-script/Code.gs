/**
 * @OnlyCurrentDoc
 *
 * UNIVC Check-in — base de dados no Google Sheets.
 *
 * Este script e um Web App que a API (no Render) chama para ler e gravar as
 * abas desta planilha. Ele nao tem regra de negocio: so le abas, aplica lotes
 * de escrita e cria colunas que faltarem. Tudo o mais (login, geocerca,
 * relatorios) continua na API.
 *
 * A anotacao @OnlyCurrentDoc acima limita o script a ESTA planilha: ele nao
 * ganha acesso a nenhum outro arquivo do seu Drive.
 *
 * Instalacao (passo a passo completo no README, secao "Banco de dados no
 * Google Sheets"):
 *   1. Na planilha: Extensoes > Apps Script; cole este arquivo como Code.gs.
 *   2. Rode a funcao `configurarChave` uma vez e copie a chave do log.
 *   3. Rode `testarConfiguracao` e confira que o autoteste passou.
 *   4. Implantar > Nova implantacao > App da Web, executar como "Eu",
 *      acesso "Qualquer pessoa". Copie a URL terminada em /exec.
 *   5. No Render: APPS_SCRIPT_URL = URL do passo 4,
 *      APPS_SCRIPT_CHAVE = chave do passo 2.
 *
 * Seguranca: o Web App fica acessivel na internet, mas toda chamada precisa
 * da chave guardada nas Propriedades do script (CHAVE_API). Sem chave
 * configurada, ele recusa tudo.
 */

var VERSAO = 1;
var ESPERA_LOCK_MS = 30000;
var ABA_AUTOTESTE = '_autoteste';

// ---------------------------------------------------------------------------
// Entrada HTTP
// ---------------------------------------------------------------------------

function doPost(e) {
  var pedido;
  try {
    pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (erro) {
    return responder_({ ok: false, erro: 'Corpo da requisicao nao e JSON.' });
  }

  try {
    autenticar_(pedido.chave);

    switch (pedido.acao) {
      case 'ping':
        return responder_({ ok: true, versao: VERSAO });

      case 'preparar':
        comLock_(function () {
          preparar_(pedido.esquema);
        });
        return responder_({ ok: true });

      case 'ler':
        return responder_({ ok: true, abas: ler_(pedido.abas) });

      case 'escrever':
        comLock_(function () {
          escrever_(pedido.operacoes);
        });
        return responder_({ ok: true });

      case 'autoteste': {
        var resultado = comLock_(autoteste_);
        return responder_({ ok: true, aprovado: resultado.aprovado, falhas: resultado.falhas });
      }

      default:
        throw new Error('Acao desconhecida: ' + pedido.acao);
    }
  } catch (erro) {
    return responder_({ ok: false, erro: String((erro && erro.message) || erro) });
  }
}

/** Abrir a URL no navegador mostra so que o servico esta no ar. */
function doGet() {
  return responder_({ ok: true, servico: 'univc-checkin', versao: VERSAO });
}

function responder_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ---------------------------------------------------------------------------
// Seguranca
// ---------------------------------------------------------------------------

function autenticar_(chave) {
  var esperada = PropertiesService.getScriptProperties().getProperty('CHAVE_API');
  if (!esperada || esperada.length < 32) {
    throw new Error(
      'CHAVE_API nao configurada nas Propriedades do script (rode configurarChave).',
    );
  }
  if (typeof chave !== 'string' || !iguaisEmTempoConstante_(chave, esperada)) {
    throw new Error('Chave invalida.');
  }
}

/** Compara sem sair no primeiro caractere diferente (nao vaza a chave pelo tempo). */
function iguaisEmTempoConstante_(a, b) {
  var diferenca = a.length ^ b.length;
  var tamanho = Math.max(a.length, b.length);
  for (var i = 0; i < tamanho; i += 1) {
    diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

function comLock_(funcao) {
  var trava = LockService.getScriptLock();
  trava.waitLock(ESPERA_LOCK_MS);
  try {
    var resultado = funcao();
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    trava.releaseLock();
  }
}

function planilha_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  if (!planilha) {
    throw new Error(
      'Script nao vinculado a uma planilha: crie-o pelo menu Extensoes > Apps Script da planilha.',
    );
  }
  return planilha;
}

// ---------------------------------------------------------------------------
// Celulas
// ---------------------------------------------------------------------------

/**
 * Todo texto e gravado com um apostrofo na frente. Para a planilha, o
 * apostrofo significa "isto e texto": ele nao aparece na celula nem volta na
 * leitura, mas impede que um CPF com zero inicial vire numero, que uma data
 * ISO vire data local e, principalmente, que um texto comecando com "=" seja
 * executado como formula (injecao de formula).
 */
function paraCelula_(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'string') return "'" + valor;
  return valor;
}

function deCelula_(valor) {
  return valor instanceof Date ? valor.toISOString() : valor;
}

function cabecalho_(aba) {
  var largura = aba.getLastColumn();
  if (largura === 0) return [];
  return aba
    .getRange(1, 1, 1, largura)
    .getValues()[0]
    .map(function (celula) {
      return String(celula);
    });
}

// ---------------------------------------------------------------------------
// Acoes
// ---------------------------------------------------------------------------

/** Cria abas e colunas que faltarem. Nunca apaga nem reordena nada. */
function preparar_(esquema) {
  if (!esquema || typeof esquema !== 'object') throw new Error('Esquema ausente.');
  var planilha = planilha_();

  Object.keys(esquema).forEach(function (nome) {
    var colunas = esquema[nome];
    var aba = planilha.getSheetByName(nome) || planilha.insertSheet(nome);
    var atual = cabecalho_(aba);
    var faltando = colunas.filter(function (coluna) {
      return atual.indexOf(coluna) === -1;
    });
    if (faltando.length) {
      aba.getRange(1, atual.length + 1, 1, faltando.length).setValues([faltando]);
    }
    if (aba.getFrozenRows() < 1) aba.setFrozenRows(1);
  });
}

function ler_(nomes) {
  if (!Array.isArray(nomes)) throw new Error('Lista de abas ausente.');
  var planilha = planilha_();
  var resultado = {};

  nomes.forEach(function (nome) {
    var aba = planilha.getSheetByName(nome);
    var valores = aba ? aba.getDataRange().getValues() : [];
    if (valores.length < 2) {
      resultado[nome] = [];
      return;
    }
    var cabecalho = valores[0].map(String);
    resultado[nome] = valores
      .slice(1)
      .filter(function (linha) {
        return linha.some(function (celula) {
          return celula !== '' && celula !== null;
        });
      })
      .map(function (linha) {
        var registro = {};
        cabecalho.forEach(function (coluna, indice) {
          if (coluna) registro[coluna] = deCelula_(linha[indice]);
        });
        return registro;
      });
  });

  return resultado;
}

/**
 * Aplica as operacoes na ordem. O lote inteiro e validado ANTES da primeira
 * escrita (abas, colunas e registros alvo), para um erro nao deixar a
 * planilha gravada pela metade.
 *
 * Idempotencia (a API repete a chamada se a rede falhar):
 *  - inserir um id que ja existe e ignorado;
 *  - remover um id que nao existe nao faz nada;
 *  - atualizar so grava os campos enviados.
 */
function escrever_(operacoes) {
  if (!Array.isArray(operacoes)) throw new Error('Lista de operacoes ausente.');
  var planilha = planilha_();
  var contextos = {};

  function contexto(nome) {
    if (!contextos[nome]) {
      var aba = planilha.getSheetByName(nome);
      if (!aba) throw new Error('Aba inexistente: ' + nome);
      var cabecalho = cabecalho_(aba);
      var colunaId = cabecalho.indexOf('id');
      if (colunaId === -1) throw new Error('Aba sem coluna "id": ' + nome);
      contextos[nome] = {
        aba: aba,
        cabecalho: cabecalho,
        colunaId: colunaId,
        indice: null,
        remover: {},
      };
    }
    return contextos[nome];
  }

  function indice(c) {
    if (!c.indice) {
      c.indice = {};
      var ultima = c.aba.getLastRow();
      if (ultima >= 2) {
        c.aba
          .getRange(2, c.colunaId + 1, ultima - 1, 1)
          .getValues()
          .forEach(function (linha, posicao) {
            var id = String(linha[0]);
            if (id) c.indice[id] = posicao + 2;
          });
      }
    }
    return c.indice;
  }

  function exigirColunas(c, nomes, aba) {
    var desconhecidas = nomes.filter(function (nome) {
      return c.cabecalho.indexOf(nome) === -1;
    });
    if (desconhecidas.length) {
      throw new Error('Colunas inexistentes na aba ' + aba + ': ' + desconhecidas.join(', '));
    }
  }

  // 1a passada: valida tudo sem escrever nada.
  var aInserir = {};
  operacoes.forEach(function (op) {
    var c = contexto(op.aba);
    if (op.tipo === 'inserir') {
      var id = op.registro && op.registro.id;
      if (!id) throw new Error('Registro sem id na aba ' + op.aba);
      exigirColunas(c, Object.keys(op.registro), op.aba);
      aInserir[op.aba + '\u0000' + id] = true;
    } else if (op.tipo === 'atualizar') {
      if (!indice(c)[op.id] && !aInserir[op.aba + '\u0000' + op.id]) {
        throw new Error('Registro ' + op.id + ' nao encontrado na aba ' + op.aba);
      }
      exigirColunas(c, Object.keys(op.campos || {}), op.aba);
    } else if (op.tipo !== 'remover') {
      throw new Error('Tipo de operacao desconhecido: ' + op.tipo);
    }
  });

  // 2a passada: escreve.
  operacoes.forEach(function (op) {
    var c = contexto(op.aba);
    var ids = indice(c);

    if (op.tipo === 'inserir') {
      if (ids[op.registro.id]) return;
      var linha = c.cabecalho.map(function (coluna) {
        return paraCelula_(op.registro[coluna]);
      });
      var numero = c.aba.getLastRow() + 1;
      c.aba.getRange(numero, 1, 1, linha.length).setValues([linha]);
      ids[op.registro.id] = numero;
    } else if (op.tipo === 'atualizar') {
      var alvo = ids[op.id];
      Object.keys(op.campos || {}).forEach(function (campo) {
        c.aba
          .getRange(alvo, c.cabecalho.indexOf(campo) + 1)
          .setValue(paraCelula_(op.campos[campo]));
      });
    } else {
      c.remover[op.id] = true;
    }
  });

  // Remocoes por ultimo e em bloco: reescrever a aba sem as linhas e muito
  // mais rapido que apagar linha a linha, e nao bagunca os numeros de linha
  // usados pelas operacoes acima.
  Object.keys(contextos).forEach(function (nome) {
    var c = contextos[nome];
    if (Object.keys(c.remover).length) removerLinhas_(c);
  });
}

function removerLinhas_(c) {
  var ultima = c.aba.getLastRow();
  if (ultima < 2) return;
  var largura = c.aba.getLastColumn();
  var valores = c.aba.getRange(2, 1, ultima - 1, largura).getValues();
  var mantidas = valores.filter(function (linha) {
    return !c.remover[String(linha[c.colunaId])];
  });
  if (mantidas.length === valores.length) return;

  if (mantidas.length) {
    c.aba.getRange(2, 1, mantidas.length, largura).setValues(
      mantidas.map(function (linha) {
        return linha.map(paraCelula_);
      }),
    );
  }
  // As linhas que sobraram no fim ficam vazias; a proxima insercao usa a
  // primeira linha livre (getLastRow ignora linhas vazias no final).
  c.aba.getRange(2 + mantidas.length, 1, valores.length - mantidas.length, largura).clearContent();
}

/**
 * Grava e rele valores que planilhas costumam estragar. O importador da API
 * so grava dados reais se este teste passar.
 */
function autoteste_() {
  var planilha = planilha_();
  var antiga = planilha.getSheetByName(ABA_AUTOTESTE);
  if (antiga) planilha.deleteSheet(antiga);
  var aba = planilha.insertSheet(ABA_AUTOTESTE);

  var casos = [
    '01122233344', // CPF com zero inicial
    '=1+1', // formula
    '+5527999999999', // telefone
    '-18.7228125', // numero negativo com ponto
    '2026-09-07T22:40:37.947Z', // data ISO
    'TRUE', // booleano
    '00:30', // hora
    '1/2', // fracao ou data
    "'citacao", // texto que ja comeca com apostrofo
    '{"motivo":"FORA_DO_RAIO"}', // json
    'Estagiário', // acento
  ];

  try {
    aba.getRange(1, 1, 1, casos.length).setValues([casos.map(paraCelula_)]);
    SpreadsheetApp.flush();
    var lidos = aba.getRange(1, 1, 1, casos.length).getValues()[0];
    var falhas = [];
    casos.forEach(function (esperado, i) {
      var obtido = deCelula_(lidos[i]);
      if (obtido !== esperado) {
        falhas.push(JSON.stringify(esperado) + ' voltou como ' + JSON.stringify(obtido));
      }
    });
    return { aprovado: falhas.length === 0, falhas: falhas };
  } finally {
    planilha.deleteSheet(aba);
  }
}

// ---------------------------------------------------------------------------
// Funcoes para rodar a mao no editor (menu Executar)
// ---------------------------------------------------------------------------

/** Gera a chave secreta, guarda nas Propriedades e mostra no log para copiar. */
function configurarChave() {
  var chave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('CHAVE_API', chave);
  Logger.log('Chave gerada. Copie para APPS_SCRIPT_CHAVE no Render:\n' + chave);
  Logger.log('Rodar de novo gera outra chave e invalida a anterior.');
}

/** Confere chave, acesso a planilha e o autoteste de formatacao. */
function testarConfiguracao() {
  var chave = PropertiesService.getScriptProperties().getProperty('CHAVE_API');
  Logger.log('CHAVE_API configurada: ' + (chave && chave.length >= 32 ? 'sim' : 'NAO'));
  Logger.log('Planilha: ' + planilha_().getName());
  var resultado = comLock_(autoteste_);
  Logger.log(
    resultado.aprovado
      ? 'Autoteste de formatacao: APROVADO'
      : 'Autoteste de formatacao: FALHOU\n' + resultado.falhas.join('\n'),
  );
}
