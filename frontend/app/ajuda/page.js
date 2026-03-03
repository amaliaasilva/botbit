"use client";

import AppShell from "../../components/AppShell";
import { useState } from "react";

const SECTIONS = [
  {
    id: "o-que-e",
    title: "O que é o BotBit?",
    icon: "◈",
    content: [
      {
        type: "text",
        text: "O BotBit é um robô de análise e trading de criptomoedas. Ele olha o mercado a cada 5 minutos, calcula um score de qualidade para cada ativo e decide automaticamente se é hora de comprar, esperar ou sair de uma posição.",
      },
      {
        type: "text",
        text: "Você não precisa ficar olhando a tela. O robô faz isso por você. Você configura as regras de risco, escolhe o modo (simular ou operar de verdade) e monitora os resultados pelas páginas do app.",
      },
    ],
  },
  {
    id: "como-funciona",
    title: "Como o robô decide comprar ou vender?",
    icon: "◇",
    content: [
      {
        type: "steps",
        steps: [
          {
            label: "1. Coleta de dados",
            text: "A cada 5 minutos, o robô busca os preços das 50 principais criptomoedas na Binance.",
          },
          {
            label: "2. Cálculo de indicadores",
            text: "Para cada ativo, calcula EMA, RSI, volume e volatilidade — são métricas que mostram a força e a tendência do preço.",
          },
          {
            label: "3. Score de qualidade (0–100)",
            text: "Esses indicadores são combinados em um score. Score alto = ativo com boa tendência e baixo risco. Score baixo = ativo fraco ou instável.",
          },
          {
            label: "4. Classificação de régime",
            text: "O robô identifica se o mercado está em alta, queda, lateral ou neutro. Isso define a estratégia a ser usada.",
          },
          {
            label: "5. Sinal de ação",
            text: "Com base no score e no regime, o robô gera um sinal: BUY (compra), SELL (venda) ou WAIT (aguardar).",
          },
          {
            label: "6. Proteção automática",
            text: "Se comprar, o robô coloca automaticamente um stop-loss (proteção de perda) e um take-profit (alvo de ganho) para sair na hora certa.",
          },
        ],
      },
    ],
  },
  {
    id: "modos",
    title: "Modos de operação: PAPER, TESTNET e LIVE",
    icon: "◍",
    content: [
      {
        type: "cards",
        cards: [
          {
            label: "PAPER",
            badge: "Seguro para começar",
            badgeClass: "badge buy",
            text: "Tudo simulado. O robô opera como se fosse de verdade, mas sem gastar nenhum dinheiro real. Ideal para entender como funciona antes de ativar com dinheiro real.",
          },
          {
            label: "TESTNET",
            badge: "Ambiente de teste",
            badgeClass: "badge wait",
            text: "Usa o ambiente de teste da Binance, com moedas fictícias. Parecido com dinheiro real, mas sem risco. Bom para validar que as chaves da API estão funcionando.",
          },
          {
            label: "LIVE",
            badge: "Produção real",
            badgeClass: "badge avoid",
            text: "Modo real. O robô opera com o seu saldo na Binance. Use somente quando estiver confortável com o comportamento do robô e tiver revisado os limites de risco.",
          },
        ],
      },
    ],
  },
  {
    id: "glossario",
    title: "Glossário completo (termos explicados)",
    icon: "▦",
    content: [
      {
        type: "glossary",
        terms: [
          {
            term: "Score (0–100)",
            def: "Nota de qualidade do ativo naquele momento. Quanto maior, melhor a chance de o robô decidir entrar na posição. Abaixo de 20 = fraco, 20–49 = médio, 50–69 = bom, 70–100 = excelente.",
          },
          {
            term: "Regime de mercado",
            def: "Estado geral do mercado para aquele ativo: BULLISH (tendência de alta), BEARISH (tendência de queda), NEUTRAL (sem tendência clara) ou LATERAL (preço andando de lado).",
          },
          {
            term: "Sinal (BUY / SELL / WAIT)",
            def: "O que o robô recomenda fazer naquele instante. BUY = considerar compra, SELL = sair da posição, WAIT = não fazer nada ainda.",
          },
          {
            term: "EMA (Média Móvel Exponencial)",
            def: "Linha que mostra a tendência recente do preço, dando mais peso aos preços mais novos. EMA200 é o referencial de tendência longa; EMA9/EMA21 são mais rápidas e mostram movimentos recentes.",
          },
          {
            term: "RSI (Índice de Força Relativa)",
            def: "Mede se um ativo está sobrecomprado ou sobrevendido, numa escala de 0 a 100. Acima de 70 = provável correção (preço pode cair). Abaixo de 30 = possível recuperação (preço pode subir).",
          },
          {
            term: "PnL (Profit and Loss)",
            def: "Lucro ou prejuízo de uma posição. PnL positivo = você está ganhando. Negativo = você está perdendo. O robô mostra o PnL 'não realizado' (enquanto a posição está aberta) e o realizado (após sair).",
          },
          {
            term: "PnL não realizado",
            def: "Quanto você ganharia ou perderia SE vendesse agora. Não é dinheiro na conta ainda — só vira real quando fechar a posição.",
          },
          {
            term: "Stop-loss (Stop)",
            def: "Preço de segurança abaixo do preço de entrada. Se o ativo cair até esse preço, o robô vende automaticamente para limitar a perda. Exemplo: entrou a $100, stop em $95 = perde no máximo 5%.",
          },
          {
            term: "Take-profit (Take)",
            def: "Preço alvo de lucro acima do preço de entrada. Se o ativo subir até esse preço, o robô vende automaticamente para garantir o ganho. Exemplo: entrou a $100, take em $110 = lucra 10%.",
          },
          {
            term: "OCO (One-Cancels-the-Other)",
            def: "Ordem dupla que combina stop-loss e take-profit ao mesmo tempo na exchange. Quando um dos dois é atingido, o outro é cancelado automaticamente. É a proteção automática do robô.",
          },
          {
            term: "Watchlist",
            def: "Sua lista pessoal de ativos para monitorar de perto. Você escolhe quais criptomoedas quer acompanhar e elas ficam com score e sinal visíveis em tempo real.",
          },
          {
            term: "Discover",
            def: "Scanner automático que varre as 50 maiores criptomoedas da Binance e mostra as que têm maior potencial de entrada segundo os critérios do robô.",
          },
          {
            term: "Exposição",
            def: "Percentual do seu patrimônio que está atualmente investido em posições abertas. Alta exposição = mais risco. O robô limita isso automaticamente.",
          },
          {
            term: "Cash (USDT)",
            def: "Saldo livre em dólares digitais (USDT) disponível para novas entradas. Em PAPER, é simulado. Em LIVE, é o saldo real da sua conta Binance.",
          },
          {
            term: "Equity",
            def: "Patrimônio total estimado: saldo livre + valor das posições abertas + lucros/prejuízos não realizados.",
          },
          {
            term: "Allocation %",
            def: "Percentual do equity comprometido em uma posição específica. Robô limita por padrão o máximo por trade para não concentrar tudo em um ativo.",
          },
          {
            term: "Cooldown",
            def: "Período de descanso obrigatório entre trades. Evita que o robô entre e saia muitas vezes seguidas no mesmo ativo.",
          },
          {
            term: "Emergency Stop",
            def: "Botão de emergência que desliga o robô imediatamente. Use quando o mercado estiver caindo muito ou você quiser pausar tudo com urgência.",
          },
          {
            term: "Volatilidade",
            def: "Medida de quanto o preço oscila num período. Alta volatilidade = preço sobe e cai muito. O robô considera isso no cálculo do stop e do tamanho da posição.",
          },
          {
            term: "Volume",
            def: "Quantidade de negociações realizadas num período. Alto volume confirma que o movimento do preço é real e não apenas especulação de poucos.",
          },
          {
            term: "ATR (Average True Range)",
            def: "Mede a volatilidade média do ativo. Quanto maior o ATR, mais largas precisam ser as margens de stop e take para não fechar a posição por ruído normal do mercado.",
          },
          {
            term: "P0 / P1 / P2 / P3",
            def: "Nível de prioridade das notificações. P0 = crítico (algo saiu errado, ação urgente). P1 = importante (trade executado, stop atingido). P2 = informativo (mudança de regime). P3 = baixa prioridade (registro normal).",
          },
          {
            term: "Binance",
            def: "Exchange (corretora) de criptomoedas onde o robô executa as ordens quando em modo TESTNET ou LIVE.",
          },
          {
            term: "USDT",
            def: "Stablecoin pareada ao dólar americano. O robô usa USDT como moeda base para comprar e guardar saldo. 1 USDT ≈ 1 USD.",
          },
          {
            term: "Par de trading",
            def: "Combinação de dois ativos. Ex: BTCUSDT = Bitcoin comprado com USDT. ETHUSDT = Ethereum comprado com USDT.",
          },
        ],
      },
    ],
  },
  {
    id: "calculos",
    title: "Como os cálculos funcionam (sem complicar)",
    icon: "◎",
    content: [
      {
        type: "calc-cards",
        items: [
          {
            label: "Cálculo do Score",
            formula: "Score = combinação ponderada de: trend (EMA), momentum (RSI), volume e volatilidade",
            explain:
              "Cada indicador recebe um peso. Por exemplo: a tendência (EMA) vale mais do que o volume. O resultado final é um número de 0 a 100. O robô só entra se o score for alto o suficiente (padrão: ≥ 70 no modo conservador).",
          },
          {
            label: "Cálculo do Stop-loss",
            formula: "Stop = preço de entrada − (ATR × multiplicador)",
            explain:
              "O ATR mede quanto o preço costuma oscilar. O stop é colocado abaixo dessa oscilação normal, para não sair por acidente. Exemplo: entrou a $100, ATR = $2, multiplicador = 1.5 → stop em $97.",
          },
          {
            label: "Cálculo do Take-profit",
            formula: "Take = preço de entrada + (distância do stop × ratio risco/retorno)",
            explain:
              "Se o stop perde $3, o take ganha $6 (ratio 2:1). Isso garante que, mesmo que metade das operações dê errado, o saldo geral ainda seja positivo.",
          },
          {
            label: "Tamanho da posição",
            formula: "Qty = (equity × risco por trade %) ÷ distância do stop",
            explain:
              "O robô calcula quanto comprar baseado em quantos % do patrimônio você aceita perder naquela operação. Assim a perda máxima é controlada independente do preço do ativo.",
          },
          {
            label: "PnL não realizado",
            formula: "PnL = (preço atual − preço de entrada) × quantidade",
            explain:
              "Se entrou a $10, está em $11 e tem 5 moedas: PnL = ($11 − $10) × 5 = $5. Se o preço cair para $9: PnL = ($9 − $10) × 5 = −$5.",
          },
        ],
      },
    ],
  },
  {
    id: "paginas",
    title: "O que cada página do app faz",
    icon: "⚙",
    content: [
      {
        type: "pages",
        pages: [
          {
            label: "Dashboard",
            icon: "▦",
            text: "Visão geral do mercado. Mostra os principais ativos da sua watchlist com score, sinal e preço em tempo real. Ponto de partida para entender o estado atual do mercado.",
          },
          {
            label: "Portfolio",
            icon: "◈",
            text: "Seu saldo e posições abertas. Mostra quanto você tem em caixa, quanto está exposto, e para cada posição: preço de entrada, preço atual, lucro/prejuízo e proteções (stop/take).",
          },
          {
            label: "Watchlist",
            icon: "◎",
            text: "Sua lista pessoal de criptomoedas para acompanhar. Adicione qualquer par (ex: BTCUSDT) e veja score, regime e sinal atualizados. Clique no ativo para abrir análise detalhada.",
          },
          {
            label: "Discover",
            icon: "◇",
            text: "Scanner automático das 50 maiores criptos. Filtre pelo score mínimo e veja quais estão com maior potencial agora. Adicione diretamente à Watchlist pelo botão na tabela.",
          },
          {
            label: "Notifications",
            icon: "◍",
            text: "Central de alertas. Receba avisos quando o robô comprar, vender, atingir stop/take ou encontrar algum problema. P0 = urgente, P1 = importante, P2 = info, P3 = registro.",
          },
          {
            label: "Settings",
            icon: "⚙",
            text: "Configurações do robô. Escolha o modo (PAPER/TESTNET/LIVE), ajuste limites de risco, ative/pause o trading, use o Emergency Stop e veja os custos da infraestrutura em nuvem.",
          },
          {
            label: "Ajuda",
            icon: "?",
            text: "Esta página. Glossário completo, explicação de como o robô funciona, como os cálculos são feitos e o que cada página do app significa.",
          },
        ],
      },
    ],
  },
  {
    id: "faq",
    title: "Perguntas frequentes",
    icon: "?",
    content: [
      {
        type: "faq",
        items: [
          {
            q: "Preciso entender de finanças para usar?",
            a: "Não. O robô decide sozinho quando comprar e vender. Você só precisa definir em qual modo quer operar e revisar os alertas. Esta página de Ajuda explica tudo que aparece no app.",
          },
          {
            q: "Em PAPER, há risco de perder dinheiro?",
            a: "Não. Em PAPER tudo é simulado. Nenhuma ordem real é enviada à Binance. É o modo ideal para aprender e testar.",
          },
          {
            q: "O que acontece se o mercado cair muito?",
            a: "O stop-loss fecha a posição automaticamente limitando o prejuízo ao valor configurado. Você também pode usar o Emergency Stop nas configurações para parar tudo imediatamente.",
          },
          {
            q: "Posso perder mais do que configurei no stop?",
            a: "Em condições normais, não. Em eventos extremos (queda muito rápida), o preço pode 'pular' o stop, mas isso é raro. O robô também tem limite de perda diária que trava operações se atingido.",
          },
          {
            q: "O que é o score mínimo de 70?",
            a: "É o limiar padrão: o robô só entra em ativos com score ≥ 70 (modo conservador). Você pode reduzir esse valor nas configurações para o robô ser mais agressivo, mas mais risco.",
          },
          {
            q: "As notificações chegam por email?",
            a: "Sim, se você configurar o email em Settings > Perfil e ativar as notificações. Também aparecem em tempo real dentro do app na página Notifications.",
          },
          {
            q: "O que é USDT?",
            a: "Uma criptomoeda estável que sempre vale aproximadamente 1 dólar americano. O robô usa USDT como saldo base — compra os ativos com USDT e vende de volta para USDT.",
          },
        ],
      },
    ],
  },
];

