import http from 'node:http';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultarCargas, consultarPedidoEntrega } from '../scripts/consulta-app-motorista-readonly.mjs';
import { executarBaixaEntrega, dataEntregaValida } from '../scripts/sankhya-baixa-entrega.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function carregarEnvLocal() {
  const arquivos = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
  const arquivo = arquivos.find((caminho) => existsSync(caminho));
  if (!arquivo) return;
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

const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const evidenceDir = path.join(dataDir, 'evidencias');
const evidenceManifest = path.join(dataDir, 'evidencias.json');
const port = Number(process.env.PORT || 4173);
const sessionMaxAge = 12 * 60 * 60;
const sessions = new Map();
const baixaAtiva = String(process.env.SANKHYA_BAIXA_ATIVA || '').toLowerCase() === 'true';
const baixasEmAndamento = new Set();

// Credenciais e identidade do piloto. Em produção, defina todas as variáveis no ambiente.
const pilotUser = String(process.env.APP_DRIVER_USER || 'silas').trim().toLowerCase();
const pilotPassword = String(process.env.APP_DRIVER_PASSWORD || '');
const pilotDriver = {
  id: Number(process.env.APP_DRIVER_CODPARC || 41850),
  nome: String(process.env.APP_DRIVER_NOME || 'SILAS HENRIQUE DE OLIVEIRA').trim(),
  empresa: Number(process.env.APP_DRIVER_CODEMP || 2),
  empresaNome: String(process.env.APP_DRIVER_EMPRESA || 'Industria - GTM Beneficiadora').trim(),
  vinculo: String(process.env.APP_DRIVER_VINCULO || 'motorista').trim().toLowerCase(),
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function responderJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function responderErro(res, status, mensagem) {
  responderJson(res, status, { erro: mensagem });
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([nome, valor]) => nome && valor)
      .map(([nome, ...valor]) => [nome, decodeURIComponent(valor.join('='))]),
  );
}

