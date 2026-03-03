# UX Snapshot v1 — Estado visual atual (detalhado)

## 1) Leitura rápida do visual atual

- O produto está em dark-first, com linguagem visual técnica, compacta e informativa.
- A arquitetura visual é estável: navegação fixa + conteúdo modular em cartões + tabelas de dados.
- A experiência favorece densidade de informação (muitos números por tela), mais do que narrativa visual.
- As telas de operação real (Dashboard, Portfolio, Settings, Notifications) estão funcionais e consistentes entre si.
- As telas de expansão (Assets, Backtests, Signals) usam um mesmo padrão de placeholder educativo.

Evidências:
- Tokens e tema global: [frontend/app/globals.css](frontend/app/globals.css#L1-L27)
- Estrutura base do shell: [frontend/app/globals.css](frontend/app/globals.css#L30-L74)
- Componente de shell: [frontend/components/AppShell.js](frontend/components/AppShell.js#L70-L115)

---

## 2) Layout macro (como a UI se organiza)

### 2.1 Sidebar (desktop)

O que aparece:
- Bloco de marca (logo em grade + título BotBit + subtítulo).
- Navegação vertical por links com ícone textual.
- Rodapé lateral com status operativo (dot verde + chip LIVE).

Comportamento visual:
- Sidebar fixa à esquerda, largura 240px.
- Fundo com gradiente escuro e borda lateral.
- Item ativo em destaque por fundo/borda; hover com azul translúcido.

Evidências:
- Estrutura da sidebar: [frontend/components/AppShell.js](frontend/components/AppShell.js#L70-L103)
- Itens de navegação: [frontend/components/AppShell.js](frontend/components/AppShell.js#L7-L15)
- Estilo sidebar/nav: [frontend/app/globals.css](frontend/app/globals.css#L34-L66)

### 2.2 Topbar + área de conteúdo

O que aparece:
- Título de página, subtítulo contextual e ações à direita.
- Conteúdo principal abaixo, com espaçamento fixo e seções por cards.

Comportamento visual:
- Área principal compensada pela largura da sidebar no desktop.
- Topbar com alinhamento horizontal e wrap em ações.

Evidências:
- Estrutura topbar: [frontend/components/AppShell.js](frontend/components/AppShell.js#L104-L113)
- Regras de layout principal: [frontend/app/globals.css](frontend/app/globals.css#L70-L74)

### 2.3 Grade e ritmo

O que existe:
- Classes de grade prontas para 2, 3 e 4 colunas.
- Blocos com espaçamento curto entre componentes.

Evidências:
- Grids utilitárias: [frontend/app/globals.css](frontend/app/globals.css#L81-L85)

---

## 3) Design system real (estado atual)

### 3.1 Tokens e semântica de cor

Tokens ativos:
- Base: bg, bg2, panel, text, muted, line.
- Estado: accent, good, warn, danger.
- Estrutura: radius, shadow, transition, font.

Leitura visual:
- Contraste depende de camadas translúcidas; muitos elementos usam branco com opacidade baixa.
- Verde/laranja/vermelho funcionam como semântica de status e performance.

Evidências:
- Definição de tokens: [frontend/app/globals.css](frontend/app/globals.css#L1-L16)

### 3.2 Tipografia

Padrões observados:
- Fonte Inter com fallback system-ui.
- Tamanho dominante de microtexto: 11–13px.
- Números de KPI em 22px; título de página 18px.
- Forte uso de mono para números e valores financeiros.

Evidências:
- Fonte e base body: [frontend/app/globals.css](frontend/app/globals.css#L14-L27)
- Título/subtítulo da topbar: [frontend/app/globals.css](frontend/app/globals.css#L72-L74)
- Classe mono: [frontend/app/globals.css](frontend/app/globals.css#L101-L101)

### 3.3 Superfícies e componentes de base

Padrões:
- Card com fundo gradiente sutil + painel escuro + borda + sombra longa.
- Tabela com cabeçalho destacado, linhas densas e borda contínua.
- Chips e badges arredondados para estado/status/tag.
- Barra horizontal de score/progresso.

Evidências:
- Card: [frontend/app/globals.css](frontend/app/globals.css#L87-L93)
- Tabela: [frontend/app/globals.css](frontend/app/globals.css#L134-L140)
- Chip/badge/bar: [frontend/app/globals.css](frontend/app/globals.css#L124-L132)

### 3.4 Estados visuais

Estados mapeados:
- Hover em links, tabs e botões.
- Active em menu lateral e tabs.
- Estados semânticos BUY/WAIT/AVOID e prioridades P0..P3.
- Empty states customizados no dashboard/discover/watchlist.

Evidências:
- Hover/active nav: [frontend/app/globals.css](frontend/app/globals.css#L63-L64)
- Tabs dashboard: [frontend/app/globals.css](frontend/app/globals.css#L463-L483)
- Prioridades notificação: [frontend/app/globals.css](frontend/app/globals.css#L368-L371)
- Empty state: [frontend/app/globals.css](frontend/app/globals.css#L546-L554)

### 3.5 Tailwind no projeto

- Tailwind está presente no projeto, mas com content vazio; UI prática é CSS global manual.

Evidências:
- Configuração: [frontend/tailwind.config.js](frontend/tailwind.config.js#L1-L8)

---

## 4) Responsividade e mobile

### 4.1 Mudanças no breakpoint principal

No max-width 1100px:
- Sidebar deixa de ser coluna lateral e vira barra no topo.
- Navegação vira grid horizontal de 4 colunas.
- Ícones da nav somem para ganhar espaço.
- Rodapé da sidebar é ocultado.
- Main passa a ocupar largura total.
- Topbar vira sticky abaixo da barra superior.
- Grids colapsam para 1 coluna.

Evidências:
- Media query e comportamento: [frontend/app/globals.css](frontend/app/globals.css#L303-L323)

### 4.2 Drawer/painel lateral

- O AssetDetailPanel usa overlay fixo e painel à direita no desktop.
- Em mobile vira sheet inferior com cantos arredondados e altura limitada.

Evidências:
- Overlay/panel desktop: [frontend/app/globals.css](frontend/app/globals.css#L268-L301)
- Adaptação mobile: [frontend/app/globals.css](frontend/app/globals.css#L316-L323)

---

## 5) Componentização visual existente

### 5.1 Componentes reaproveitáveis de fato

- AppShell centraliza navegação/estrutura de página.
- AssetDetailPanel centraliza o detalhamento lateral por ativo.

Arquivos:
- [frontend/components/AppShell.js](frontend/components/AppShell.js)
- [frontend/components/AssetDetailPanel.js](frontend/components/AssetDetailPanel.js)

### 5.2 O que ainda está hardcoded em páginas

- Cards de KPI, tabelas, filtros, painéis de status e blocos de conteúdo textual.
- Não há biblioteca local de primitives UI (Card, DataGrid, Modal, Toast, etc.)

Evidências:
- Componentes existentes: [frontend/components](frontend/components)

---

## 6) Detalhe visual por rota

## 6.1 /

Visual:
- Página mínima com card simples e link para login.
- Sem uso do shell principal.

Arquivo:
- [frontend/app/page.js](frontend/app/page.js#L3-L12)

## 6.2 /login

Visual:
- Tela centrada com card único, logo, branding, features e botão principal.
- Linguagem mais “marketing/onboarding” que o restante do app.

Detalhes:
- Fundo radial escuro.
- Card com borda, sombra forte e texto explicativo.

Evidências:
- Estrutura: [frontend/app/login/page.js](frontend/app/login/page.js#L9-L96)
- Estilos login: [frontend/app/globals.css](frontend/app/globals.css#L328-L365)

## 6.3 /dashboard

Visual:
- Tabs internas (Mercado, Watchlist, Discover).
- Mercado: cards de topo + tabela de ranking + iframe de gráfico.
- Watchlist: formulário + atalhos + tabela + empty state.
- Discover: filtros + tabela com tags + status de inclusão em watchlist.

Interação visual:
- Clique em linha/card abre AssetDetailPanel.
- Cores de score/sinal/regime orientam leitura rápida.

Evidências:
- Estrutura principal e tabs: [frontend/app/dashboard/page.js](frontend/app/dashboard/page.js#L590-L646)
- Mercado: [frontend/app/dashboard/page.js](frontend/app/dashboard/page.js#L79-L236)
- Watchlist: [frontend/app/dashboard/page.js](frontend/app/dashboard/page.js#L239-L409)
- Discover: [frontend/app/dashboard/page.js](frontend/app/dashboard/page.js#L412-L586)

## 6.4 /discover e /watchlist

Visual:
- Não têm interface própria; redirecionam para tabs do Dashboard.

Arquivos:
- [frontend/app/discover/page.js](frontend/app/discover/page.js#L4-L7)
- [frontend/app/watchlist/page.js](frontend/app/watchlist/page.js#L4-L7)

## 6.5 /portfolio

Visual:
- Bloco de contexto de modo (PAPER/TESTNET/LIVE), KPIs, seção explicativa IA e 2 tabelas.
- Forte foco em leitura operacional (posição, risco, ordens).

Evidências:
- Estrutura: [frontend/app/portfolio/page.js](frontend/app/portfolio/page.js#L37-L206)

## 6.6 /notifications

Visual:
- Card de filtros no topo + tabela de eventos.
- Badges de prioridade e etiqueta de item novo.
- Linha não lida com destaque de fundo.

Evidências:
- Estrutura: [frontend/app/notifications/page.js](frontend/app/notifications/page.js#L37-L145)
- Estilo unread: [frontend/app/globals.css](frontend/app/globals.css#L374-L374)

## 6.7 /settings

Visual:
- Página mais extensa; tabs internas Profile/Trading/Costs.
- Profile: formulário de preferências.
- Trading: status, controles, emergency stop, limites.
- Costs: cards de custo + tabela top serviços.

Evidências:
- Estrutura geral: [frontend/app/settings/page.js](frontend/app/settings/page.js#L38-L462)
- Estilos tabs/settings: [frontend/app/globals.css](frontend/app/globals.css#L216-L266)

## 6.8 /trading e /costs

Visual:
- Sem tela própria; redirecionam para aba correspondente em Settings.

Arquivos:
- [frontend/app/trading/page.js](frontend/app/trading/page.js#L3-L4)
- [frontend/app/costs/page.js](frontend/app/costs/page.js#L3-L4)

## 6.9 /assets, /backtests, /signals

Visual:
- Cada uma exibe card “Em breve” com texto educativo e bullet points de roadmap.
- Mesmo padrão visual e de composição.

Arquivos:
- [frontend/app/assets/page.js](frontend/app/assets/page.js#L5-L23)
- [frontend/app/backtests/page.js](frontend/app/backtests/page.js#L5-L23)
- [frontend/app/signals/page.js](frontend/app/signals/page.js#L5-L23)

## 6.10 /ajuda

Visual:
- Página longa de conteúdo pedagógico com seções colapsáveis, glossário e FAQ.
- Forte foco textual e explicativo, menos foco em dados em tempo real.

Evidências:
- Estrutura da página: [frontend/app/ajuda/page.js](frontend/app/ajuda/page.js#L463-L480)
- Estilos help/faq/glossário: [frontend/app/globals.css](frontend/app/globals.css#L378-L445)

---

## 7) Mapa de rotas visuais (resumo)

- /: home mínima, fora do shell
- /login: autenticação centrada
- /dashboard: hub visual principal
- /discover: redirect para /dashboard?tab=discover
- /watchlist: redirect para /dashboard?tab=watchlist
- /portfolio: visão operacional de posições
- /notifications: fila de alertas e eventos
- /settings: configuração completa (profile/trading/costs)
- /trading: redirect para settings/trading
- /costs: redirect para settings/costs
- /assets, /backtests, /signals: placeholders “Em breve”
- /ajuda: documentação guiada no próprio frontend

Evidência estrutural do app router:
- [frontend/app](frontend/app)

