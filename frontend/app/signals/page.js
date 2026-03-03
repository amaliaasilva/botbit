"use client";

import AppShell from "../../components/AppShell";

export default function SignalsPage() {
  return (
    <AppShell title="Signals" subtitle="Eventos e mudanças de regime">
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(255,255,255,0.02))", borderColor: "rgba(59,130,246,0.2)" }}>
        <div className="card-title"><strong>Em breve</strong><span className="chip badge wait">Próxima versão</span></div>
        <p className="settings-help" style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--text)" }}>O que são signals?</strong><br />
          São os eventos de decisão do robô ao longo do tempo: cada vez que o score ultrapassou o limite, o regime mudou ou um sinal de compra/venda foi gerado. Aqui você consegue ver o histórico completo desses momentos.
        </p>
        <p className="settings-help"><strong style={{ color: "var(--text)" }}>O que vai aparecer aqui:</strong></p>
        <ul style={{ margin: "6px 0 0 16px", color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
          <li>Timeline de sinais BUY/SELL/WAIT por ativo</li>
          <li>Comparação de sinais entre os ativos da watchlist</li>
          <li>Visualização de mudanças de regime ao longo do tempo</li>
          <li>Exportação de histórico para CSV</li>
        </ul>
      </div>
    </AppShell>
  );
}
