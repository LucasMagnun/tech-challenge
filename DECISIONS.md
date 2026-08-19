# Decisões de arquitetura

## Organização do projeto

**Decisão:** monorepo com pnpm workspaces (`apps/transactions`, `apps/anti-fraud`, `apps/web`, `packages/shared`).

**Alternativas consideradas:** repositórios separados por serviço.

**Por quê:** um único desenvolvedor no desafio, um único quality gate e CI, e os dois
serviços de backend compartilham o contrato dos eventos Kafka — colocar isso em
`packages/shared` evita duplicar tipos. Repos separados fazem mais sentido em times
grandes com deploy independente por serviço, mas adicionam overhead de publicar/versionar
pacotes compartilhados que não se paga para este escopo.

## Gerenciador de workspace

**Decisão:** pnpm workspaces (`pnpm-workspace.yaml`).

**Alternativas consideradas:** npm workspaces, Turborepo/Nx por cima do pnpm.

**Por quê:** pnpm é exigido pela stack do desafio e já resolve workspaces nativamente.
Turborepo/Nx trariam cache de build e orquestração de tarefas mais sofisticada, mas para
três apps o ganho não justifica a complexidade extra de configuração.

## Lint e formatação

**Decisão:** ESLint + Prettier, com hook de pre-commit via husky + lint-staged.

**Alternativas consideradas:** Biome (lint + format em um único binário, mais rápido).

**Por quê:** ESLint + Prettier tem suporte mais maduro para regras type-aware e para
frameworks específicos (NestJS, Next.js), além de ser o padrão mais reconhecido. Biome é
mais rápido mas ainda tem cobertura mais fraca nesses dois pontos — trade-off que não vale
a pena para este projeto.

## Configuração de TypeScript compartilhada

**Decisão:** `tsconfig.base.json` na raiz, com modo estrito, estendido pelo `tsconfig.json`
de cada app.

**Alternativas consideradas:** cada app com config TS independente, sem herança.

**Por quê:** evita duplicar as mesmas opções em três lugares e garante que nenhum app
"escapa" do modo estrito sem que isso fique explícito no diff.

---

## Modelagem de dados

_(pendente)_

## Formato dos eventos

_(pendente)_

## Tratamento de falha na mensageria

_(pendente)_

## Atualização de status na interface

_(pendente)_

## Estratégia de testes

_(pendente)_

## Volume alto de escritas e leituras concorrentes

_(pendente — resposta obrigatória pelo enunciado, não precisa implementar, só defender)_

## Nota técnica: versão do TypeScript

O projeto fixa `typescript` na série 6.x (`^6`) em vez da 7.x mais recente porque o
TypeScript 7.0 (lançado em julho/2026, compilador nativo em Go) ainda não expõe a API
programática estável que o `typescript-eslint` depende para funcionar — essa API só chega
na versão 7.1. Assim que 7.1 sair e o `typescript-eslint` anunciar suporte, vale reavaliar
a atualização.

## Nest CLI: standalone por app, não modo monorepo

**Decisão:** cada app Nest (`transactions`, `anti-fraud`) é gerado como projeto standalone
dentro do workspace pnpm, não usando o modo monorepo nativo do Nest CLI (`nest generate app`).

**Por quê:** os dois serviços são deployáveis de forma independente — é o próprio ponto do
desafio. O modo monorepo do Nest foi pensado para projetos com build/deploy fortemente
acoplados. Empilhar o monorepo do Nest sobre o monorepo do pnpm seria complexidade
redundante (duas ferramentas de orquestração fazendo o mesmo papel).

## Nota técnica: ajustes de tsconfig por mudanças recentes do TypeScript

O `tsconfig.json` de cada app precisou de `rootDir` explícito (exigido pelas versões
recentes do TS ao usar `declaration` + `outDir`) e não usa mais `baseUrl` (opção em
descontinuação a partir do TS 7). `@types/node` precisou ser referenciado explicitamente
via `"types": ["node"]` em alguns casos, já que a resolução automática de tipos globais
ficou mais rígida com `moduleResolution: nodenext`.

