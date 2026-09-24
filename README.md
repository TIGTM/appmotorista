# appmotorista

Aplicativo web para o piloto do motorista da GTM.

## O que esta versao faz

- Login por sessao HTTP com cookie HttpOnly.
- Consulta das cargas abertas vinculadas ao motorista no Sankhya.
- Captura de foto da nota e da entrega.
- Assinatura no aparelho.
- Captura de localizacao somente quando solicitada.
- Armazenamento local das evidencias no servidor do app.
- Confirmacao de entrega pela acao oficial do Sankhya, apos a evidencia ser salva.

## Fluxo de baixa

O app salva fotos, assinatura, GPS e data da entrega antes de solicitar a baixa. Em
seguida chama `ActionButtonsSP.executeJava`, com a acao `4` (`Atualização Ordem de
Carga`) e os mesmos campos usados na tela Ordens de Carga:

- `ENTREGA=2` (Entregue)
- `DTENTREGA` (data informada pelo motorista)
- empresa, ordem de carga e pedido selecionados no servidor

Depois da chamada, o app consulta novamente o pedido e somente marca a baixa como
confirmada quando `AD_SITENTREGUE=2`. Uma falha preserva a evidencia e libera retry.
O app nao faz `INSERT`, `UPDATE` ou `DELETE` por SQL e nao envia comandos livres ao
navegador.

## Execucao local

Defina `APP_DRIVER_USER`, `APP_DRIVER_PASSWORD`, `APP_DRIVER_CODPARC` e `APP_DRIVER_NOME` no ambiente e execute:

```powershell
$env:APP_DRIVER_PASSWORD = 'senha-local'
$env:PORT = '4180'
npm start
```

## Sankhya no servidor

Em producao, defina `SANKHYA_API_PROXY_URL` apontando para o proxy interno de consulta e `SANKHYA_API_PROXY_TOKEN` no ambiente do processo. O app nao precisa carregar credenciais do OAuth nem o diretorio do `sankhya-mcp`.

Para habilitar a baixa, configure `SANKHYA_BAIXA_ATIVA=true` somente após
homologar a integração. O caminho recomendado é configurar um proxy interno de
serviços em `SANKHYA_ACTION_PROXY_URL`, aceitando somente a ação
`ActionButtonsSP.executeJava` e autenticado por `SANKHYA_ACTION_PROXY_TOKEN`.
No `BancoDeDadosSankhya`, esse endpoint é `/service` e o token deve coincidir
com o `API_TOKEN` do proxy.

Em uma instalação no mesmo servidor do `sankhya-mcp`, também é possível usar o
gateway diretamente com `SANKHYA_CLIENT_ID`, `SANKHYA_CLIENT_SECRET` e
`SANKHYA_APPKEY` no ambiente do processo. Essas credenciais ficam apenas no
backend e nunca no frontend.

## Validacao

```powershell
npm run check
npm test
```

## PM2

O arquivo `ecosystem.config.cjs` inicia o app na porta 4180. O proxy Apache/reverse proxy e o dominio devem ser configurados separadamente, apos a homologacao.
