"use client";

import { useState } from "react";

const LEVELS = [
  { id: "leigo", label: "Simples" },
  { id: "intermediario", label: "Indicadores" },
  { id: "tecnico", label: "Técnico" },
];

/**
 * IAExplainPanel — 3-level AI explanation
 * @param {object} props
 * @param {string[]} props.leigo - array of paragraphs for beginner level
 * @param {string} [props.intermediario] - indicator-level text
 * @param {string} [props.tecnico] - raw technical explanation
 * @param {string} [props.significado] - "O que significa"
 * @param {string} [props.riscoPrincipal] - "Risco principal"
 * @param {string} [props.condicaoMudar] - "Condição para mudar de sinal"
 */
export default function IAExplainPanel({
  leigo = [],
  intermediario,
  tecnico,
  significado,
  riscoPrincipal,
  condicaoMudar,
}) {
  const [level, setLevel] = useState("leigo");

  return (
    <div className="ia-panel">
      <div className="ia-panel-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 6.5C5.5 5.12 6.62 4 8 4s2.5 1.12 2.5 2.5c0 1-0.7 1.6-1.5 2v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="12" r=".8" fill="currentColor" />
        </svg>
        IA — Por quê?
      </div>
      <div className="ia-panel-body">
        <div className="ia-level-tabs">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`ia-level-tab${level === l.id ? " active" : ""}`}
              onClick={() => setLevel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>

        {level === "leigo" && (
          <div className="ia-level-content">
            {leigo.map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0" }}>{para}</p>
            ))}
            {(significado || riscoPrincipal || condicaoMudar) && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {significado && (
                  <div>
                    <strong>O que significa: </strong>
                    <span>{significado}</span>
                  </div>
                )}
                {riscoPrincipal && (
                  <div>
                    <strong>Risco principal: </strong>
                    <span>{riscoPrincipal}</span>
                  </div>
                )}
                {condicaoMudar && (
                  <div>
                    <strong>Condição para mudar: </strong>
                    <span>{condicaoMudar}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {level === "intermediario" && (
          <div className="ia-level-content">
            {intermediario ? (
              <p style={{ margin: 0 }}>{intermediario}</p>
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Dados intermediários não disponíveis para este ativo.
              </p>
            )}
          </div>
        )}

        {level === "tecnico" && (
          <div className="ia-level-content">
            {tecnico ? (
              <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" }}>
                {tecnico}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Explicação técnica bruta não disponível.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