## Nota técnica: incremental do TS em conflito com deleteOutDir do Nest

`tsconfig.json` não usa `"incremental": true`. Em conjunto com `"deleteOutDir": true`
(nest-cli.json), o cache incremental do TypeScript perdia sincronia após a pasta `dist/`
ser apagada pelo Nest a cada rebuild em watch mode: o compilador reportava "0 erros" mas
não reemitia os arquivos `.js`, deixando `dist/` incompleto (só `.d.ts`, sem `main.js`).

## Validação de payload: Zod em vez de class-validator

**Decisão:** validação de entrada via schemas Zod (`packages/shared`), não
`class-validator`/`class-transformer`.

**Alternativas consideradas:** `class-validator` com decorators nas classes DTO — é o
padrão mais usado em projetos Nest, com integração nativa via `ValidationPipe`.

**Por quê:** o projeto tem dois serviços (`transactions`, `anti-fraud`) trocando eventos
via Kafka que precisam concordar sobre o mesmo formato de dado. Um schema Zod é um valor
comum (não depende de decorators/reflection), então o mesmo schema pode validar tanto o
corpo de uma requisição HTTP quanto o payload de um evento Kafka recebido como `unknown`
— e o tipo TypeScript correspondente (`z.infer`) é derivado automaticamente do schema, sem
duplicar "regra de validação" e "definição de tipo" em dois lugares. Isso concentra o
contrato de dados de uma transação em um único ponto (`packages/shared`), consumido pelos
dois serviços.

O trade-off aceito: `class-validator` é mais reconhecido como "o jeito Nest" de validar
DTOs e não exige um Pipe customizado (`ZodValidationPipe`, escrito manualmente); Zod exige
esse passo extra de integração, mas paga esse custo de setup ao evitar duplicação de
contrato entre serviços.

## Publicacao do evento Kafka

**Decisão:** `TransactionsService` chama `kafkaClient.emit(...)` sem aguardar
confirmação antes de retornar a resposta HTTP.

**Por quê:** o fluxo síncrono (criar transação, responder ao cliente) não deve depender
da disponibilidade ou latência do Kafka — é o próprio ponto de ter validação assíncrona
via evento, em vez de bloquear a requisição esperando o resultado do antifraude.

**Caminho triste identificado, ainda não coberto:** se a publicação do evento falhar
silenciosamente (broker indisponível, erro de rede), a transação permanece em `PENDING`
indefinidamente, sem que ninguém seja notificado. Mitigação futura considerada: capturar
erro de `emit` com um `.catch()`/listener de erro do client Kafka e ao menos logar a
falha; uma solução mais robusta (fila de retry, job de reconciliação que varre
transações `PENDING` antigas) fica fora do escopo deste desafio, mas é o tipo de gap que
existiria em produção.
cat >> DECISIONS.md << 'EOF'

## Nota técnica: campo "value" no evento colide com serializer do Kafka do Nest

