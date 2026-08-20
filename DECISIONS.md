# Decisões de arquitetura

Este documento registra as decisões técnicas tomadas ao longo do desafio, as alternativas
consideradas e o porquê de cada escolha. Está organizado por tema, não por ordem
cronológica de implementação.

## Sumário

- [Fundação do projeto](#fundação-do-projeto)
- [Modelagem de dados](#modelagem-de-dados)
- [Contratos e mensageria](#contratos-e-mensageria)
- [Frontend](#frontend)
- [Estratégia de testes](#estratégia-de-testes)
- [Respostas obrigatórias do enunciado](#respostas-obrigatórias-do-enunciado)
- [Notas técnicas de ambiente](#notas-técnicas-de-ambiente)

---

## Fundação do projeto

### Monorepo com pnpm workspaces

**Decisão:** monorepo (`apps/transactions`, `apps/anti-fraud`, `apps/web`,
`packages/shared`) em vez de repositórios separados por serviço.

**Por quê:** um único desenvolvedor, um único quality gate e CI, e os dois
serviços de backend compartilham o contrato dos eventos Kafka — colocar isso em
`packages/shared` evita duplicar tipos. Repos separados fazem mais sentido em times
grandes com deploy independente por serviço, mas adicionam overhead de publicar/versionar
pacotes compartilhados que não se paga para este escopo.

**Alternativas consideradas:** repositórios separados por serviço; Turborepo/Nx por cima
do pnpm (descartado — para três apps o ganho de cache/orquestração não justifica a
complexidade extra de configuração).

### Nest CLI: standalone por app, não modo monorepo

**Decisão:** cada app Nest (`transactions`, `anti-fraud`) é gerado como projeto standalone
dentro do workspace pnpm, não usando o modo monorepo nativo do Nest CLI.

**Por quê:** os dois serviços são deployáveis de forma independente — é o próprio ponto do
desafio. O modo monorepo do Nest foi pensado para projetos com build/deploy fortemente
acoplados; empilhá-lo sobre o monorepo do pnpm seria complexidade redundante.

### Lint, formatação e TypeScript compartilhado

**Decisão:** ESLint + Prettier (hook de pre-commit via husky + lint-staged) e
`tsconfig.base.json` na raiz com modo estrito, estendido por cada app.

**Por quê:** ESLint + Prettier tem suporte mais maduro para regras type-aware e para
frameworks específicos (NestJS, Next.js) que Biome (alternativa considerada, descartada
pela cobertura mais fraca nesses pontos). O `tsconfig` compartilhado evita duplicar as
mesmas opções em cada app e garante que nenhum app "escapa" do modo estrito sem que isso
fique explícito no diff.

---

## Modelagem de dados

**Decisão:** entidade única `Transaction`, com os seguintes campos e tipos:

| Campo                                               | Tipo                                     | Motivo                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                | UUID (`@default(uuid())`)                | Não expõe volume de negócio como um autoincremento exporia; é gerado sem coordenação central, importante já que viaja dentro dos eventos Kafka como identificador lógico entre os serviços. |
| `value`                                             | `Decimal(12,2)`                          | `Float` usa ponto flutuante binário, que não representa exatamente frações decimais — inaceitável para valores monetários. `Decimal` no Postgres armazena o valor exato.                    |
| `status`                                            | `enum` (`PENDING`/`APPROVED`/`REJECTED`) | Vira uma constraint real no Postgres (tipo `ENUM`), tornando impossível gravar um status inválido mesmo por bug — diferente de uma `String` solta.                                          |
| `accountExternalIdDebit`, `accountExternalIdCredit` | `String`                                 | Recebidos e armazenados como enviados pelo cliente, sem validação de existência — não há entidade de "conta" modelada no sistema, nem exigência disso no escopo do desafio.                 |
| `transferTypeId`                                    | `Int`                                    | Armazenado e ecoado de volta como `transactionType.name`; o enunciado não define um catálogo de tipos nem regra de negócio associada, então é tratado como metadado opaco.                  |

---

## Contratos e mensageria

### Formato dos eventos Kafka

**Decisão:** o README deixa o formato do payload dos eventos livre, exigindo apenas
consistência entre publicador e consumidor. Os dois eventos do fluxo foram definidos como:

- `transaction.created`: `{ transactionId, amount, createdAt }`
- `transaction.status.updated`: `{ transactionId, status }`

**Nota técnica relevante:** o campo de valor monetário do evento se chama `amount`, não
`value`. O `KafkaRequestSerializer` do `@nestjs/microservices` verifica se o payload
publicado via `emit()` contém as chaves `key` ou `value` para decidir se o objeto já é uma
mensagem Kafka pronta (`{ key, value, headers }`) — nesse caso ele extrai apenas esse campo
e descarta o resto do objeto, silenciosamente, sem erro. Como uma versão inicial do schema
usava `value`, apenas o número era publicado no tópico, perdendo `transactionId` e
`createdAt`. É um comportamento documentado da biblioteca ([nestjs/nest#12886](https://github.com/nestjs/nest/issues/12886)); a correção foi renomear o campo.

### Validação de payload: Zod em vez de class-validator

**Decisão:** validação de entrada via schemas Zod (`packages/shared`), não
`class-validator`/`class-transformer` (alternativa mais reconhecida como "o jeito Nest" de
validar DTOs).

**Por quê:** os dois serviços de backend trocam eventos via Kafka que precisam concordar
sobre o mesmo formato de dado. Um schema Zod é um valor comum (não depende de
decorators/reflection), então o mesmo schema valida tanto o corpo de uma requisição HTTP
quanto o payload de um evento Kafka recebido como `unknown` — e o tipo TypeScript
correspondente (`z.infer`) é derivado automaticamente do schema, sem duplicar "regra de
validação" e "definição de tipo" em dois lugares.

**Trade-off aceito:** Zod exige um Pipe customizado (`ZodValidationPipe`, escrito
manualmente), diferente do `ValidationPipe` nativo do Nest para `class-validator`. Esse
custo de setup é pago pela eliminação de duplicação de contrato entre serviços.

### Publicação assíncrona e tratamento de falha na mensageria

**Decisão:** `TransactionsService` chama `kafkaClient.emit(...)` sem aguardar confirmação
antes de retornar a resposta HTTP (fire-and-forget).

**Por quê:** o fluxo síncrono (criar transação, responder ao cliente) não deve depender da
disponibilidade ou latência do Kafka — é o próprio ponto de ter validação assíncrona via
evento, em vez de bloquear a requisição esperando o resultado do antifraude.

**Caminho triste identificado, não coberto neste escopo:** se a publicação do evento falhar
silenciosamente (broker indisponível, erro de rede), a transação permanece em `PENDING`
indefinidamente, sem que ninguém seja notificado. Mitigação futura considerada: capturar
erro de `emit` com um listener de erro do client Kafka e ao menos logar a falha; uma
solução mais robusta (fila de retry, job de reconciliação que varre transações `PENDING`
antigas) fica fora do escopo deste desafio, mas é o tipo de gap que existiria em produção.

Do lado do consumidor (`anti-fraud` e o consumer de status em `transactions`), payloads
inválidos (`safeParse` do Zod falhando) são logados e descartados em vez de derrubar o
processo — evita que uma mensagem malformada trave o consumer tentando reprocessá-la
indefinidamente.

### Consumer groups e app híbrido

**Decisão:** o consumer de `transaction.status.updated` no `transactions` usa
`groupId: transactions-consumer-group`, diferente do `anti-fraud-consumer-group` usado
pelo `anti-fraud` — cada serviço precisa do seu próprio grupo para garantir que ambos
recebem todas as mensagens dos tópicos aos quais estão inscritos.

O `transactions` roda HTTP e consumer Kafka no mesmo processo (`app.connectMicroservice()`

- `app.startAllMicroservices()`), em vez de um terceiro serviço dedicado só a consumir o
  evento de retorno — o consumer só precisa atualizar o status no banco que o próprio
  `transactions` já gerencia, não havendo necessidade de escalar esse consumo
  independentemente da API HTTP neste escopo.

### Contrato REST alinhado ao README oficial

**Decisão:** `POST /transactions` e `GET /transactions` seguem os campos especificados na
seção "Contratos" do README (`accountExternalIdDebit`, `accountExternalIdCredit`,
`transferTypeId` na entrada; `transactionExternalId`, `transactionType.name`,
`transactionStatus.name`, `value`, `createdAt` na saída).

O frontend gera `accountExternalIdDebit`/`accountExternalIdCredit` via
`crypto.randomUUID()` a cada submissão, e usa `transferTypeId` fixo (`1`) — a interface
não tem conceito de login/contas de usuário, então pedir esses campos manualmente
adicionaria complexidade fora do escopo de UX para o desafio.

### Endpoint de detalhe e filtros

**Decisão:** `GET /transactions/:transactionExternalId` para consulta individual
(`404` via `NotFoundException` se não existir), e `GET /transactions` aceita filtros
opcionais por `status`, `transferTypeId` e período (`startDate`/`endDate`, comparados
contra `createdAt`) além da paginação (`page`/`limit`, padrão 10, teto 100 por página).

**Por quê período como startDate/endDate:** é o padrão mais comum em dashboards.
Presets de UI ("hoje", "7 dias") são implementáveis no frontend como atalhos que
calculam essas duas datas, sem exigir mudança na API.

**Detalhe de implementação:** `@Sse('stream')` precisa ser declarado antes de
`@Get(':transactionExternalId')` no controller — caso contrário, o Nest resolveria
`GET /transactions/stream` como se "stream" fosse um `transactionExternalId`.

---

## Frontend

### Atualização de status: SSE

**Decisão final:** Server-Sent Events, com um endpoint `GET /transactions/stream` no
`transactions` que empurra atualizações em tempo real para os clientes conectados
(alimentado por um `Subject` do RxJS que conecta tanto a criação via HTTP quanto a
atualização via consumer Kafka).

**Alternativas consideradas:** WebSocket (descartado por ser bidirecional sem necessidade
real aqui — o fluxo é unidirecional, servidor para cliente, e WebSocket implicaria tratar
concorrência de conexões que não se aplica ao caso de uso) e polling HTTP simples (usado
como implementação temporária durante o desenvolvimento, permitindo validar a interface de
ponta a ponta antes do endpoint SSE existir).

**Por quê SSE:** roda sobre HTTP comum, o navegador reconecta sozinho em caso de queda, e
não exige tratar concorrência de conexões bidirecionais que o WebSocket implicaria sem
necessidade real para este caso de uso.

### Paginação, filtros e tela de detalhe

**Decisão:** listagem paginada com filtros (status, tipo, período) mapeando diretamente
para os query params do backend, usando inputs nativos (`select`, `date`) em vez de
biblioteca de UI adicional — suficiente para o escopo, sem dependência nova.

Tela de detalhe como rota própria do App Router (`/transactions/[id]`), não modal: URL
compartilhável/navegável, funciona com back/forward do navegador, e é mais simples de
testar isoladamente que gerenciar estado de abertura/fechamento de modal.

---

## Estratégia de testes

**Abordagem adotada:** testes unitários com mocks nos três serviços, cobrindo as regras de
negócio e os caminhos triste/feliz de cada um:

- `transactions`: `TransactionsService` (criação, listagem com filtros/paginação, consulta
  individual, atualização de status via evento — incluindo payload inválido) com
  `PrismaService` e `ClientKafka` mockados.
- `anti-fraud`: `AntiFraudService` (aprovação, rejeição, payload inválido) com `ClientKafka`
  mockado.
- `web`: testes de componente com Testing Library, mockando `fetch` e `EventSource`,
  cobrindo submissão de formulário, validação, filtros, paginação e a tela de detalhe
  (incluindo o caso de "não encontrada").

**Por quê unitário com mock em vez de integração/e2e como abordagem principal:**
testes unitários isolam a lógica de negócio de forma rápida e
sem depender de infraestrutura externa (Postgres, Kafka) rodando durante o
CI. Essa é uma limitação assumida conscientemente: não há cobertura de teste de integração
real (aplicação completa + banco real) neste momento — seria o próximo passo natural para
aumentar a confiança antes de um ambiente de produção.

**Jest em vez de Vitest no frontend:** por consistência de ferramenta com os dois serviços
de backend, mesmo Vitest tendo melhor integração nativa com Next/Turbopack. O NestJS foi
construído com Jest como referência (`@nestjs/testing` é desenhado em cima da API de mocks
do Jest), então trocar por Vitest no backend exigiria reconfigurar uma integração que já
funciona nativamente, sem ganho real dado o tamanho das suites.

---

## Respostas obrigatórias do enunciado

### Volume alto de escritas e leituras concorrentes

> Pergunta do enunciado: _"A aplicação pode precisar lidar com um volume alto de escritas
> e leituras concorrentes. Como você abordaria esse requisito?"_

O maior risco em alto volume não é "muitas requisições" isoladamente — é concorrência
sobre os mesmos dados: escritas competindo entre si (criação + atualização de status na
mesma tabela) e leituras (dashboard) competindo com essas escritas pelos mesmos recursos
do banco.

**O que a arquitetura atual já mitiga:**

- O fluxo assíncrono via Kafka funciona como buffer de absorção de pico: a criação de
  uma transação nunca espera o resultado do antifraude, então um pico de escritas na
  entrada não trava o sistema — o Kafka absorve o volume e o consumer processa no ritmo
  que consegue.
- A atualização de status tem um único caminho de escrita (o consumer), reduzindo o risco
  de duas escritas concorrentes na mesma linha por fontes diferentes.
- A listagem já é paginada, evitando que a API retorne o volume inteiro de transações em
  uma única resposta conforme a base cresce.

**O que seria adicionado para escalar além deste desafio:**

1. **Read replica**: separar o banco que recebe escritas do banco que atende leituras do
   dashboard, replicando de forma assíncrona — evita que consultas de leitura disputem I/O
   e locks com o fluxo transacional de escrita.
2. **Lock otimista na atualização de status**: se o volume de mensagens no Kafka crescesse
   a ponto de mensagens duplicadas ou fora de ordem se tornarem um risco real (cenário de
   "at-least-once delivery" já documentado), uma coluna de versão checada antes do
   `UPDATE` evitaria que um evento antigo sobrescreva um mais recente.
3. **Particionamento de tabela por período** (ex: mensal), reduzindo o tamanho de cada
   busca/lock conforme o histórico cresce.
4. **Cache com TTL para dados agregados do dashboard** (contagens por status, totais), não
   invalidado por evento individual — em alto volume, invalidar a cada transação via SSE
   anularia o benefício do cache. Um TTL curto (poucos segundos) equilibra "quase tempo
   real" com redução de carga no banco. O SSE continua fazendo sentido para notificar
   mudança de um item específico que o usuário está observando, não para manter agregados
   sempre frescos em escala.

---

## Notas técnicas de ambiente

Detalhes de configuração e problemas de ferramental resolvidos ao longo do
desenvolvimento — não são decisões de arquitetura, mas documentam ajustes não óbvios.

- **Versão do TypeScript fixada em `^6`:** o TypeScript 7.0 (compilador nativo em Go,
  lançado em julho/2026) ainda não expõe a API programática estável da qual o
  `typescript-eslint` depende (prevista para a 7.1).
- **`rootDir` explícito e remoção de `baseUrl`** nos `tsconfig.json` dos apps: exigido
  pelas versões recentes do TS ao usar `declaration` + `outDir`; `baseUrl` está em
  descontinuação a partir do TS 7. `@types/node` precisou ser referenciado via
  `"types": ["node"]` em alguns casos, dado que `moduleResolution: nodenext` ficou mais
  rígido na resolução automática de tipos globais.
- **`incremental` do TypeScript desabilitado:** em conjunto com `deleteOutDir: true`
  (nest-cli.json), o cache incremental perdia sincronia após a pasta `dist/` ser apagada a
  cada rebuild em watch mode — o compilador reportava "0 erros" mas não reemitia os
  arquivos `.js`.
- **`packages/shared` requer build manual:** o `package.json` do pacote aponta para
  `dist/` (JS compilado), necessário para resolução de módulos ESM em tempo de execução —
  apontar direto para `src/*.ts` falha porque `node` não executa TypeScript nativamente
  neste setup. Sem uma ferramenta de orquestração de monorepo (Turborepo/Nx), essa
  recompilação é manual após qualquer mudança no pacote.
- **`pnpm-lock.yaml` fora da checagem do Prettier:** o pnpm pode reescrever pequenos
  detalhes de formatação do lockfile durante `pnpm install` (inclusive em modo
  `--frozen-lockfile`), fazendo `prettier --check` falhar de forma inconsistente entre o
  commit local e a execução no CI.

## Nota técnica: crash na primeira inicializacao com Kafka vazio

Em um broker Kafka completamente vazio (primeira vez, sem tópicos criados), o consumer do
`transactions` pode falhar ao tentar se inscrever em um tópico que está sendo criado
automaticamente pelo broker (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`), devido a uma
condição de corrida entre a criação do tópico e a eleição do líder de partição —
resultando em `KafkaJSProtocolError: This server does not host this topic-partition` e
encerrando o processo (exceção não tratada). O problema é transitório: reiniciar o
serviço após a primeira falha resolve, já que o tópico já existe na segunda tentativa.
Mitigação não implementada neste escopo: tratar essa exceção especificamente com retry,
ou pré-criar os tópicos explicitamente antes de subir os consumers.

## Criacao de transacao via modal, com selecao de tipo

**Decisão:** o formulário de criação de transação passa a viver dentro de um modal,
acionado por um botão "+ Criar transação", em vez de ficar sempre visível inline no topo
da página. O modal inclui um seletor de `transferTypeId` (1, 2 ou 3), permitindo variar o
tipo da transação — antes fixo em `1`.

**Por quê:** reflete melhor o padrão de um dashboard real, onde a ação de criar não
precisa ocupar espaço permanente na tela; e resolve a limitação anterior de todas as
transações nascerem com o mesmo `transferTypeId`, sem valor real para testar filtros por
tipo.
