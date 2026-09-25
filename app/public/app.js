const state = {
  sessao: null,
  config: { baixaHabilitada: false },
  dados: null,
  evidencias: [],
  pedidoSelecionado: null,
  fotos: { nota: '', entrega: '' },
  coordenadas: null,
  assinatura: '',
  assinaturaDesenhada: false,
  alvoCamera: null,
  streamCamera: null,
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

function formatMoney(value) { return money.format(Number(value || 0)); }
function formatNumber(value) { return number.format(Number(value || 0)); }

function formatDate(value) {
  if (!value) return 'Sem data prevista';
  const text = String(value);
  const match = text.match(/^(\d{2})(\d{2})(\d{4})/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : escapeHtml(text);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function addressLine(endereco) {
  if (!endereco) return 'Endereço não informado';
  const parts = [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(', '),
    endereco.bairro,
    [endereco.cidade, endereco.uf].filter(Boolean).join(' - '),
  ].filter(Boolean);
  return escapeHtml(parts.join(' | ') || 'Endereço não informado');
}

function allOrders(data) { return (data?.cargas || []).flatMap((carga) => carga.pedidos || []); }

function descricaoStatusEntrega(status) {
  if (String(status) === '2') return 'Entregue';
  if (String(status) === '1') return 'Não entregue';
  return 'Aguardando entrega';
}

function showToast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast toast--${type}`;
  item.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle-2' : 'alert-circle'}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  $('#toast-stack').append(item);
  window.lucide?.createIcons();
  window.setTimeout(() => item.remove(), 4200);
}

function setSyncState(text, stateName = 'ok') {
  const element = $('#sync-state');
  element.className = `sync-state sync-state--${stateName}`;
  element.querySelector('span:last-child').textContent = text;
}

function showLogin() {
  state.sessao = null;
  $('#app-view').classList.add('is-hidden');
  $('#login-view').classList.remove('is-hidden');
  $('#login-password').value = '';
}

function showApp(session) {
  if (session.perfil === 'admin') { window.location.assign('/admin.html'); return; }
  state.sessao = session;
  state.config = { baixaHabilitada: Boolean(session.baixaHabilitada) };
  $('#login-view').classList.add('is-hidden');
  $('#app-view').classList.remove('is-hidden');
  $('#driver-name').textContent = `${session.motorista.nome} · Motorista vinculado`;
  $('#company-name').textContent = session.motorista.empresaNome;
  $('#session-label').textContent = session.motorista.nome.split(' ').slice(0, 2).join(' ');
}

function renderMetrics(data) {
  const pedidos = allOrders(data);
  const peso = pedidos.reduce((total, pedido) => total + Number(pedido.pesoBruto || 0), 0);
  const valor = pedidos.reduce((total, pedido) => total + Number(pedido.valorNota || 0), 0);
  $('#metric-loads').textContent = data.cargas.length;
  $('#metric-orders').textContent = pedidos.length;
  $('#metric-weight').textContent = `${formatNumber(peso)} kg`;
  $('#metric-value').textContent = formatMoney(valor);
  $('#load-count').textContent = `${data.cargas.length} ${data.cargas.length === 1 ? 'carga' : 'cargas'}`;
}

function renderOrder(pedido, carga) {
  const detailId = `detail-${pedido.numeroUnico}`;
  const numeroExibicao = pedido.numeroNota || pedido.numeroUnico;
  const items = (pedido.itens || []).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.codigoProduto)}</strong><br>${escapeHtml(item.descricao || 'Produto sem descrição')}</td>
      <td>${formatNumber(item.quantidade)}</td>
      <td>${formatNumber(item.pesoBrutoUnitario)} kg</td>
      <td>${formatMoney(item.valorTotal)}</td>
    </tr>
  `).join('');
  const pedidoData = encodeURIComponent(JSON.stringify({ numeroUnico: pedido.numeroUnico, numeroNota: pedido.numeroNota, cliente: pedido.cliente?.nome || '' }));

  return `
    <article class="order-row">
      <div class="order-row__identity"><h3>NF-e ${escapeHtml(numeroExibicao)}</h3><p>Nro. único ${escapeHtml(pedido.numeroUnico)} · ${escapeHtml(pedido.cliente?.nome || 'Cliente não informado')}</p></div>
      <div class="order-row__address"><strong>Entrega</strong>${addressLine(pedido.cliente?.endereco)}</div>
      <div class="order-row__action">
        <div class="order-row__total"><strong>${formatMoney(pedido.valorNota)}</strong>${formatNumber(pedido.pesoBruto)} kg bruto</div>
        <button class="button button--quiet detail-toggle" type="button" data-target="${detailId}" aria-expanded="false">Ver detalhes<i data-lucide="chevron-down" aria-hidden="true"></i></button>
      </div>
      <div class="order-detail" id="${detailId}">
        <div class="order-detail__grid">
          <div class="detail-block"><span class="detail-block__label">Itens da nota</span><table class="items-table"><thead><tr><th>Produto</th><th>Qtd.</th><th>Peso</th><th>Total</th></tr></thead><tbody>${items || '<tr><td colspan="4">Nenhum item localizado.</td></tr>'}</tbody></table></div>
          <div class="detail-block"><span class="detail-block__label">Controle da entrega</span><p>Status NF-e: <strong>Aprovada</strong></p><p>Status da entrega: <strong>${descricaoStatusEntrega(pedido.statusEntrega)}</strong></p><p>Origem do estoque: <strong>${escapeHtml(pedido.itens?.[0]?.localOrigem || 'Não informado')}</strong></p><div class="detail-footer"><button class="button button--primary evidence-open" type="button" data-oc="${escapeHtml(carga.codigo)}" data-pedido="${pedidoData}"><i data-lucide="camera" aria-hidden="true"></i>Registrar evidência</button></div></div>
        </div>
      </div>
    </article>
  `;
}

function renderLoads(data) {
  const container = $('#loads');
  if (!data.cargas.length) {
    container.innerHTML = '<div class="empty-state"><strong>Nenhuma carga aberta</strong><span>Atualize a consulta ou aguarde uma nova atribuição.</span></div>';
    return;
  }
  container.innerHTML = data.cargas.map((carga) => `
    <article class="load-card">
      <header class="load-card__header"><div><div class="load-card__title"><h3>OC ${escapeHtml(carga.codigo)}</h3><span class="badge badge--green">Aberta</span></div><p class="load-card__sub">Saída: ${formatDate(carga.previsaoSaida)} · ${carga.pedidos.length} ${carga.pedidos.length === 1 ? 'nota aprovada' : 'notas aprovadas'}</p></div><div class="load-card__badges"><span class="badge badge--amber">Não enviado ao WMS</span><span class="badge badge--green">${escapeHtml(carga.transportadora || 'Transportadora não informada')}</span></div></header>
      <div class="orders">${carga.pedidos.map((pedido) => renderOrder(pedido, carga)).join('')}</div>
    </article>
  `).join('');
  window.lucide?.createIcons();
}

async function carregar() {
  if (!state.sessao) return;
  const oc = $('#oc-input').value.trim();
  const query = new URLSearchParams();
  if (oc) query.set('oc', oc);
  setSyncState('Sincronizando', 'loading');
  $('#loads').innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Buscando cargas...</span></div>';
  try {
    const resposta = await fetch(`/api/cargas?${query}`, { credentials: 'same-origin' });
    const data = await resposta.json();
    if (resposta.status === 401) { showLogin(); return; }
    if (!resposta.ok) throw new Error(data.erro || 'Falha ao consultar as cargas.');
    state.dados = data;
    renderMetrics(data);
    renderLoads(data);
    setSyncState(`Atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
  } catch (erro) {
    $('#loads').innerHTML = `<div class="error-state"><strong>Falha na sincronização</strong><span>${escapeHtml(erro.message)}</span></div>`;
    setSyncState('Falha na sincronização', 'error');
  }
}

function resetEvidence() {
  state.pedidoSelecionado = null;
  state.fotos = { nota: '', entrega: '' };
  state.coordenadas = null;
  state.assinatura = '';
  state.assinaturaDesenhada = false;
  $('#evidence-note').value = '';
  const date = new Date();
  const offset = date.getTimezoneOffset();
  $('#evidence-date').value = new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  ['nota', 'entrega'].forEach((tipo) => {
    $(`#photo-preview-${tipo}`).src = '';
    $(`#photo-preview-${tipo}`).classList.add('is-hidden');
    $(`#photo-empty-${tipo}`).classList.remove('is-hidden');
    $(`#photo-status-${tipo}`).textContent = 'Obrigatória';
  });
  $('#location-status').textContent = 'Obrigatória';
  $('#location-result').classList.add('is-hidden');
  $('#location-result').innerHTML = '';
  const pad = $('#signature-pad');
  if (pad) pad.getContext('2d').clearRect(0, 0, pad.width, pad.height);
  updateChecklist();
}

function openEvidence(oc, encodedPedido) {
  let pedido;
  try { pedido = JSON.parse(decodeURIComponent(encodedPedido)); } catch { pedido = { numeroUnico: encodedPedido }; }
  resetEvidence();
  state.pedidoSelecionado = { oc, pedido };
  const numeroExibicao = pedido.numeroNota || pedido.numeroUnico;
  $('#evidence-order-label').textContent = `OC ${oc} · NF-e ${numeroExibicao} · Nro. único ${pedido.numeroUnico}${pedido.cliente ? ` · ${pedido.cliente}` : ''}`;
  $('#evidence-panel').classList.remove('is-hidden');
  $('#evidence-panel').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function updateChecklist() {
  const itens = {
    nota: Boolean(state.fotos.nota),
    entrega: Boolean(state.fotos.entrega),
    assinatura: state.assinaturaDesenhada,
    localizacao: Boolean(state.coordenadas),
  };
  Object.entries(itens).forEach(([chave, pronto]) => {
    const item = $(`#check-${chave}`);
    if (!item) return;
    item.classList.toggle('is-done', pronto);
    const icon = item.querySelector('i, svg');
    if (icon) icon.setAttribute('data-lucide', pronto ? 'check-circle-2' : 'circle');
  });
  $('#submit-evidence').disabled = !Object.values(itens).every(Boolean);
  window.lucide?.createIcons();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function compressImage(source) {
  return new Promise(async (resolve, reject) => {
    try {
      const dataUrl = typeof source === 'string' ? source : await readFileAsDataUrl(source);
      const image = new Image();
      image.onload = () => {
        const max = 1600;
        const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('Imagem inválida.'));
      image.src = dataUrl;
    } catch (erro) { reject(erro); }
  });
}

function setPhoto(tipo, value) {
  state.fotos[tipo] = value;
  const preview = $(`#photo-preview-${tipo}`);
  const empty = $(`#photo-empty-${tipo}`);
  const status = $(`#photo-status-${tipo}`);
  preview.src = value;
  preview.classList.toggle('is-hidden', !value);
  empty.classList.toggle('is-hidden', Boolean(value));
  status.textContent = value ? 'Imagem carregada' : 'Obrigatória';
  updateChecklist();
}

function stopCamera() {
  state.streamCamera?.getTracks().forEach((track) => track.stop());
  state.streamCamera = null;
  $('#camera-video').srcObject = null;
}

async function openCamera(tipo) {
  state.alvoCamera = tipo;
  $('#camera-title').textContent = tipo === 'nota' ? 'Capturar foto da nota' : 'Capturar foto da entrega';
  $('#camera-modal').classList.remove('is-hidden');
  $('#camera-status').textContent = 'Solicitando permissão da câmera...';
  $('#capture-button').disabled = true;
  $('#camera-video').classList.remove('is-hidden');
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#camera-video').classList.add('is-hidden');
    $('#camera-status').textContent = 'Câmera ao vivo indisponível. Escolha uma imagem do dispositivo.';
    return;
  }
  try {
    state.streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    $('#camera-video').srcObject = state.streamCamera;
    $('#camera-status').textContent = 'Câmera pronta. Enquadre a evidência e capture.';
    $('#capture-button').disabled = false;
  } catch {
    $('#camera-video').classList.add('is-hidden');
    $('#camera-status').textContent = 'Não foi possível abrir a câmera. Escolha uma imagem do dispositivo.';
  }
}

function closeCamera() {
  stopCamera();
  state.alvoCamera = null;
  $('#camera-modal').classList.add('is-hidden');
  $('#camera-file-input').value = '';
}

async function processCameraFile(file) {
  if (!file || !state.alvoCamera) return;
  try {
    setPhoto(state.alvoCamera, await compressImage(file));
    closeCamera();
  } catch (erro) { showToast(erro.message, 'error'); }
}

async function takeCameraPhoto() {
  const video = $('#camera-video');
  const canvas = $('#camera-canvas');
  if (!state.alvoCamera || !video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    setPhoto(state.alvoCamera, await compressImage(canvas.toDataURL('image/jpeg', 0.85)));
    closeCamera();
  } catch (erro) { showToast(erro.message, 'error'); }
}

function captureLocation() {
  if (!navigator.geolocation) return showToast('GPS indisponível neste dispositivo.', 'error');
  $('#location-button').disabled = true;
  $('#location-button span').textContent = 'Solicitando localização...';
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude, accuracy } = position.coords;
    state.coordenadas = { latitude, longitude, accuracy };
    $('#location-status').textContent = 'Capturada agora';
    $('#location-result').classList.remove('is-hidden');
    $('#location-result').innerHTML = `<strong>${latitude.toFixed(6)}, ${longitude.toFixed(6)}</strong><span>Precisão aproximada: ${Math.round(accuracy || 0)} m</span><a href="https://www.google.com/maps?q=${latitude},${longitude}" target="_blank" rel="noreferrer">Abrir no mapa</a>`;
    $('#location-button').disabled = false;
    $('#location-button span').textContent = 'Atualizar localização';
    updateChecklist();
    showToast('Localização capturada com precisão aproximada.', 'success');
  }, () => {
    $('#location-button').disabled = false;
    $('#location-button span').textContent = 'Solicitar localização';
    showToast('Não foi possível capturar o GPS. Verifique a permissão do dispositivo.', 'error');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

async function salvarEvidencia(event) {
  event.preventDefault();
  if (!state.pedidoSelecionado) return showToast('Selecione uma nota antes de salvar.', 'error');
  if (!state.fotos.nota || !state.fotos.entrega || !state.assinaturaDesenhada || !state.coordenadas) return showToast('Complete o checklist antes de salvar.', 'error');
  if (!$('#evidence-date').value) return showToast('Informe a data da entrega.', 'error');
  if (!window.confirm('Confirmar a entrega e solicitar a baixa oficial no Sankhya?')) return;
  const button = $('#submit-evidence');
  button.disabled = true;
  button.innerHTML = '<span class="spinner spinner--small"></span>Salvando evidência...';
  try {
    const resposta = await fetch('/api/evidencias', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      oc: state.pedidoSelecionado.oc,
      pedido: state.pedidoSelecionado.pedido.numeroUnico,
      dataEntrega: $('#evidence-date').value,
      fotoNota: state.fotos.nota,
      fotoEntrega: state.fotos.entrega,
      assinatura: state.assinatura,
      latitude: state.coordenadas.latitude,
      longitude: state.coordenadas.longitude,
      accuracy: state.coordenadas.accuracy,
      observacao: $('#evidence-note').value,
    }) });
    const data = await resposta.json();
    if (!resposta.ok) throw new Error(data.erro || 'Não foi possível salvar a evidência.');
    state.evidencias.unshift(data);
    renderEvidenceHistory();
    let baixa = data;
    try {
      const baixaResposta = await fetch(`/api/evidencias/${encodeURIComponent(data.id)}/baixa`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataEntrega: $('#evidence-date').value }) });
      baixa = await baixaResposta.json();
      if (!baixaResposta.ok) throw new Error(baixa.erro || 'Não foi possível confirmar a baixa.');
      const indice = state.evidencias.findIndex((item) => item.id === data.id);
      if (indice >= 0) state.evidencias[indice] = baixa;
      renderEvidenceHistory();
      showToast('Entrega confirmada e baixa registrada no Sankhya.', 'success');
    } catch (erro) {
      const indice = state.evidencias.findIndex((item) => item.id === data.id);
      if (indice >= 0 && baixa?.baixa) state.evidencias[indice] = baixa;
      renderEvidenceHistory();
      showToast(`Evidência salva. ${erro.message}`, 'error');
    }
    $('#evidence-panel').classList.add('is-hidden');
    resetEvidence();
  } catch (erro) {
    showToast(erro.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i data-lucide="check-circle-2" aria-hidden="true"></i>Salvar e confirmar entrega';
    updateChecklist();
    window.lucide?.createIcons();
  }
}

