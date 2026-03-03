from __future__ import annotations

from typing import Any


def build_explanation(event_type: str, symbol: str, facts: dict[str, Any] | None = None) -> dict[str, Any]:
    data = facts or {}
    regime = str(data.get("regime") or "Neutro")
    signal = str(data.get("signal") or "WAIT")
    score = int(float(data.get("score") or 0))

    one_liner = f"{event_type}: {symbol} com regime {regime}, sinal {signal} e score {score}."

    return {
        "level": "LEIGO",
        "decisionOneLiner": one_liner,
        "reasons": [
            {
                "label": "Condições atuais do ativo",
                "plain": f"O ativo está em {regime} com sinal {signal}.",
                "evidence": "regime/sinal do motor determinístico",
            },
            {
                "label": "Pontuação de qualidade",
                "plain": f"Score atual: {score}.",
                "evidence": "score calculado pelo pipeline",
            },
            {
                "label": "Evento operacional",
                "plain": f"Evento detectado: {event_type}.",
                "evidence": "gatilho do trade-run/score",
            },
        ],
        "whatToSeeNext": [
            "Acompanhar mudança de regime e sinal nas próximas execuções",
            "Verificar se score melhora acima dos limiares",
            "Validar risco (stop/take/daily loss) antes de reativar",
        ],
        "riskNote": "Explicação educacional; o motor de trade continua 100% determinístico.",
        "miniLesson": {
            "term": "ATR",
            "explain": "ATR mede a volatilidade média do preço.",
            "analogy": "Quanto maior o ATR, mais o preço 'balança'.",
            "whyItMatters": "Ajuda a definir stops/takes mais realistas.",
        },
        "confidence": "medium",
        "disclaimer": "Conteúdo educacional, não é recomendação financeira.",
        "levels": {
            "LEIGO": one_liner,
            "INTERMEDIARIO": f"Evento {event_type} com regime={regime}, sinal={signal}, score={score}.",
            "TECNICO": {
                "eventType": event_type,
                "symbol": symbol,
                "facts": data,
            },
        },
    }
