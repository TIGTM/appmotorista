import test from 'node:test';
import assert from 'node:assert/strict';
import { dataEntregaValida, montarRequisicaoBaixa } from './sankhya-baixa-entrega.mjs';
import { inteiroOpcional, normalizarVinculo } from './consulta-app-motorista-readonly.mjs';

test('monta a mesma acao de entrega usada por Ordens de Carga', () => {
  const body = montarRequisicaoBaixa({ empresa: 2, oc: 460, pedido: 87522, dataEntrega: '2026-08-28' });
  assert.deepEqual(body.javaCall, {
    actionID: '4',
    refreshType: 'SEL',
    masterEntityName: 'OrdemCarga',
    params: { param: [
      { type: 'S', paramName: 'ENTREGA', $: '2' },
      { type: 'D', paramName: 'DTENTREGA', $: '28/08/2026' },
    ] },
  });
  assert.deepEqual(body.rows.row[0], {
    master: 'S',
    entityName: 'OrdemCarga',
    field: [
      { fieldName: 'CODEMP', $: '2' },
      { fieldName: 'ORDEMCARGA', $: '460' },
    ],
  });
  assert.deepEqual(body.rows.row[1], { field: [{ fieldName: 'NUNOTA', $: '87522' }] });
});

test('rejeita data de entrega inexistente', () => {
  assert.throws(() => dataEntregaValida('2026-02-30'), /inválida/);
  assert.throws(() => dataEntregaValida('28/08/2026'), /YYYY-MM-DD/);
});

test('aceita os vínculos de motorista e transportadora', () => {
  assert.equal(normalizarVinculo('motorista'), 'motorista');
  assert.equal(normalizarVinculo('TRANSPORTADORA'), 'transportadora');
  assert.throws(() => normalizarVinculo('parceiro'), /vínculo/);
});

test('trata ausência de OC como filtro opcional', () => {
  assert.equal(inteiroOpcional('oc', null), null);
  assert.equal(inteiroOpcional('oc', ''), null);
  assert.equal(inteiroOpcional('oc', '4369'), 4369);
});
