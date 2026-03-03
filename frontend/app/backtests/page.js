"use client";

import AppShell from "../../components/AppShell";

export default function BacktestsPage() {
  return (
    <AppShell title="Backtests" subtitle="Simulação histórica de estratégia">
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(255,255,255,0.02))", borderColor: "rgba(59,130,246,0.2)" }}>
        <div className="card-title"><strong>Em breve</strong><span className="chip badge wait">Próxima versão</span></div>
        <p className="settings-help" style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--text)" }}>O que é um backtest?</strong><br />
          É o teste da estratégia do robô aplicada a dados históricos. Em vez de esperar meses para ver se o robô funciona, simulamos como ele teria se saído nos últimos 6, 12 ou 24 meses.
        </p>
        <p className="settings-help"><strong style={{ color: "var(--text)" }}>O que vai aparecer aqui:</strong></p>
        <ul style={{ margin: "6px 0 0 16px", color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
          <li>Resultado histórico por ativo (% de ganho/perda)</li>
          <li>Número de trades vencedores vs perdedores</li>
          <li>Melhor e pior período de operação</li>
          <li>Comparação entre diferentes configurações de score mínimo</li>
        </ul>
      </div>
    </AppShell>
  );
}
