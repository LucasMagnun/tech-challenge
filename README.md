# Tech Challenge — BIUD

Sistema de transações financeiras com validação antifraude assíncrona, construído como
monorepo (NestJS + Next.js + Kafka + PostgreSQL).

## Arquitetura

- `apps/transactions` — API REST (criação, consulta, listagem paginada/filtrada de
  transações), publica e consome eventos Kafka, expõe atualização em tempo real via SSE
- `apps/anti-fraud` — microservice Kafka puro, consome o evento de criação e aplica a
  regra de validação (valor > 1000 → rejeitada)
- `apps/web` — dashboard Next.js (App Router): listagem com filtros, criação por
  formulário, tela de detalhe, atualização de status em tempo real
- `packages/shared` — contratos compartilhados (schemas Zod) entre os serviços

Decisões de arquitetura, trade-offs e as respostas às perguntas obrigatórias do enunciado
estão documentadas em [`DECISIONS.md`](./DECISIONS.md).

## Pré-requisitos

- Node 22+ (ver `.nvmrc`)
- pnpm — `corepack enable && corepack prepare pnpm@11.22.0 --activate`
- Docker + Docker Compose

## Rodando o projeto

1. Clone o repositório e instale as dependências:

   ```bash
   pnpm install
   ```

2. Suba a infraestrutura (Postgres, Kafka, Kafka UI):

   ```bash
   docker compose up -d
   ```

3. Configure as variáveis de ambiente:

   ```bash
   cp .env.example .env
   cp apps/transactions/.env.example apps/transactions/.env
   cp apps/anti-fraud/.env.example apps/anti-fraud/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

   Ajuste `DATABASE_URL` em `apps/transactions/.env` para bater com as credenciais
   definidas no `.env` da raiz.

4. Compile o pacote compartilhado (necessário sempre que `packages/shared` mudar):

   ```bash
   cd packages/shared && pnpm build && cd ../..
   ```

5. Aplique as migrations:

   ```bash
   cd apps/transactions && pnpm exec prisma migrate deploy && pnpm exec prisma generate && cd ../..
   ```

6. Suba os três serviços (em terminais separados):

   ```bash
   cd apps/transactions && pnpm start:dev   # http://localhost:3001
   ```

   ```bash
   cd apps/anti-fraud && pnpm start:dev
   ```

   ```bash
   cd apps/web && pnpm dev                   # http://localhost:3000
   ```

## Qualidade

Quality gate completo (lint + formatação) em todo o monorepo:

```bash
pnpm quality
```

Testes por serviço:

```bash
cd apps/transactions && pnpm test
cd apps/anti-fraud && pnpm test
cd apps/web && pnpm test
```

Build de produção do frontend:

```bash
cd apps/web && pnpm build
```

## Endpoints principais (`transactions`, porta 3001)

| Método | Rota                                   | Descrição                                                                      |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| `POST` | `/transactions`                        | Cria uma transação (status inicial `PENDING`)                                  |
| `GET`  | `/transactions`                        | Lista paginada, com filtros `status`, `transferTypeId`, `startDate`, `endDate` |
| `GET`  | `/transactions/:transactionExternalId` | Consulta uma transação específica                                              |
| `GET`  | `/transactions/stream`                 | Server-Sent Events com atualizações em tempo real                              |

## Kafka UI

Disponível em `http://localhost:8080` após `docker compose up -d` — útil para inspecionar
os tópicos `transaction.created` e `transaction.status.updated`.

## O que ficou de fora

Limitações e gaps assumidos conscientemente, detalhados com mais contexto no
[`DECISIONS.md`](./DECISIONS.md):

- **Testes de integração/e2e reais**: a cobertura atual é unitária, com `PrismaService` e
  `ClientKafka` mockados. Não há testes que rodem a aplicação completa contra um banco e
  um broker Kafka reais.
- **Tratamento de falha na publicação do evento Kafka**: se `kafkaClient.emit()` falhar
  silenciosamente, a transação permanece em `PENDING` sem que ninguém seja notificado. Não
  há retry automático nem job de reconciliação.
- **Catálogo de tipos de transferência**: `transferTypeId` é armazenado e ecoado como
  `transactionType.name`, mas não há validação contra uma lista de tipos válidos — o
  enunciado não define esse catálogo.
- **Entidade de conta**: `accountExternalIdDebit`/`accountExternalIdCredit` são
  armazenados como recebidos, sem validação de existência — não há conceito de conta ou
  usuário autenticado no sistema.
- **Otimizações de escala para alto volume**: read replica, lock otimista na atualização
  de status, particionamento de tabela e cache com TTL para dados agregados do dashboard
  são discutidos como próximos passos na resposta sobre volume alto de leituras/escritas
  concorrentes, mas não implementados.

## ⚠️ Rodando em um GitHub Codespace

Isso é importante e fácil de esquecer: em um Codespace, o navegador roda na sua máquina
local, não dentro do Codespace — então `localhost` nas variáveis de ambiente do frontend
não funciona para acesso via navegador (funciona normalmente para `curl`/testes dentro do
próprio terminal do Codespace, já que aí `localhost` é o Codespace mesmo).

Para testar pelo navegador:

1. Na aba **Ports** do VS Code, torne as portas `3000` e `3001` **Public** (clique
   direito → Port Visibility → Public).
2. Copie a URL pública encaminhada de cada porta (formato
   `https://SEU-CODESPACE-3000.app.github.dev`).
3. Em `apps/web/.env.local`, use a URL pública da porta `3001` (não `localhost:3001`):
   ```
   NEXT_PUBLIC_API_URL=https://SEU-CODESPACE-3001.app.github.dev
   NEXT_PUBLIC_SSE_URL=https://SEU-CODESPACE-3001.app.github.dev/transactions/stream
   ```
4. Em `apps/transactions/.env`, ajuste `CORS_ORIGIN` para a URL pública da porta `3000`
   (a origem de onde o navegador faz as requisições):
   ```
   CORS_ORIGIN="https://SEU-CODESPACE-3000.app.github.dev"
   ```
5. Reinicie `transactions` e `web` após qualquer mudança nesses arquivos — variáveis de
   ambiente só são lidas na inicialização do processo.

Essas URLs mudam a cada novo Codespace criado — se você recriar o ambiente, repita esses
quatro passos com o nome do novo Codespace.

### Nota: primeira inicialização com Kafka vazio

Em um broker Kafka totalmente novo (sem tópicos criados ainda), o `transactions` pode
falhar ao subir pela primeira vez com um erro de `UNKNOWN_TOPIC_OR_PARTITION` — é uma
condição de corrida transitória entre a criação automática do tópico e a eleição do líder
de partição. Basta reiniciar o serviço (`pnpm start:dev` de novo); na segunda tentativa o
tópico já existe e o processo sobe normalmente. Detalhado no `DECISIONS.md`.
