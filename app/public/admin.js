const $ = (selector) => document.querySelector(selector);
const state = { session: null, drivers: [], evidences: [] };

function icons() { window.lucide?.createIcons(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'; }
function statusLabel(status) { return ({ CONFIRMADA: 'Baixa confirmada', ERRO: 'Aguardando sincronização', PROCESSANDO: 'Sincronizando', PENDENTE: 'Evidência salva' })[status] || 'Evidência salva'; }

function toast(message, type = 'success') {
  const item = document.createElement('div'); item.className = `toast toast--${type}`;
  item.innerHTML = `<i data-lucide="${type === 'error' ? 'circle-alert' : 'circle-check'}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  $('#admin-toast-stack').append(item); icons(); setTimeout(() => item.remove(), 4200);
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.erro || 'Não foi possível concluir a solicitação.');
  return data;
}

function showLogin() { $('#admin-app').classList.add('is-hidden'); $('#admin-login').classList.remove('is-hidden'); $('#admin-login-password').value = ''; }
function showApp(session) { state.session = session; $('#admin-login').classList.add('is-hidden'); $('#admin-app').classList.remove('is-hidden'); $('#admin-session-label').textContent = session.nome || session.usuario; }

function renderDrivers() {
  $('#driver-count').textContent = `${state.drivers.length} ${state.drivers.length === 1 ? 'motorista' : 'motoristas'}`;
  $('#drivers-list').innerHTML = state.drivers.length ? state.drivers.map((driver) => `<article class="driver-row"><div><strong>${escapeHtml(driver.nome)}</strong><span>${escapeHtml(driver.usuario)} · Parceiro ${escapeHtml(driver.codparc)} · Empresa ${escapeHtml(driver.codemp)}</span></div><div class="driver-row__meta"><span class="badge ${driver.ativo ? 'badge--green' : 'badge--amber'}">${driver.ativo ? 'Ativo' : 'Inativo'}</span><span>${driver.vinculo === 'transportadora' ? 'Transportadora' : 'Motorista'}</span><button class="icon-button edit-driver" type="button" data-id="${driver.id}" title="Editar motorista"><i data-lucide="pencil" aria-hidden="true"></i></button></div></article>`).join('') : '<div class="empty-state"><strong>Nenhum motorista cadastrado</strong><span>Use o formulário ao lado para criar o primeiro acesso.</span></div>';
  const select = $('#evidence-driver-filter'); const current = select.value;
  select.innerHTML = '<option value="">Todos</option>' + state.drivers.map((driver) => `<option value="${escapeHtml(driver.usuario)}">${escapeHtml(driver.nome)} (${escapeHtml(driver.usuario)})</option>`).join(''); select.value = current;
  icons();
}

function renderEvidences() {
  $('#admin-evidence-count').textContent = `${state.evidences.length} ${state.evidences.length === 1 ? 'registro' : 'registros'}`;
  $('#admin-evidences-list').innerHTML = state.evidences.length ? state.evidences.map((item) => {
    const status = String(item.baixa?.status || 'PENDENTE').toUpperCase(); const driver = state.drivers.find((entry) => entry.usuario === item.usuario);
    const maps = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) ? `https://www.google.com/maps?q=${encodeURIComponent(`${item.latitude},${item.longitude}`)}` : null;
    return `<article class="admin-evidence"><div class="admin-evidence__main"><div><p class="eyebrow">OC ${escapeHtml(item.oc)} · NF-e ${escapeHtml(item.pedido)}</p><h3>${escapeHtml(driver?.nome || item.usuario || 'Motorista não identificado')}</h3><p>${formatDate(item.criadoEm)} · Entrega ${escapeHtml(item.dataEntrega || '-')}</p>${item.observacao ? `<p class="admin-evidence__note">${escapeHtml(item.observacao)}</p>` : ''}</div><div class="admin-evidence__status"><span class="badge ${status === 'CONFIRMADA' ? 'badge--green' : 'badge--amber'}">${statusLabel(status)}</span>${item.baixa?.mensagem ? `<small>${escapeHtml(item.baixa.mensagem)}</small>` : ''}</div></div><div class="admin-evidence__assets"><a class="button button--quiet" href="/api/evidencias/${item.id}/arquivo/nota" target="_blank" rel="noreferrer"><i data-lucide="receipt-text" aria-hidden="true"></i>Nota</a><a class="button button--quiet" href="/api/evidencias/${item.id}/arquivo/entrega" target="_blank" rel="noreferrer"><i data-lucide="image" aria-hidden="true"></i>Entrega</a><a class="button button--quiet" href="/api/evidencias/${item.id}/arquivo/assinatura" target="_blank" rel="noreferrer"><i data-lucide="signature" aria-hidden="true"></i>Assinatura</a>${maps ? `<a class="button button--quiet" href="${maps}" target="_blank" rel="noreferrer"><i data-lucide="map-pin" aria-hidden="true"></i>Mapa</a>` : ''}</div></article>`;
  }).join('') : '<div class="empty-state"><strong>Nenhuma evidência encontrada</strong><span>Ajuste os filtros ou aguarde novos registros.</span></div>';
  icons();
}