function renderEvidenceHistory() {
  const container = $('#evidence-history');
  $('#evidence-count').textContent = `${state.evidencias.length} ${state.evidencias.length === 1 ? 'registro' : 'registros'}`;
  if (!state.evidencias.length) {
    container.innerHTML = '<div class="empty-state"><strong>Nenhuma evidência registrada</strong><span>As confirmações locais aparecerão aqui.</span></div>';
    return;
  }
  container.innerHTML = state.evidencias.map((item) => {
    const status = item.baixa?.status === 'CONFIRMADA' ? 'Baixa confirmada' : item.baixa?.status === 'ERRO' ? 'Aguardando sincronização' : item.baixa?.status === 'PROCESSANDO' ? 'Sincronizando baixa' : 'Evidência salva';
    const acao = item.baixa?.status === 'CONFIRMADA' ? '' : `<button class="icon-button sync-evidence" type="button" data-id="${escapeHtml(item.id)}" title="Sincronizar baixa"><i data-lucide="refresh-cw" aria-hidden="true"></i></button>`;
    return `<article class="history-row"><div><strong>Nota ${escapeHtml(item.pedido)}</strong><span>OC ${escapeHtml(item.oc)} · ${formatDateTime(item.criadoEm)} · Entrega ${escapeHtml(item.dataEntrega || '-')}</span></div><div class="history-row__location"><i data-lucide="map-pin" aria-hidden="true"></i><span>${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}</span></div><div class="history-row__actions"><span class="badge ${item.baixa?.status === 'CONFIRMADA' ? 'badge--green' : 'badge--amber'}">${status}</span>${acao}<a class="icon-button" href="/api/evidencias/${item.id}/arquivo/entrega" target="_blank" rel="noreferrer" title="Abrir foto da entrega"><i data-lucide="image" aria-hidden="true"></i></a></div></article>`;
  }).join('');
  window.lucide?.createIcons();
}

