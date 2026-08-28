/**
 * Integra a baixa de entrega pela mesma acao oficial usada em Ordens de Carga.
 * Nao executa SQL de escrita e nao recebe nomes de servico do navegador.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projeto = path.resolve(__dirname, '..');

function carregarEnvLocal(arquivo) {
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

carregarEnvLocal(path.join(projeto, '.env'));
carregarEnvLocal(path.join(projeto, 'app', '.env'));

// O proxy local e o caminho padrao de producao; o .env pode sobrescreve-lo.
const PROXY_URL = String(
  process.env.SANKHYA_ACTION_PROXY_URL || 'http://127.0.0.1:13000/service'
).trim();
const PROXY_TOKEN = String(process.env.SANKHYA_ACTION_PROXY_TOKEN || '').trim();
const GATEWAY_URL = String(
  process.env.SANKHYA_GATEWAY_URL || 'https://api.sankhya.com.br/gateway/v1/mge/service.sbr'
).trim();
const AUTH_URL = String(process.env.SANKHYA_AUTH_URL || 'https://api.sankhya.com.br/authenticate').trim();

let token = null;
let tokenExpiraEm = 0;

function inteiroPositivo(nome, valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) throw new Error(`${nome} inválido.`);
  return numero;
}

function dataEntregaValida(dataEntrega) {
  const texto = String(dataEntrega || '').trim();
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('A data de entrega deve estar no formato YYYY-MM-DD.');
  const [, ano, mes, dia] = match;
  const data = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto) {
    throw new Error('A data de entrega é inválida.');
  }
  return `${dia}/${mes}/${ano}`;
}

export function montarRequisicaoBaixa({ empresa, oc, pedido, dataEntrega }) {
  return {
    javaCall: {
      actionID: '4',
      refreshType: 'SEL',
      masterEntityName: 'OrdemCarga',
      params: {
        param: [
          { type: 'S', paramName: 'ENTREGA', $: '2' },
          { type: 'D', paramName: 'DTENTREGA', $: dataEntregaValida(dataEntrega) },
        ],
      },
    },
    rows: {
      row: [
        {
          master: 'S',
          entityName: 'OrdemCarga',
          field: [
            { fieldName: 'CODEMP', $: String(inteiroPositivo('Empresa', empresa)) },
            { fieldName: 'ORDEMCARGA', $: String(inteiroPositivo('OC', oc)) },
          ],
        },
        { field: [{ fieldName: 'NUNOTA', $: String(inteiroPositivo('Pedido', pedido)) }] },
      ],
    },
  };
}

function erroDaResposta(dados) {
  return dados?.responseBody?.tsException?.message
    || dados?.responseBody?.tsException?.detail
    || dados?.statusMessage
    || null;
}

function respostaAceita(dados) {
  const status = String(dados?.status ?? '0');
  // A acao 4 retorna status 1 mesmo quando conclui, como registrado no HAR.
  return status === '0' || (status === '1' && !erroDaResposta(dados));
}

async function obterToken() {
  if (token && Date.now() < tokenExpiraEm) return token;
  const clientId = String(process.env.SANKHYA_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.SANKHYA_CLIENT_SECRET || '').trim();
  const appkey = String(process.env.SANKHYA_APPKEY || '').trim();
  if (!clientId || !clientSecret || !appkey) {
    throw new Error('A integração de baixa não está configurada no servidor.');
  }

  const resposta = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'X-Token': appkey },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.access_token) throw new Error('Não foi possível autenticar a integração de baixa.');
  token = dados.access_token;
  tokenExpiraEm = Date.now() + 280 * 1000;
  return token;
}

async function executarViaProxy(requestBody) {
  const headers = { 'Content-Type': 'application/json' };
  if (PROXY_TOKEN) headers['x-api-key'] = PROXY_TOKEN;
  const resposta = await fetch(PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      serviceName: 'ActionButtonsSP.executeJava',
      outputType: 'json',
      requestBody,
      clientEventList: { clientEvent: [{ $: 'br.com.sankhya.actionbutton.clientconfirm' }] },
    }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error('O serviço Sankhya não aceitou a baixa.');
  const resultado = dados.resultado || dados;
  if (!respostaAceita(resultado)) throw new Error('O Sankhya recusou a baixa de entrega.');
  return resultado;
}

async function executarDireto(requestBody) {
  const resposta = await fetch(`${GATEWAY_URL}?serviceName=ActionButtonsSP.executeJava&outputType=json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await obterToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceName: 'ActionButtonsSP.executeJava',
      requestBody,
      clientEventList: { clientEvent: [{ $: 'br.com.sankhya.actionbutton.clientconfirm' }] },
    }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !respostaAceita(dados)) throw new Error('O Sankhya recusou a baixa de entrega.');
  return dados;
}

export async function executarBaixaEntrega({ empresa, oc, pedido, dataEntrega }) {
  const requestBody = montarRequisicaoBaixa({ empresa, oc, pedido, dataEntrega });
  if (PROXY_URL) return executarViaProxy(requestBody);

  // Permite homologação direta no mesmo host do sankhya-mcp, sem expor o
  // serviço genérico ao navegador. As credenciais ficam somente no ambiente.
  const diretorioMcp = process.env.SANKHYA_MCP_DIR
    ? path.resolve(process.env.SANKHYA_MCP_DIR)
    : path.resolve(projeto, '..', 'sankhya-mcp');
  if (existsSync(path.join(diretorioMcp, '.env'))) carregarEnvLocal(path.join(diretorioMcp, '.env'));
  return executarDireto(requestBody);
}

export { dataEntregaValida };