function GlossaryItem({ term, def }) {
  return (
    <div className="glossary-item">
      <div className="glossary-term">{term}</div>
      <div className="glossary-def">{def}</div>
    </div>
  );
}

function StepItem({ label, text }) {
  return (
    <div className="help-step">
      <div className="help-step-label">{label}</div>
      <div className="help-step-text">{text}</div>
    </div>
  );
}

function CalcCard({ label, formula, explain }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-title"><strong>{label}</strong></div>
      <div className="help-formula">{formula}</div>
      <p className="settings-help" style={{ marginTop: 6 }}>{explain}</p>
    </div>
  );
}

function ModeCard({ label, badge, badgeClass, text }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-title"><strong>{label}</strong><span className={`chip ${badgeClass}`}>{badge}</span></div>
      <p className="settings-help" style={{ marginTop: 6 }}>{text}</p>
    </div>
  );
}

function PageCard({ label, icon, text }) {
  return (
    <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <span style={{ fontSize: 22, opacity: 0.7, marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <p className="settings-help" style={{ margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item">
      <button type="button" className="faq-question" onClick={() => setOpen((v) => !v)}>
        <span>{q}</span>
        <span className="faq-toggle">{open ? "▲" : "▼"}</span>
      </button>
      {open ? <div className="faq-answer">{a}</div> : null}
    </div>
  );
}

function Section({ section }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        type="button"
        className="help-section-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 18, opacity: 0.7 }}>{section.icon}</span>
        <strong style={{ flex: 1, textAlign: "left" }}>{section.title}</strong>
        <span style={{ opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div style={{ marginTop: 12 }}>
          {section.content.map((block, idx) => {
            if (block.type === "text") {
              return <p key={idx} className="settings-help" style={{ marginBottom: 8 }}>{block.text}</p>;
            }
            if (block.type === "steps") {
              return (
                <div key={idx} className="help-steps">
                  {block.steps.map((step, i) => <StepItem key={i} {...step} />)}
                </div>
              );
            }
            if (block.type === "cards") {
              return (
                <div key={idx}>
                  {block.cards.map((card, i) => <ModeCard key={i} {...card} />)}
                </div>
              );
            }
            if (block.type === "glossary") {
              return (
                <div key={idx} className="glossary-list">
                  {block.terms.map((item, i) => <GlossaryItem key={i} {...item} />)}
                </div>
              );
            }
            if (block.type === "calc-cards") {
              return (
                <div key={idx}>
                  {block.items.map((item, i) => <CalcCard key={i} {...item} />)}
                </div>
              );
            }
            if (block.type === "pages") {
              return (
                <div key={idx}>
                  {block.pages.map((page, i) => <PageCard key={i} {...page} />)}
                </div>
              );
            }
            if (block.type === "faq") {
              return (
                <div key={idx} className="faq-list">
                  {block.items.map((item, i) => <FaqItem key={i} {...item} />)}
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function AjudaPage() {
  return (
    <AppShell
      title="Ajuda & Glossário"
      subtitle="Tudo explicado de forma simples — sem jargão técnico"
    >
      <div className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(59,130,246,0.04) 100%)", border: "1px solid rgba(96,165,250,0.2)" }}>
        <div className="card-title"><strong>Bem-vinda ao guia do BotBit</strong><span className="chip badge buy">Para leigos</span></div>
        <p className="settings-help">
          Aqui você encontra explicações simples de todos os termos, como o robô toma decisões, o que cada número significa e o que fazer em cada situação.
          Clique em qualquer seção para expandir ou recolher.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </AppShell>
  );
}