async function carregarEvidencias() {
  const resposta = await fetch('/api/evidencias', { credentials: 'same-origin' });
  if (!resposta.ok) return;
  state.evidencias = await resposta.json();
  renderEvidenceHistory();
}

function initSignaturePad() {
  const pad = $('#signature-pad');
  const context = pad.getContext('2d');
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#17211e';
  let drawing = false;
  const point = (event) => {
    const rect = pad.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * pad.width, y: ((event.clientY - rect.top) / rect.height) * pad.height };
  };
  pad.addEventListener('pointerdown', (event) => { drawing = true; pad.setPointerCapture(event.pointerId); const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); });
  pad.addEventListener('pointermove', (event) => { if (!drawing) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); state.assinaturaDesenhada = true; state.assinatura = pad.toDataURL('image/png'); $('#signature-status').textContent = 'Assinatura carregada'; updateChecklist(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => pad.addEventListener(eventName, () => { drawing = false; }));
  $('#clear-signature').addEventListener('click', () => { context.clearRect(0, 0, pad.width, pad.height); state.assinatura = ''; state.assinaturaDesenhada = false; $('#signature-status').textContent = 'Obrigatória'; updateChecklist(); });
}

async function fazerLogin(event) {
  event.preventDefault();
  const button = $('#login-form button[type="submit"]');
  $('#login-error').textContent = '';
  button.disabled = true;
  try {
    const resposta = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: $('#login-user').value, senha: $('#login-password').value }) });
    const data = await resposta.json();
    if (!resposta.ok) throw new Error(data.erro || 'Não foi possível entrar.');
    if (data.perfil === 'admin') { window.location.assign('/admin.html'); return; }
    showApp(data);
    await Promise.all([carregar(), carregarEvidencias()]);
    showToast(`Bem-vindo, ${data.motorista.nome.split(' ')[0]}.`, 'success');
  } catch (erro) {
    $('#login-error').textContent = erro.message;
  } finally { button.disabled = false; }
}

