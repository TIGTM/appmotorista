/**
 * Consulta somente leitura para o piloto do aplicativo do motorista.
 *
 * O script nao possui operacoes de escrita. Por padrao, consulta cargas
 * abertas, pendentes e ainda nao enviadas ao WMS para o motorista Silas.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projeto = path.resolve(__dirname, '..');

function carregarEnvLocal() {
  const arquivo = path.join(projeto, '.env');
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const separador = texto.indexOf('=');
    if (separador <= 0) continue;
    const nome = texto.slice(0, separador).trim();
    const valor = texto.slice(separador + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(nome in process.env)) process.env[nome] = valor;
  }
}

carregarEnvLocal();

const diretorioMcp = process.env.SANKHYA_MCP_DIR
  ? path.resolve(process.env.SANKHYA_MCP_DIR)
  : path.resolve(projeto, '..', 'sankhya-mcp');

// O proxy local e o caminho padrao de producao; o .env pode sobrescreve-lo.
const proxyUrl = String(
  process.env.SANKHYA_API_PROXY_URL || 'http://127.0.0.1:13000/sql'
).trim();
const proxyToken = String(process.env.SANKHYA_API_PROXY_TOKEN || '').trim();

let executarSQL;
if (proxyUrl) {
  executarSQL = async (sql) => {
    const headers = { 'Content-Type': 'application/json' };
    if (proxyToken) headers['x-api-key'] = proxyToken;
    const resposta = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: sql }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || `Proxy Sankhya respondeu HTTP ${resposta.status}.`);
    return { registros: Array.isArray(corpo) ? corpo : corpo.registros || [] };
  };
} else {
  const require = createRequire(import.meta.url);
  const { config } = require(path.join(diretorioMcp, 'node_modules', 'dotenv'));
  config({ path: path.join(diretorioMcp, '.env') });
  ({ executarSQL } = await import(pathToFileURL(path.join(diretorioMcp, 'sankhya-api.js')).href));
}

function argumento(nome, padrao = undefined) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : padrao;
}

function inteiroPositivo(nome, valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`O parametro --${nome} deve ser um inteiro positivo.`);
  }
  return numero;
}

function inteiroOpcional(nome, valor) {
  if (valor === undefined) return null;
  return inteiroPositivo(nome, valor);
}

function limpar(valor) {
  return typeof valor === 'string' ? valor.trim() : valor;
}

export async function consultarCargas({ empresa = 2, motorista = 41850, oc = null } = {}) {
  const codigoEmpresa = inteiroPositivo('empresa', empresa);
  const codigoMotorista = inteiroPositivo('motorista', motorista);
  const ordemCarga = inteiroOpcional('oc', oc);
  const filtroOrdem = ordemCarga === null
    ? ''
    : `\n  AND O.ORDEMCARGA = ${ordemCarga}`;

  const sql = `
SELECT
    O.ORDEMCARGA AS CODIGO_OC,
    O.CODEMP,
    O.SITUACAO AS SITUACAO_OC,
    O.ENVIOWMS,
    O.CODPARCMOTORISTA,
    MOTOR.NOMEPARC AS MOTORISTA,
    O.CODPARCTRANSP,
    TRANSP.NOMEPARC AS TRANSPORTADORA,
    O.DTPREVSAIDA,
    O.HORASAIDA,
    O.SEQCARGA AS SEQ_OC,
    C.NUNOTA,
    C.CODPARC,
    PAR.NOMEPARC AS CLIENTE,
    PAR.CEP,
    PAR.CODEND,
    PAR.NUMEND,
    PAR.COMPLEMENTO,
    PAR.CODBAI,
    BAI.NOMEBAI AS BAIRRO,
    PAR.CODCID,
    CID.NOMECID AS CIDADE,
    CID.UF AS CODUF,
    UFS.UF,
    ADR.NOMEEND AS LOGRADOURO,
    C.DTNEG,
    C.STATUSNOTA,
    C.PENDENTE,
    C.AD_DTENTREGA,
    C.AD_SITENTREGUE,
    C.AD_OBSSITENTREGUE,
    C.ORDEMCARGA,
    C.SEQCARGA,
    C.VLRNOTA,
    C.PESOBRUTO AS PESO_BRUTO_PEDIDO,
    I.SEQUENCIA,
    I.CODPROD,
    PRO.DESCRPROD,
    I.QTDNEG,
    I.VLRUNIT,
    I.VLRTOT,
    I.PESO AS PESO_ITEM,
    PRO.PESOBRUTO AS PESO_BRUTO_UNITARIO,
    PRO.PESOLIQ AS PESO_LIQ_UNITARIO,
    I.CODLOCALORIG,
    I.CONTROLE
FROM SANKHYA.TGFORD O
JOIN SANKHYA.TGFCAB C
  ON C.ORDEMCARGA = O.ORDEMCARGA
 AND C.CODEMP = O.CODEMP
JOIN SANKHYA.TGFITE I
  ON I.NUNOTA = C.NUNOTA
JOIN SANKHYA.TGFPRO PRO
  ON PRO.CODPROD = I.CODPROD
JOIN SANKHYA.TGFPAR PAR
  ON PAR.CODPARC = C.CODPARC
JOIN SANKHYA.TGFPAR MOTOR
  ON MOTOR.CODPARC = O.CODPARCMOTORISTA
LEFT JOIN SANKHYA.TGFPAR TRANSP
  ON TRANSP.CODPARC = O.CODPARCTRANSP
LEFT JOIN SANKHYA.TSIEND ADR
  ON ADR.CODEND = PAR.CODEND
LEFT JOIN SANKHYA.TSIBAI BAI
  ON BAI.CODBAI = PAR.CODBAI
LEFT JOIN SANKHYA.TSICID CID
  ON CID.CODCID = PAR.CODCID
LEFT JOIN SANKHYA.TSIUFS UFS
  ON UFS.CODUF = CID.UF
WHERE O.CODEMP = ${codigoEmpresa}
  AND O.CODPARCMOTORISTA = ${codigoMotorista}
  AND O.SITUACAO = 'A'
  AND O.ENVIOWMS = 'N'
  AND C.STATUSNOTA IN ('A', 'L')
  AND C.PENDENTE = 'S'${filtroOrdem}
ORDER BY
    O.ORDEMCARGA,
    C.SEQCARGA,
    C.NUNOTA,
    I.SEQUENCIA;
`;

  const resultado = await executarSQL(sql);
  const cargasPorCodigo = new Map();

  for (const bruto of resultado.registros) {
    const linha = Object.fromEntries(
      Object.entries(bruto).map(([chave, valor]) => [chave, limpar(valor)])
    );

    let carga = cargasPorCodigo.get(linha.CODIGO_OC);
    if (!carga) {
      carga = {
        codigo: linha.CODIGO_OC,
        empresa: linha.CODEMP,
        situacao: linha.SITUACAO_OC,
        envioWms: linha.ENVIOWMS,
        motorista: linha.CODPARCMOTORISTA,
        motoristaNome: linha.MOTORISTA,
        transportadora: linha.TRANSPORTADORA,
        previsaoSaida: linha.DTPREVSAIDA,
        horaSaida: linha.HORASAIDA,
        pedidos: [],
      };
      cargasPorCodigo.set(linha.CODIGO_OC, carga);
    }

    let pedido = carga.pedidos.find((item) => item.numeroUnico === linha.NUNOTA);
    if (!pedido) {
      pedido = {
        numeroUnico: linha.NUNOTA,
        cliente: {
          codigo: linha.CODPARC,
          nome: linha.CLIENTE,
          endereco: {
            logradouro: linha.LOGRADOURO,
            numero: linha.NUMEND,
            complemento: linha.COMPLEMENTO,
            bairro: linha.BAIRRO,
            cidade: linha.CIDADE,
            uf: linha.UF,
            cep: linha.CEP,
          },
        },
        dataNegociacao: linha.DTNEG,
        statusNota: linha.STATUSNOTA,
        pendente: linha.PENDENTE,
        dataEntrega: linha.AD_DTENTREGA,
        statusEntrega: linha.AD_SITENTREGUE,
        observacaoStatusEntrega: linha.AD_OBSSITENTREGUE,
        sequenciaCarga: linha.SEQCARGA,
        valorNota: linha.VLRNOTA,
        pesoBruto: linha.PESO_BRUTO_PEDIDO,
        itens: [],
      };
      carga.pedidos.push(pedido);
    }

    pedido.itens.push({
      sequencia: linha.SEQUENCIA,
      codigoProduto: linha.CODPROD,
      descricao: linha.DESCRPROD,
      quantidade: linha.QTDNEG,
      valorUnitario: linha.VLRUNIT,
      valorTotal: linha.VLRTOT,
      pesoItem: linha.PESO_ITEM,
      pesoBrutoUnitario: linha.PESO_BRUTO_UNITARIO,
      pesoLiquidoUnitario: linha.PESO_LIQ_UNITARIO,
      localOrigem: linha.CODLOCALORIG,
      controle: linha.CONTROLE,
    });
  }

  return {
    somenteLeitura: true,
    filtro: {
      empresa: codigoEmpresa,
      motorista: codigoMotorista,
      ordemCarga: ordemCarga,
      apenasCargasAbertas: true,
      apenasNaoEnviadasWms: true,
      apenasPedidosPendentes: true,
    },
    cargas: [...cargasPorCodigo.values()],
  };
}

/**
 * Consulta o vinculo de um pedido com a carga do motorista sem aplicar os
 * filtros de pedido aberto. Isso permite validar a baixa e confirmar o
 * resultado mesmo depois que o Sankhya fecha o pedido.
 */
