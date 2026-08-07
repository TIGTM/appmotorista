# appmotorista

Aplicativo web para o piloto do motorista da GTM.

## O que esta versao faz

- Login por sessao HTTP com cookie HttpOnly.
- Consulta das cargas abertas vinculadas ao motorista no Sankhya.
- Captura de foto da nota e da entrega.
- Assinatura no aparelho.
- Captura de localizacao somente quando solicitada.
- Armazenamento local das evidencias no servidor do app.

## Limite operacional

Esta versao nao confirma pedido, nao baixa estoque, nao envia ordem ao WMS e nao grava baixa no Sankhya. A rota de evidencias e uma etapa de homologacao separada da escrita no ERP.

## Execucao local

Defina `APP_DRIVER_PASSWORD` no ambiente e execute:

```powershell
$env:APP_DRIVER_PASSWORD = 'senha-local'
$env:PORT = '4180'
npm start
```

## Sankhya no servidor

Em producao, defina `SANKHYA_API_PROXY_URL` apontando para o proxy interno de consulta e `SANKHYA_API_PROXY_TOKEN` no ambiente do processo. O app nao precisa carregar credenciais do OAuth nem o diretorio do `sankhya-mcp`.

## Validacao

```powershell
npm run check
```

## PM2

O arquivo `ecosystem.config.cjs` inicia o app na porta 4180. O proxy Apache/reverse proxy e o dominio devem ser configurados separadamente, apos a homologacao.
