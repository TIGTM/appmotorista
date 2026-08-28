# Aplicativo do motorista - piloto

## Escopo atual

- Login por sessão HTTP com cookie `HttpOnly`.
- Usuário de piloto configurado por `APP_DRIVER_USER` e `APP_DRIVER_PASSWORD`.
- Consulta de cargas vinculada ao motorista autenticado e somente leitura no Sankhya.
- Captura de foto da nota e da entrega usando câmera ao vivo ou galeria do dispositivo.
- Assinatura desenhada no próprio aparelho.
- Solicitação de GPS somente quando o motorista aciona o botão de localização.
- Registro local de evidência em `app/data/evidencias`, salvo antes da confirmação da entrega.
- Baixa de entrega pela ação oficial `ActionButtonsSP.executeJava`, com retry e confirmação posterior por consulta.
- Histórico das evidências registradas no piloto.
- Manifesto e service worker para instalação como aplicativo no navegador móvel.

## Reutilização do projeto Marra Transportes

O fluxo foi adaptado a partir dos padrões existentes em `C:\Users\tigtm\Projetos\marratransportes`: câmera nativa/web com fallback para `input type=file`, GPS solicitado no momento da entrega, assinatura em canvas e login protegido no servidor. Nenhuma credencial, banco PostgreSQL ou rota de gravação do projeto Marra foi copiada.

## Limites operacionais importantes

O endpoint `POST /api/evidencias` salva os arquivos no piloto local. A baixa
oficial só é chamada por `POST /api/evidencias/:id/baixa`, após validar o vínculo
do motorista e a situação da carga. O app não executa `INSERT`, `UPDATE` ou
`DELETE` por SQL, não envia comandos livres ao navegador e não realiza baixa de
devolução ou de não-entrega neste fluxo.

Durante a homologação, mantenha `SANKHYA_BAIXA_ATIVA=false`. Depois de validar
o proxy de serviços e o pedido de teste, habilite a flag no ambiente do servidor.

## Execução

1. Defina `APP_DRIVER_PASSWORD` no ambiente do processo.
2. Inicie `node app/server.mjs` com uma porta livre, por exemplo `PORT=4180`.
3. Abra a URL em `localhost` ou HTTPS para que câmera e GPS possam solicitar permissão.

Em produção, substituir o usuário de piloto por autenticação corporativa, armazenar senhas com hash e colocar o armazenamento de evidências em infraestrutura controlada, com retenção e backup definidos.