O evento `transaction.created` usa o campo `amount`, não `value`, para o valor monetário.
O `KafkaRequestSerializer` do `@nestjs/microservices` verifica se o payload publicado via
`emit()` contém as chaves `key` ou `value` para decidir se o objeto já é uma mensagem Kafka
pronta (`{ key, value, headers }`) — nesse caso ele extrai apenas o campo `value` e descarta
o resto do objeto, silenciosamente, sem erro. Como o schema original usava `value` para o
valor da transação, apenas esse número era publicado no tópico, perdendo `transactionId` e
`createdAt`. É um comportamento documentado da biblioteca (nestjs/nest#12886); a correção
foi renomear o campo no contrato do evento.

## Transactions como aplicacao hibrida (HTTP + Kafka consumer)

**Decisão:** o serviço `transactions` roda HTTP e consumer Kafka no mesmo processo, via
`app.connectMicroservice()` + `app.startAllMicroservices()`.

**Alternativas consideradas:** um terceiro processo/serviço separado só para consumir
`transaction.status.updated`.

**Por quê:** o consumer só precisa fazer uma coisa simples (atualizar o status no banco
que o próprio `transactions` já possui e gerencia). Separar em outro processo adicionaria
deploy e operação extra sem benefício real, já que não há necessidade de escalar o
consumo de status independentemente da API HTTP neste escopo.

## Consumer group separado para o consumer de status

**Decisão:** o consumer de `transaction.status.updated` no `transactions` usa
`groupId: transactions-consumer-group`, diferente do `anti-fraud-consumer-group` usado
pelo `anti-fraud`.

**Por quê:** cada serviço precisa do seu próprio consumer group para garantir que ambos
recebem todas as mensagens dos tópicos aos quais estão inscritos — grupos compartilhados
fariam os serviços competirem pelas mesmas mensagens de tópicos diferentes, quebrando o
fluxo bidirecional do desafio.

## Atualizacao de status na UI: polling (temporario) -> SSE

**Decisão final:** Server-Sent Events (SSE), com um endpoint `GET /transactions/stream` no
`transactions` que empurra atualizações em tempo real para os clientes conectados.

**Alternativas consideradas:** WebSocket (descartado por ser bidirecional sem necessidade
real aqui — o fluxo é unidirecional, servidor para cliente) e polling HTTP simples.

**Por quê SSE:** roda sobre HTTP comum, o navegador reconecta sozinho em caso de queda, e
não exige tratar concorrência de conexões bidirecionais que o WebSocket implicaria sem
necessidade real para este caso de uso.

**Nota de implementação:** o scaffold inicial do frontend usa polling como implementação temporária, permitindo validar a interface de ponta a ponta
antes do endpoint SSE existir no backend. A troca de polling para SSE (branch seguinte)
altera apenas a forma de obter dados no frontend — o restante da UI permanece igual.

## Paginacao no GET /transactions

**Decisão:** listagem paginada (`page`/`limit` via query string), com tamanho de página
padrão de 10 e teto máximo de 100 por página.

**Por quê:** evita que a API retorne o volume inteiro de transações em uma única resposta
conforme a base cresce — conecta diretamente com a preocupação de "volume alto de leituras
e escritas concorrentes" que o desafio pede para endereçar. O teto de 100 protege contra
uso indevido do parâmetro `limit` (alguém pedindo uma página muito grande de propósito).

## SSE limitado a primeira pagina no frontend

**Decisão:** atualizações em tempo real via SSE só são refletidas na lista quando o
usuário está na primeira página.

**Por quê:** com paginação, inserir um item novo em tempo real em qualquer página que não
seja a mais recente quebraria a consistência visual (itens se deslocando entre páginas
sem o usuário navegar). Nas páginas 2+, os dados ficam estáticos até nova navegação.

## Contrato REST alinhado ao README oficial

**Decisão:** `POST /transactions` e `GET /transactions` seguem exatamente os campos
especificados na seção "Contratos" do README (`accountExternalIdDebit`,
`accountExternalIdCredit`, `transferTypeId` na entrada; `transactionExternalId`,
`transactionType.name`, `transactionStatus.name`, `value`, `createdAt` na saída),
diferente da versão simplificada usada até esta branch.

**Desvios conscientes do exemplo literal:**

- `value` na resposta permanece como `string` (não `number`), preservando a precisão
  decimal já documentada anteriormente — um `number` JS sofre os mesmos problemas de
  ponto flutuante discutidos na decisão sobre `Decimal` vs `Float`.
- `transactionType.name` é o `transferTypeId` convertido para string, sem um catálogo de
  tipos: o enunciado não define quais tipos existem nem regra de negócio associada a eles
  neste desafio, então o campo é tratado como metadado opaco ecoado de volta.
- Não existe entidade de "conta" no sistema: `accountExternalIdDebit`/
  `accountExternalIdCredit` são armazenados como recebidos, sem validação de existência —
  não há requisito no enunciado para modelar contas.

## Geracao de GUIDs de conta no frontend

**Decisão:** o frontend gera `accountExternalIdDebit`/`accountExternalIdCredit` via
`crypto.randomUUID()` a cada submissão, e usa `transferTypeId` fixo (`1`).

**Por quê:** a interface não tem conceito de login/contas de usuário — pedir esses campos
manualmente no formulário adicionaria complexidade de UX sem valor real para o escopo do
desafio. Gerar automaticamente satisfaz o contrato exigido pela API sem exigir modelagem
de conta que não foi pedida.

## Endpoint de detalhe e filtros na listagem

**Decisão:** `GET /transactions/:transactionExternalId` para consulta individual, e
`GET /transactions` aceita filtros opcionais por `status`, `transferTypeId` e período
(`startDate`/`endDate`, comparados contra `createdAt`).

**Por quê período como startDate/endDate:** é o padrão mais comum em dashboards (Stripe,
Google Analytics, painéis administrativos em geral). Presets de UI ("hoje", "7 dias") são
implementáveis no frontend como atalhos que calculam essas duas datas, sem exigir mudança
na API.

**Ordem de rotas no controller:** `@Sse('stream')` precisa ser declarado antes de
`@Get(':transactionExternalId')` — caso contrário, o Nest resolveria `GET /transactions/stream`
como se "stream" fosse um `transactionExternalId`, quebrando a rota de tempo real.

## Tela de detalhe como rota propria, nao modal

**Decisão:** `/transactions/[id]` como rota dedicada do App Router, em vez de modal
sobreposto à lista.

**Por quê:** URL compartilhável/navegável, funciona com back/forward do navegador, e é
mais simples de testar isoladamente (componente próprio, sem gerenciar estado de
abertura/fechamento de modal).

## Filtros da listagem: status, tipo, periodo

**Decisão:** filtros no frontend mapeiam diretamente para os query params do backend
(`status`, `transferTypeId`, `startDate`/`endDate`), com inputs nativos (`select`, `date`)
em vez de biblioteca de UI adicional.

**Por quê:** cobre o requisito do README sem introduzir dependência nova — os elementos
nativos do HTML já resolvem o caso de uso sem necessidade de um date-picker customizado
dado o escopo do desafio.

## Volume alto de escritas e leituras concorrentes

O maior risco em alto volume não é "muitas requisições" isoladamente — é concorrência
sobre os mesmos dados: escritas competindo entre si (criação + atualização de status na
mesma tabela) e leituras (dashboard) competindo com essas escritas pelos mesmos recursos
do banco.

**O que a arquitetura atual já mitiga:**

- O fluxo assíncrono via Kafka já funciona como _buffer de absorção de pico_: a criação
  de uma transação nunca espera o resultado do antifraude, então um pico de escritas na
  entrada não trava o sistema — o Kafka absorve o volume e o consumer processa no ritmo
  que consegue.
- A atualização de status tem um único caminho de escrita (o consumer), reduzindo o risco
  de duas escritas concorrentes na mesma linha por fontes diferentes.

**O que seria adicionado para escalar:**

1. **Read replica**: separar o banco que recebe escritas do banco que atende leituras do
   dashboard, replicando de forma assíncrona. Isso evita que consultas de leitura
   (listagem, filtros) disputem I/O e locks com o fluxo transacional de escrita.

2. **Lock otimista na atualização de status**: se o volume de mensagens no Kafka
   crescesse a ponto de mensagens duplicadas ou fora de ordem se tornarem um risco real
   (cenário de "at-least-once delivery" já documentado), uma coluna de versão checada
   antes do `UPDATE` evitaria que um evento antigo sobrescreva um mais recente.

3. **Particionamento de tabela por período** (ex: mensal), reduzindo o tamanho de cada
   busca/lock conforme o histórico cresce.

4. **Cache com TTL para dados agregados do dashboard** (contagens por status, totais),
   não invalidado por evento individual. Em alto volume, invalidar o cache a cada
   transação (via SSE) anularia o benefício do cache — um TTL curto (poucos segundos)
   equilibra "quase tempo real" com redução de carga no banco. O SSE continua fazendo
   sentido para notificar mudança de um item específico que o usuário está observando,
   não para manter agregados sempre frescos em escala.
