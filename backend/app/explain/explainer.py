from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Deterministic fallback (no API key needed) ──────────────
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


# ── Gemini via Vertex AI (service account, no API key) ────────
_SYSTEM_PROMPT = """Você é o assistente de IA do BotBit, um robô de trading de criptomoedas.
Sua tarefa é explicar indicadores técnicos de forma didática para três públicos diferentes.

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português do Brasil.
- Nunca recomende compra ou venda — você explica, não aconselha.
- Use analogias do dia-a-dia para o nível LEIGO.
- Seja preciso com números no nível TECNICO.
- Responda APENAS com JSON válido, sem markdown, sem ```json```.

Formato de resposta (JSON):
{
  "leigo": ["parágrafo 1 para leigo", "parágrafo 2 para leigo", "parágrafo 3 (opcional)"],
  "intermediario": "Texto com indicadores explicados de forma clara, 2-4 frases.",
  "tecnico": "Dados brutos e análise quantitativa detalhada.",
  "significado": "O que a situação atual significa em 1 frase.",
  "riscoPrincipal": "Qual o principal risco agora em 1 frase.",
  "condicaoMudar": "O que precisaria acontecer para o sinal mudar em 1 frase.",
  "miniLicao": {
    "termo": "Nome do indicador mais relevante",
    "explicacao": "O que esse indicador mede, em linguagem simples",
    "analogia": "Uma analogia cotidiana",
    "importancia": "Por que importa para o trading"
  }
}
"""


def _build_user_prompt(symbol: str, facts: dict[str, Any]) -> str:
    parts = [f"Ativo: {symbol}"]
    mapping = {
        "score": "Score (0-100)",
        "signal": "Sinal (BUY/SELL/WAIT)",
        "regime": "Regime (Alta/Baixa/Neutro/Lateral)",
        "rsi14": "RSI(14)",
        "atr14": "ATR(14)",
        "ema50": "EMA(50)",
        "ema200": "EMA(200)",
        "price": "Preço atual",
        "change24hPct": "Variação 24h (%)",
        "volume24h": "Volume 24h (USDT)",
        "potentialScore": "Potential Score (Discover)",
        "volume_z": "Volume Z-Score",
        "corr_btc": "Correlação com BTC",
        "trend_strength": "Força da Tendência",
    }
    for key, label in mapping.items():
        val = facts.get(key)
        if val is not None and str(val).strip():
            parts.append(f"- {label}: {val}")
    return "\n".join(parts)


# Model cascade: try best → fastest, skip deprecated/image models
GEMINI_MODEL_CASCADE = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-2.5-pro",
]

# Vertex AI locations to try (southamerica-east1 first, then us-central1 as backup)
_LOCATIONS = ["southamerica-east1", "us-central1"]


def _try_single_model(
    project_id: str,
    location: str,
    model_name: str,
    user_prompt: str,
) -> dict[str, Any] | None:
    """Attempt a single Vertex AI model call. Returns parsed dict or None."""
    import vertexai
    from vertexai.generative_models import GenerativeModel, GenerationConfig

    vertexai.init(project=project_id, location=location)
    model_obj = GenerativeModel(
        model_name=model_name,
        system_instruction=_SYSTEM_PROMPT,
    )
    gen_config = GenerationConfig(
        temperature=0.4,
        max_output_tokens=1200,
        response_mime_type="application/json",
    )
    response = model_obj.generate_content(user_prompt, generation_config=gen_config)
    raw_text = response.text.strip()
    result = json.loads(raw_text)
    if not isinstance(result.get("leigo"), list) or not result["leigo"]:
        return None
    result["source"] = "gemini"
    result["model"] = model_name
    result["location"] = location
    return result


def gemini_explain(symbol: str, facts: dict[str, Any], project_id: str) -> dict[str, Any]:
    """Call Gemini via Vertex AI with multi-model cascade fallback.

    Tries each model in GEMINI_MODEL_CASCADE across multiple locations.
    Returns the first successful result, or {} if all fail.
    """
    if not project_id:
        logger.warning("No project_id — skipping Vertex AI")
        return {}

    try:
        import vertexai  # noqa: F401
        from vertexai.generative_models import GenerativeModel, GenerationConfig  # noqa: F401
    except ImportError:
        logger.warning("google-cloud-aiplatform not installed — falling back to deterministic")
        return {}

    user_prompt = _build_user_prompt(symbol, facts)
    errors: list[str] = []

    for model_name in GEMINI_MODEL_CASCADE:
        for location in _LOCATIONS:
            try:
                result = _try_single_model(project_id, location, model_name, user_prompt)
                if result:
                    logger.info("Gemini OK: model=%s location=%s symbol=%s", model_name, location, symbol)
                    return result
            except json.JSONDecodeError as exc:
                err = f"{model_name}@{location}: invalid JSON ({str(exc)[:80]})"
                errors.append(err)
                logger.warning(err)
            except Exception as exc:
                err = f"{model_name}@{location}: {str(exc)[:120]}"
                errors.append(err)
                logger.warning("Gemini fallback: %s", err)

    logger.error("All Gemini models failed for %s. Errors: %s", symbol, "; ".join(errors[-6:]))
    return {}
