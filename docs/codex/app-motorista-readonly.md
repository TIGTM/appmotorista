# Aplicativo do Motorista

## Objetivo

Fornecer ao aplicativo uma leitura controlada das cargas abertas atribuídas a
um motorista e registrar a entrega pela ação oficial já usada na tela Ordens de
Carga.

## Filtros de seguranca

- Empresa e motorista sao inteiros validados antes da consulta.
- A carga precisa estar aberta (`TGFORD.SITUACAO = 'A'`).
- A carga precisa estar fora do WMS (`TGFORD.ENVIOWMS = 'N'`).
- O pedido precisa estar ativo e pendente (`TGFCAB.STATUSNOTA = 'A'` e
  `TGFCAB.PENDENTE = 'S'`).
- O script executa somente um `SELECT` fixo. Nao existe entrada de SQL livre.

## Baixa oficial

O endpoint `POST /api/evidencias/:id/baixa` valida novamente o vínculo do
motorista, a empresa, a OC, o pedido, a carga aberta e o estado fora do WMS.
Depois chama somente `ActionButtonsSP.executeJava`, ação `4`, com:

- `ENTREGA=2`;
- `DTENTREGA`;
- `CODEMP`, `ORDEMCARGA` e `NUNOTA`.

O retorno só é aceito após uma nova consulta confirmar `AD_SITENTREGUE=2`.
Evidências com falha ficam pendentes para nova tentativa. A ação fica desligada
até `SANKHYA_BAIXA_ATIVA=true` ser definido no ambiente do servidor.

## Execucao do piloto

Na raiz do projeto:

```powershell
node scripts/consulta-app-motorista-readonly.mjs --empresa 2 --motorista 41850 --oc 460
```

Sem informar `--oc`, o script lista todas as cargas abertas e ainda nao
enviadas ao WMS para o motorista informado.

## Aplicativo local

Para iniciar a tela do piloto:

```powershell
node app/server.mjs
```

O servidor usa a porta `4173` por padrao. Se ela estiver ocupada, informe
outra porta:

```powershell
$env:PORT = 4180
node app/server.mjs
```

O endpoint `GET /api/cargas` e somente leitura e recebe `empresa`,
`motorista` e, opcionalmente, `oc` como parametros. A consulta de validação da
baixa também é somente leitura.

## Retorno

O JSON e agrupado em `cargas`, `pedidos` e `itens`, incluindo cliente,
endereco cadastrado, produto, quantidade, pesos, valor e local de origem.
