"use client";

import AppShell from "../../components/AppShell";

export default function AssetsPage() {
  return (
    <AppShell title="Assets" subtitle="Catálogo de ativos monitorados">
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(255,255,255,0.02))", borderColor: "rgba(59,130,246,0.2)" }}>
        <div className="card-title"><strong>Em breve</strong><span className="chip badge wait">Próxima versão</span></div>
        <p className="settings-help" style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--text)" }}>O que é esta página?</strong><br />
          Um catálogo completo de todos os ativos que o robô monitora, com metadados como setor, volume médio, volatilidade histórica e quantas vezes cada ativo teve sinal de compra no último mês.
        </p>
        <p className="settings-help"><strong style={{ color: "var(--text)" }}>O que vai aparecer aqui:</strong></p>
        <ul style={{ margin: "6px 0 0 16px", color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
          <li>Lista de todos os 50 ativos escaneados com ranking por score médio</li>
          <li>Filtros por setor (DeFi, Layer1, Stablecoins etc.)</li>
          <li>Histórico de regime: quantos dias em alta vs queda</li>
          <li>Link direto para adicionar à Watchlist</li>
        </ul>
      </div>
    </AppShell>
  );
}
