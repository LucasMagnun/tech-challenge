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
   cd apps/transactions && pnpm start:dev   # http://localhost:3000
   ```

   ```bash
   cd apps/anti-fraud && pnpm start:dev
   ```

   ```bash
   cd apps/web && pnpm dev                   # http://localhost:3001
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

## Endpoints principais (`transactions`)

| Método | Rota                                   | Descrição                                                                      |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| `POST` | `/transactions`                        | Cria uma transação (status inicial `PENDING`)                                  |
| `GET`  | `/transactions`                        | Lista paginada, com filtros `status`, `transferTypeId`, `startDate`, `endDate` |
| `GET`  | `/transactions/:transactionExternalId` | Consulta uma transação específica                                              |
| `GET`  | `/transactions/stream`                 | Server-Sent Events com atualizações em tempo real                              |

## Kafka UI

Disponível em `http://localhost:8080` após `docker compose up -d` — útil para inspecionar
os tópicos `transaction.created` e `transaction.status.updated`.

## Testando em um Codespace

Se estiver rodando em um GitHub Codespace, as portas `3000`, `3001` e `8080` precisam
estar com visibilidade **Public** (aba **Ports** do VS Code) para acesso via navegador, e
as variáveis `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SSE_URL` (em `apps/web/.env.local`) e
`CORS_ORIGIN` (em `apps/transactions/.env`) precisam refletir as URLs públicas
encaminhadas pelo Codespace, não `localhost`.