function resetDriverForm() {
  $('#driver-form').reset(); $('#driver-id').value = ''; $('#driver-active-input').checked = true; $('#driver-password-input').required = true; $('#driver-form-title').textContent = 'Novo motorista'; $('#driver-submit').innerHTML = '<i data-lucide="user-plus" aria-hidden="true"></i>Cadastrar motorista'; $('#driver-form-error').textContent = ''; icons();
}

function editDriver(id) {
  const driver = state.drivers.find((item) => item.id === id); if (!driver) return;
  $('#driver-id').value = driver.id; $('#driver-name-input').value = driver.nome; $('#driver-user-input').value = driver.usuario; $('#driver-partner-input').value = driver.codparc; $('#driver-company-input').value = driver.codemp; $('#driver-company-name-input').value = driver.empresaNome; $('#driver-link-input').value = driver.vinculo; $('#driver-active-input').checked = driver.ativo; $('#driver-password-input').value = ''; $('#driver-password-input').required = false; $('#driver-form-title').textContent = 'Editar motorista'; $('#driver-submit').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar alterações'; $('#driver-form-error').textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); icons();
}

async function loadAll() {
  const [summary, drivers] = await Promise.all([api('/api/admin/resumo'), api('/api/admin/motoristas')]);
  state.drivers = drivers; $('#summary-drivers').textContent = summary.motoristasAtivos; $('#summary-evidences').textContent = summary.evidencias; $('#summary-pending').textContent = summary.baixasPendentes; $('#summary-confirmed').textContent = summary.baixasConfirmadas; renderDrivers(); await loadEvidences();
}
async function loadEvidences() {
  const params = new URLSearchParams(); const driver = $('#evidence-driver-filter').value; const oc = $('#evidence-oc-filter').value.trim(); const status = $('#evidence-status-filter').value;
  if (driver) params.set('motorista', driver); if (oc) params.set('oc', oc); if (status) params.set('status', status);
  state.evidences = await api(`/api/admin/evidencias?${params}`); renderEvidences();
}

$('#admin-login-form').addEventListener('submit', async (event) => { event.preventDefault(); $('#admin-login-error').textContent = ''; try { const session = await api('/api/login', { method: 'POST', body: JSON.stringify({ usuario: $('#admin-login-user').value, senha: $('#admin-login-password').value }) }); if (session.perfil !== 'admin') { window.location.assign('/'); return; } showApp(session); await loadAll(); } catch (error) { $('#admin-login-error').textContent = error.message; } });
$('#admin-logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {}); showLogin(); });
$('#admin-refresh').addEventListener('click', () => loadAll().then(() => toast('Dados atualizados.')).catch((error) => toast(error.message, 'error')));
$('#evidence-filter-button').addEventListener('click', () => loadEvidences().catch((error) => toast(error.message, 'error')));
$('#driver-form-reset').addEventListener('click', resetDriverForm);
$('#drivers-list').addEventListener('click', (event) => { const button = event.target.closest('.edit-driver'); if (button) editDriver(button.dataset.id); });
$('#driver-form').addEventListener('submit', async (event) => { event.preventDefault(); $('#driver-form-error').textContent = ''; const id = $('#driver-id').value; const body = { nome: $('#driver-name-input').value, usuario: $('#driver-user-input').value, senha: $('#driver-password-input').value, codparc: $('#driver-partner-input').value, codemp: $('#driver-company-input').value, empresaNome: $('#driver-company-name-input').value, vinculo: $('#driver-link-input').value, ativo: $('#driver-active-input').checked }; try { await api(id ? `/api/admin/motoristas/${id}` : '/api/admin/motoristas', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) }); resetDriverForm(); await loadAll(); toast(id ? 'Motorista atualizado.' : 'Motorista cadastrado.'); } catch (error) { $('#driver-form-error').textContent = error.message; } });

async function boot() { icons(); try { const session = await api('/api/sessao'); if (session.perfil !== 'admin') { window.location.assign('/'); return; } showApp(session); await loadAll(); } catch { showLogin(); } }
boot();