async function restaurarSessao() {
  try {
    const resposta = await fetch('/api/sessao', { credentials: 'same-origin' });
    if (!resposta.ok) return;
    const data = await resposta.json();
    if (data.perfil === 'admin') { window.location.assign('/admin.html'); return; }
    showApp(data);
    await Promise.all([carregar(), carregarEvidencias()]);
  } catch { showLogin(); }
}

async function sair() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  closeCamera();
  showLogin();
}

$('#login-form').addEventListener('submit', fazerLogin);
$('#logout-button').addEventListener('click', sair);
$('#refresh-button').addEventListener('click', carregar);
$('#oc-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') carregar(); });
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const evidenceButton = target?.closest('.evidence-open');
  if (evidenceButton) {
    try {
      openEvidence(evidenceButton.dataset.oc, evidenceButton.dataset.pedido);
    } catch (erro) {
      console.error(erro);
      showToast('Não foi possível abrir o registro da evidência.', 'error');
    }
    return;
  }
  const syncButton = target?.closest('.sync-evidence');
  if (syncButton) {
    const evidencia = state.evidencias.find((item) => item.id === syncButton.dataset.id);
    if (!evidencia || evidencia.baixa?.status === 'CONFIRMADA') return;
    if (!window.confirm(`Confirmar a entrega da nota ${evidencia.pedido} e solicitar a baixa no Sankhya?`)) return;
    syncButton.disabled = true;
    syncButton.innerHTML = '<span class="spinner spinner--small"></span>';
    fetch(`/api/evidencias/${encodeURIComponent(evidencia.id)}/baixa`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataEntrega: evidencia.dataEntrega }) })
      .then(async (resposta) => {
        const data = await resposta.json();
        if (!resposta.ok) throw new Error(data.erro || 'Não foi possível confirmar a baixa.');
        const indice = state.evidencias.findIndex((item) => item.id === evidencia.id);
        if (indice >= 0) state.evidencias[indice] = data;
        renderEvidenceHistory();
        showToast('Baixa confirmada no Sankhya.', 'success');
      })
      .catch((erro) => showToast(erro.message, 'error'))
      .finally(() => { if (document.body.contains(syncButton)) { syncButton.disabled = false; } });
    return;
  }
  const button = target?.closest('.detail-toggle');
  if (!button) return;
  const detail = document.querySelector(`#${button.dataset.target}`);
  if (!detail) return;
  const open = detail.classList.toggle('is-open');
  button.setAttribute('aria-expanded', String(open));
  button.querySelector('svg')?.classList.toggle('rotate-180', open);
});
$$('[data-camera-target]').forEach((button) => button.addEventListener('click', () => openCamera(button.dataset.cameraTarget)));
$('#close-evidence-button').addEventListener('click', () => { $('#evidence-panel').classList.add('is-hidden'); resetEvidence(); });
$('#evidence-form').addEventListener('submit', salvarEvidencia);
$('#location-button').addEventListener('click', captureLocation);
$('#capture-button').addEventListener('click', takeCameraPhoto);
$('#choose-file-button').addEventListener('click', () => {
  const input = $('#camera-file-input');
  input.value = '';
  input.click();
});
$('#camera-file-input').addEventListener('change', (event) => processCameraFile(event.target.files?.[0]));
$('#close-camera').addEventListener('click', closeCamera);
$$('[data-close-camera]').forEach((element) => element.addEventListener('click', closeCamera));
window.addEventListener('beforeunload', stopCamera);
initSignaturePad();
window.lucide?.createIcons();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
restaurarSessao();
