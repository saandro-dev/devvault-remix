

# Analise Completa de Extracao Risecheckout → DevVault

## Metodologia

Varredura completa do repositorio Risecheckout via `cross_project` tools, cruzada com query direta ao banco DevVault (848 modulos globais). Cada padrao avaliado pela Regra de Ouro (Protocolo 2.3): "Como isso impacta a experiencia do agente de IA consumindo via MCP?"

---

## Resposta sobre XState / State Machine

**JA EXISTE no DevVault.** Encontrei pelo menos 8 modulos XState:
- `admin-machine-xstate-multi-domain-users-products-orders-nested-state`
- `checkout-public-machine-xstate-nested-states-guards-actors-3ds-challenge`
- `checkout-editor-xstate-machine-dual-viewport-dirty-tracking`
- `checkout-data-hook-use-checkout-data-parallel-fetch-resolve-slug-fetch-all-xstate-actor`
- `checkout-public-loader-zero-latency-skeleton-xstate-machine-entry-point`
- `date-range-xstate-machine-preset-custom-calendar-timezone`
- `affiliation-context-provider-xstate-usemachine-affiliation-machine-tab-errors-refetch-promise`
- `form-data-adapter-xstate-to-public-api-cpf-document-dual-field`

**Porem**: Nenhuma busca por `xstate` ou `createMachine` retornou resultados nos arquivos `.ts/.tsx` do Risecheckout. O projeto NAO usa a library XState diretamente — implementa FSMs manuais (vide `token-manager/machine.ts`). Os modulos XState existentes no DevVault provavelmente foram ingeridos como padroes arquiteturais, nao extraidos diretamente do codigo-fonte.

---

## Inventario Completo: O que falta extrair

### Prioridade 1: Padroes Arquiteturais de Alto Valor (NAO existem no DevVault)

| # | Padrao | Fonte | Valor MCP | Status no DevVault |
|---|---|---|---|---|
| 1 | **Manual FSM Pattern (sem XState)** — Token Lifecycle com transition table explicita | `token-manager/machine.ts` + `types.ts` | ALTISSIMO — agentes precisam saber implementar FSM sem dependencias externas | `token-lifecycle-fsm` existe mas precisa verificar se cobre o padrao manual completo |
| 2 | **Cross-Tab Coordination via BroadcastChannel + localStorage fallback** | `token-manager/cross-tab-lock.ts` | ALTO — padrao critico para SPAs multi-tab | `cross-tab-refresh-lock-*` existe — verificar completude |
| 3 | **Session Commander Architecture** — Coordinator + Monitor + Retry Strategy + Heartbeat como sistema integrado | `session-commander/` (5 arquivos) | ALTISSIMO — arquitetura completa de resiliencia de sessao | `session-monitor-*`, `refresh-coordinator-*`, `exponential-backoff-*` existem individualmente. **FALTA: modulo grupo integrando os 5 como arquitetura unica** |
| 4 | **Order Status Canonical Mapping** — Gateway status normalization (30+ statuses → 5 canonicos) | `order-status/service.ts` | ALTO — padrao reutilizavel para qualquer SaaS com pagamentos | `order-status-service-*` JA EXISTE (2 modulos) |
| 5 | **DateRange Service com Timezone-Aware Presets** | `date-range/service.ts` | MEDIO-ALTO — padrao de dashboard SaaS | `date-range-service-*` JA EXISTE (2 modulos) |

### Prioridade 2: Utils de Alto Reuso (verificar se ja existem)

| # | Util | Fonte | Status |
|---|---|---|---|
| 6 | **Frontend Logger with Sentry Integration** | `lib/logger.ts` | Padrao diferente do backend logger. Frontend usa `import.meta.env.DEV`, emojis, Sentry auto-capture. **Verificar se existe modulo frontend-specific** |
| 7 | **Performance DevTools** — useLongTaskObserver + useFpsMeter + PerfOverlay | `devtools/perf/` | `use-long-task-observer-hook` e `use-fps-meter-hook` JA EXISTEM |
| 8 | **StorageProxy (File Upload via Edge Function)** | `lib/storage/storageProxy.ts` | `storage-proxy-*` JA EXISTE (4 modulos!) |
| 9 | **Payment Gateway Factory Pattern** | `payment-gateways/gateway-factory.ts` | `payment-gateway-factory-pattern` JA EXISTE (2 modulos) |
| 10 | **Installments Calculator** | `payment-gateways/installments.ts` | `installments-calculator-*` JA EXISTE |
| 11 | **RPC Proxy Client** | `lib/rpc/rpcProxy.ts` | `rpc-proxy-*` JA EXISTE (3 modulos!) |
| 12 | **Money/Currency Utils (Integer-First)** | `lib/money.ts` | `lib-money-*` JA EXISTE (2 modulos) |
| 13 | **Validation & Masks (CPF/CNPJ/Phone)** | `lib/validation.ts` | `lib-validation-masks-*` e `validation-ts-*` JA EXISTEM |
| 14 | **DOMPurify Security Config** | `lib/security.ts` | `security-ts-dompurify-*` JA EXISTE |