function definirCookie(res, token, maxAge = sessionMaxAge) {
  res.setHeader('Set-Cookie', `gtm_motorista_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function segredoIgual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function criarSessao() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...pilotDriver, usuario: pilotUser, expiraEm: Date.now() + sessionMaxAge * 1000 });
  return token;
}

function sessaoAtual(req) {
  const token = parseCookies(req).gtm_motorista_session;
  const sessao = token ? sessions.get(token) : null;
  if (!sessao) return null;
  if (sessao.expiraEm <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { ...sessao, token };
}

function exigirSessao(req, res) {
  const sessao = sessaoAtual(req);
  if (!sessao) responderErro(res, 401, 'Faça login para acessar o aplicativo.');
  return sessao;
}

async function lerJson(req, limite = 18 * 1024 * 1024) {
  const partes = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > limite) throw new Error('A solicitação excede o limite permitido.');
    partes.push(parte);
  }
  if (!partes.length) return {};
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

function limparTexto(valor, limite = 300) {
  return String(valor ?? '').trim().slice(0, limite);
}

function numeroSeguro(valor, nome) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`${nome} inválido.`);
  return numero;
}

function inteiroPositivo(valor, nome) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) throw new Error(`${nome} inválido.`);
  return numero;
}

function dataHojeLocal() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora);
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function decodificarImagem(dataUrl, nome) {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error(`${nome} precisa ser uma imagem válida.`);
  const mime = match[1].toLowerCase().replace('jpg', 'jpeg');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error(`${nome} excede o limite de 5 MB.`);
  const extensao = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, mime, extensao };
}

async function lerEvidencias() {
  try {
    const conteudo = await fs.readFile(evidenceManifest, 'utf8');
    const dados = JSON.parse(conteudo);
    return Array.isArray(dados) ? dados : [];
  } catch (erro) {
    if (erro.code === 'ENOENT') return [];
    throw erro;
  }
}

async function gravarEvidencias(evidencias) {
  await fs.writeFile(evidenceManifest, JSON.stringify(evidencias, null, 2), 'utf8');
}

async function localizarEvidencia(id, sessao) {
  const evidencias = await lerEvidencias();
  const indice = evidencias.findIndex((item) => item.id === id && item.usuario === sessao.usuario);
  return { evidencias, indice, evidencia: indice >= 0 ? evidencias[indice] : null };
}

async function salvarArquivoImagem(dataUrl, nome, id) {
  const imagem = decodificarImagem(dataUrl, nome);
  if (!imagem) return null;
  const arquivo = `${id}-${nome}.${imagem.extensao}`;
  await fs.writeFile(path.join(evidenceDir, arquivo), imagem.buffer);
  return { arquivo, mime: imagem.mime };
}

async function servirArquivo(res, pathname) {
  const relativo = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const arquivo = path.resolve(publicDir, relativo);
  if (!arquivo.startsWith(`${publicDir}${path.sep}`)) {
    responderErro(res, 400, 'Caminho inválido.');
    return;
  }

  try {
    const conteudo = await fs.readFile(arquivo);
    const tipo = contentTypes[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(conteudo);
  } catch (erro) {
    responderErro(res, erro.code === 'ENOENT' ? 404 : 500, erro.code === 'ENOENT' ? 'Arquivo não encontrado.' : 'Falha ao carregar o aplicativo.');
  }
}

function consultarEmProcessoNovo({ empresa, motorista, oc }) {
  const script = path.join(__dirname, '..', 'scripts', 'consulta-app-motorista-readonly.mjs');
  const argumentos = [script, '--empresa', String(empresa), '--motorista', String(motorista)];
  if (oc !== null && oc !== undefined && oc !== '') argumentos.push('--oc', String(oc));

  return new Promise((resolve, reject) => {
    const processo = spawn(process.execPath, argumentos, {
      cwd: path.resolve(__dirname, '..'),
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      processo.kill();
      reject(new Error('Tempo excedido ao renovar a consulta do Sankhya.'));
    }, 30000);

    processo.stdout.on('data', (parte) => { stdout += parte.toString(); });
    processo.stderr.on('data', (parte) => { stderr += parte.toString(); });
    processo.on('error', (erro) => {
      clearTimeout(timer);
      reject(erro);
    });
    processo.on('close', (codigo) => {
      clearTimeout(timer);
      const inicioJson = stdout.lastIndexOf('\n{');
      const textoJson = (inicioJson >= 0 ? stdout.slice(inicioJson + 1) : stdout).trim();
      if (codigo !== 0) return reject(new Error(stderr.trim() || 'Não foi possível renovar a consulta do Sankhya.'));
      try {
        resolve(JSON.parse(textoJson));
      } catch {
        reject(new Error('O Sankhya retornou uma resposta inesperada ao renovar a consulta.'));
      }
    });
  });
}

async function consultarCargasComRenovacao(filtros) {
  try {
    return await consultarCargas(filtros);
  } catch (erro) {
    if (!/não autorizado|nao autorizado|unauthorized|status 3|401/i.test(String(erro.message))) throw erro;
    console.warn('Sessão OAuth do Sankhya recusada; renovando a consulta em processo isolado.');
    return consultarEmProcessoNovo(filtros);
  }
}

async function servirEvidencia(res, req, id, tipo) {
  const sessao = exigirSessao(req, res);
  if (!sessao) return;
  const evidencias = await lerEvidencias();
  const evidencia = evidencias.find((item) => item.id === id && item.usuario === sessao.usuario);
  const arquivo = evidencia?.arquivos?.[tipo];
  if (!arquivo) return responderErro(res, 404, 'Evidência não encontrada.');
  try {
    const conteudo = await fs.readFile(path.join(evidenceDir, arquivo.arquivo));
    res.writeHead(200, { 'Content-Type': arquivo.mime, 'Cache-Control': 'private, max-age=3600' });
    res.end(conteudo);
  } catch {
    responderErro(res, 404, 'Arquivo da evidência não encontrado.');
  }
}

async function atender(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    let body;
    try {
      body = await lerJson(req, 64 * 1024);
    } catch {
      return responderErro(res, 400, 'Dados de login inválidos.');
    }
    const usuario = limparTexto(body.usuario, 80).toLowerCase();
    const senha = String(body.senha ?? '');
    if (!usuario || !senha) return responderErro(res, 400, 'Informe usuário e senha.');
    if (!pilotPassword) return responderErro(res, 503, 'A autenticação ainda não foi configurada no servidor.');
    if (!segredoIgual(usuario, pilotUser) || !segredoIgual(senha, pilotPassword)) {
      return responderErro(res, 401, 'Usuário ou senha inválidos.');
    }
    const token = criarSessao();
    definirCookie(res, token);
    return responderJson(res, 200, { motorista: pilotDriver, usuario: pilotUser, ambiente: 'piloto operacional', baixaHabilitada: baixaAtiva });
  }

  if (req.method === 'GET' && url.pathname === '/api/sessao') {
    const sessao = exigirSessao(req, res);
    if (!sessao) return;
    return responderJson(res, 200, { motorista: pilotDriver, usuario: sessao.usuario, ambiente: 'piloto operacional', baixaHabilitada: baixaAtiva });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = parseCookies(req).gtm_motorista_session;
    if (token) sessions.delete(token);
    definirCookie(res, '', 0);
    return responderJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/cargas') {
    const sessao = exigirSessao(req, res);
    if (!sessao) return;
    try {
      const dados = await consultarCargasComRenovacao({
        empresa: sessao.empresa,
        motorista: sessao.id,
        vinculo: sessao.vinculo,
        oc: url.searchParams.get('oc') || null,
      });
      return responderJson(res, 200, dados);
    } catch (erro) {
      return responderErro(res, 400, erro.message);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/evidencias') {
    const sessao = exigirSessao(req, res);
    if (!sessao) return;
    const dados = await lerEvidencias();
    return responderJson(res, 200, dados.filter((item) => item.usuario === sessao.usuario));
  }

  const arquivoMatch = url.pathname.match(/^\/api\/evidencias\/([a-f0-9-]+)\/arquivo\/(nota|entrega|assinatura)$/i);
  if (req.method === 'GET' && arquivoMatch) {
    return servirEvidencia(res, req, arquivoMatch[1], arquivoMatch[2].toLowerCase());
  }

  if (req.method === 'POST' && url.pathname === '/api/evidencias') {
    const sessao = exigirSessao(req, res);
    if (!sessao) return;
    let body;
    try {
      body = await lerJson(req);
      const latitude = numeroSeguro(body.latitude, 'Latitude');
      const longitude = numeroSeguro(body.longitude, 'Longitude');
      const accuracy = body.accuracy === undefined || body.accuracy === null ? null : numeroSeguro(body.accuracy, 'Precisão');
      const oc = limparTexto(body.oc, 30);
      const pedido = limparTexto(body.pedido, 30);
      const dataEntrega = limparTexto(body.dataEntrega || dataHojeLocal(), 10);
      dataEntregaValida(dataEntrega);
      if (!oc || !pedido) throw new Error('Informe a ordem de carga e o pedido.');
      if (!body.fotoNota || !body.fotoEntrega || !body.assinatura) throw new Error('Foto da nota, foto da entrega e assinatura são obrigatórias.');

      const id = crypto.randomUUID();
      const arquivos = {
        nota: await salvarArquivoImagem(body.fotoNota, 'nota', id),
        entrega: await salvarArquivoImagem(body.fotoEntrega, 'entrega', id),
        assinatura: await salvarArquivoImagem(body.assinatura, 'assinatura', id),
      };
      const evidencia = {
        id,
        usuario: sessao.usuario,
        motorista: sessao.id,
        empresa: sessao.empresa,
        oc,
        pedido,
        dataEntrega,
        latitude,
        longitude,
        accuracy,
        observacao: limparTexto(body.observacao, 1000),
        criadoEm: new Date().toISOString(),
        status: 'EVIDENCIA_SALVA',
        baixa: {
          status: 'PENDENTE',
          tentativas: 0,
          atualizadoEm: new Date().toISOString(),
        },
        arquivos,
      };
      const evidencias = await lerEvidencias();
      evidencias.unshift(evidencia);
      await gravarEvidencias(evidencias);
      return responderJson(res, 201, evidencia);
    } catch (erro) {
      return responderErro(res, 400, erro.message || 'Não foi possível salvar a evidência.');
    }
  }

  const baixaMatch = url.pathname.match(/^\/api\/evidencias\/([a-f0-9-]+)\/baixa$/i);
  if (req.method === 'POST' && baixaMatch) {
    const sessao = exigirSessao(req, res);
    if (!sessao) return;
    const id = baixaMatch[1];
    if (baixasEmAndamento.has(id)) return responderErro(res, 409, 'Esta baixa já está sendo processada.');
    if (!baixaAtiva) return responderErro(res, 503, 'A baixa oficial ainda não foi habilitada no servidor.');

    const local = await localizarEvidencia(id, sessao);
    if (!local.evidencia) return responderErro(res, 404, 'Evidência não encontrada.');
    const evidencia = local.evidencia;
    if (evidencia.baixa?.status === 'CONFIRMADA') return responderJson(res, 200, evidencia);

    let body = {};
    try { body = await lerJson(req, 64 * 1024); } catch { return responderErro(res, 400, 'Dados da baixa inválidos.'); }
    const dataEntrega = limparTexto(body.dataEntrega || evidencia.dataEntrega || dataHojeLocal(), 10);
    try {
      dataEntregaValida(dataEntrega);
      inteiroPositivo(evidencia.oc, 'Ordem de carga');
      inteiroPositivo(evidencia.pedido, 'Pedido');
    } catch (erro) {
      return responderErro(res, 400, erro.message);
    }

    baixasEmAndamento.add(id);
    try {
      const registroAntes = await consultarPedidoEntrega({
        empresa: sessao.empresa,
        motorista: sessao.id,
        vinculo: sessao.vinculo,
        oc: evidencia.oc,
        pedido: evidencia.pedido,
      });
      if (!registroAntes) return responderErro(res, 409, 'O pedido não está vinculado à carga deste motorista.');

      // Se a tela do Sankhya já concluiu a entrega, apenas sincroniza o
      // comprovante local. Isso torna o retry seguro e evita duplicidade.
      if (String(registroAntes.statusEntrega) === '2') {
        evidencia.status = 'BAIXA_CONFIRMADA';
        evidencia.dataEntrega = dataEntrega;
        evidencia.baixa = {
          ...(evidencia.baixa || {}),
          status: 'CONFIRMADA',
          dataEntrega,
          confirmadoEm: evidencia.baixa?.confirmadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        local.evidencias[local.indice] = evidencia;
        await gravarEvidencias(local.evidencias);
        return responderJson(res, 200, evidencia);
      }

      if (String(registroAntes.situacaoOc) !== 'A' || String(registroAntes.envioWms) !== 'N') {
        return responderErro(res, 409, 'A carga não está aberta e fora do WMS para receber esta baixa.');
      }
      if (!['A', 'L'].includes(String(registroAntes.statusNota)) || String(registroAntes.pendente) !== 'S') {
        return responderErro(res, 409, 'O pedido não está pendente para baixa de entrega.');
      }

      evidencia.status = 'BAIXA_PROCESSANDO';
      evidencia.dataEntrega = dataEntrega;
      evidencia.baixa = {
        ...(evidencia.baixa || {}),
        status: 'PROCESSANDO',
        dataEntrega,
        tentativas: Number(evidencia.baixa?.tentativas || 0) + 1,
        atualizadoEm: new Date().toISOString(),
        mensagem: null,
      };
      local.evidencias[local.indice] = evidencia;
      await gravarEvidencias(local.evidencias);

      await executarBaixaEntrega({ empresa: sessao.empresa, oc: evidencia.oc, pedido: evidencia.pedido, dataEntrega });

      const registroDepois = await consultarPedidoEntrega({
        empresa: sessao.empresa,
        motorista: sessao.id,
        vinculo: sessao.vinculo,
        oc: evidencia.oc,
        pedido: evidencia.pedido,
      });
      if (String(registroDepois?.statusEntrega) !== '2') {
        throw new Error('A ação foi enviada, mas a confirmação ainda não apareceu na consulta do Sankhya.');
      }

      evidencia.status = 'BAIXA_CONFIRMADA';
      evidencia.baixa = {
        ...(evidencia.baixa || {}),
        status: 'CONFIRMADA',
        dataEntrega,
        confirmadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        mensagem: null,
      };
      local.evidencias[local.indice] = evidencia;
      await gravarEvidencias(local.evidencias);
      return responderJson(res, 200, evidencia);
    } catch (erro) {
      evidencia.status = 'BAIXA_PENDENTE';
      evidencia.baixa = {
        ...(evidencia.baixa || {}),
        status: 'ERRO',
        dataEntrega,
        atualizadoEm: new Date().toISOString(),
        mensagem: String(erro.message || 'Falha ao confirmar a baixa.').slice(0, 240),
      };
      local.evidencias[local.indice] = evidencia;
      await gravarEvidencias(local.evidencias).catch(() => {});
      console.error(`[baixa] falha OC ${evidencia.oc} pedido ${evidencia.pedido}:`, erro.message);
      return responderErro(res, 502, 'A evidência foi preservada, mas não foi possível confirmar a baixa. Tente sincronizar novamente.');
    } finally {
      baixasEmAndamento.delete(id);
    }
  }

  if (req.method !== 'GET') return responderErro(res, 405, 'Método não permitido.');
  return servirArquivo(res, url.pathname);
}

await fs.mkdir(evidenceDir, { recursive: true });

const server = http.createServer((req, res) => {
  atender(req, res).catch((erro) => {
    console.error(erro);
    if (!res.headersSent) responderErro(res, 500, 'Falha inesperada no aplicativo.');
    else res.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Aplicativo do motorista em http://127.0.0.1:${port}`);
  console.log('Consulta Sankhya: somente leitura. Evidências: armazenamento local do piloto.');
});