export async function consultarPedidoEntrega({ empresa, motorista, oc, pedido } = {}) {
  const codigoEmpresa = inteiroPositivo('empresa', empresa);
  const codigoMotorista = inteiroPositivo('motorista', motorista);
  const ordemCarga = inteiroPositivo('oc', oc);
  const numeroPedido = inteiroPositivo('pedido', pedido);
  const sql = `
SELECT TOP 1
    O.CODEMP,
    O.ORDEMCARGA AS CODIGO_OC,
    O.SITUACAO AS SITUACAO_OC,
    O.ENVIOWMS,
    O.CODPARCMOTORISTA,
    C.NUNOTA,
    C.STATUSNOTA,
    C.PENDENTE,
    C.AD_DTENTREGA,
    C.AD_SITENTREGUE,
    C.AD_OBSSITENTREGUE
FROM SANKHYA.TGFORD O
JOIN SANKHYA.TGFCAB C
  ON C.ORDEMCARGA = O.ORDEMCARGA
 AND C.CODEMP = O.CODEMP
WHERE O.CODEMP = ${codigoEmpresa}
  AND O.CODPARCMOTORISTA = ${codigoMotorista}
  AND O.ORDEMCARGA = ${ordemCarga}
  AND C.NUNOTA = ${numeroPedido};
`;
  const resultado = await executarSQL(sql);
  const bruto = resultado.registros?.[0];
  if (!bruto) return null;
  const linha = Object.fromEntries(
    Object.entries(bruto).map(([chave, valor]) => [chave, limpar(valor)])
  );
  return {
    empresa: linha.CODEMP,
    oc: linha.CODIGO_OC,
    situacaoOc: linha.SITUACAO_OC,
    envioWms: linha.ENVIOWMS,
    motorista: linha.CODPARCMOTORISTA,
    pedido: linha.NUNOTA,
    statusNota: linha.STATUSNOTA,
    pendente: linha.PENDENTE,
    dataEntrega: linha.AD_DTENTREGA,
    statusEntrega: linha.AD_SITENTREGUE,
    observacaoStatusEntrega: linha.AD_OBSSITENTREGUE,
  };
}

const executadoDiretamente = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (executadoDiretamente) {
  const resposta = await consultarCargas({
    empresa: argumento('empresa', '2'),
    motorista: argumento('motorista', '41850'),
    oc: argumento('oc'),
  });
  console.log(JSON.stringify(resposta, null, 2));
}