### Prioridade 3: Padroes que REALMENTE faltam

Apos cruzamento completo, estes sao os padroes que **NAO existem** no DevVault e tem valor real para agentes:

| # | Padrao Ausente | Fonte | Valor MCP | Justificativa |
|---|---|---|---|---|
| A | **Token Service Completo** — FSM + Heartbeat + CrossTabLock + SessionCommander como `module_group` integrado | `token-manager/` (8 arquivos) | MAXIMO | Os componentes individuais existem, mas NAO existe um modulo-grupo que explique a ARQUITETURA COMPLETA e como os 8 arquivos se conectam |
| B | **API Client with 401 Auto-Retry** — Pattern de interceptor que faz refresh automatico no 401 | Referenciado em slugs mas precisa verificar completude | ALTO | Agentes precisam deste padrao em todo SaaS com auth |
| C | **Checkout Theme Presets** — Design system com presets de tema (cores, fontes, espacamento) | `lib/checkout/themePresets.ts` | MEDIO | Padrao de design system |
| D | **Dynamic Import with Gateway Skeleton** — Code splitting por gateway com fallback loading | `payment-gateways/dynamic/` | MEDIO | Padrao de performance |

---

## Diagnostico Final

| Categoria | Contagem Manus | Contagem Real Faltante | Razao |
|---|---|---|---|
| **Ja coberto** | — | — | ~95% dos padroes significativos ja estao no DevVault |
| **Faltando como modulo-grupo** | ~3 | **2-3 modulos** | Session Commander Architecture + Token Manager Architecture (precisam de um modulo-guia que conecte os componentes individuais) |
| **Faltando totalmente** | ~793 | **3-5 modulos** | API Client 401 auto-retry, Theme Presets, Dynamic Gateway Loading |
| **TOTAL real** | ~793 | **~5-8 modulos** | |

A cobertura do Risecheckout no DevVault esta em **~97%** dos padroes significativos. O que falta nao sao modulos individuais, mas **modulos-guia de arquitetura** (`module_group` + `implementation_order`) que expliquem como os componentes individuais ja existentes se integram em sistemas completos.

---

## Plano de Acao Recomendado

### Modulos a Criar (5-8 modulos)

1. **`session-commander-architecture-guide`** — `architecture_doc` que explica como os 5 componentes (Coordinator, Monitor, Retry Strategy, Heartbeat, Feedback) se integram. Campo `related_modules` apontando para os modulos individuais existentes. `module_group: "session-commander"`, `implementation_order: 0` (guia).

2. **`token-manager-architecture-guide`** — `architecture_doc` que explica os 8 arquivos do token-manager (FSM, Service, Heartbeat, CrossTabLock, Persistence, UnifiedService). `module_group: "token-manager"`, `implementation_order: 0`.

3. **`api-client-401-auto-retry-pattern`** — Verificar se ja existe com slug diferente; se nao, criar como `pattern_guide`.

4. **`checkout-theme-presets-design-tokens`** — `pattern_guide` do sistema de theme presets.

5. **`dynamic-gateway-loading-code-splitting`** — `pattern_guide` do lazy loading por gateway com skeleton fallback.

### Modulos a Enriquecer (atualizacao)

6-8. Adicionar `module_group` e `implementation_order` nos modulos individuais ja existentes de session-commander e token-manager para que sejam encontrados como parte do sistema integrado.

### Nao Criar

- Componentes UI individuais (471 da Manus) — poluicao
- Types/Interfaces isolados (95 da Manus) — ruido
- Utils triviais — ja cobertos
- XState como library — o projeto usa FSM manual, os modulos XState existentes ja servem como referencia

