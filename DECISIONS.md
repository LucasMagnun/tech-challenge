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
