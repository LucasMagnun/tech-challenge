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
