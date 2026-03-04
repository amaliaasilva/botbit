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

    # Enrich with real indicator values when available
    rsi = float(data.get("rsi14") or data.get("rsi") or 0)
    atr14 = float(data.get("atr14") or data.get("atr") or 0)
    ema200 = float(data.get("ema200") or 0)
    ema50 = float(data.get("ema50") or 0)
    price = float(data.get("price") or data.get("price_close") or 0)

    # RSI interpretation
    if rsi >= 70:
        rsi_label = "sobrecomprado"
    elif rsi <= 30:
        rsi_label = "sobrevendido"
    else:
        rsi_label = "neutro"

    # ATR as % of price
    atr_pct = (atr14 / price * 100) if (price > 0 and atr14 > 0) else 0.0
    vol_label = "alta" if atr_pct > 3.0 else ("moderada" if atr_pct > 1.0 else "baixa")

    # Price vs EMA200
    if price > 0 and ema200 > 0:
        ema200_pos = "ACIMA" if price >= ema200 else "ABAIXO"
    else:
        ema200_pos = None

    one_liner = (
        f"{event_type}: {symbol} — regime {regime}, sinal {signal}, score {score}"
        + (f", RSI {rsi:.1f} ({rsi_label})" if rsi > 0 else "")
        + (f", preço {ema200_pos} da EMA200" if ema200_pos else "")
        + "."
    )

    reasons = [
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
    ]
    if rsi > 0:
        reasons.append({
            "label": "RSI(14)",
            "plain": f"RSI atual: {rsi:.1f} — {rsi_label}. "
                     + ("Atenção: território de sobrecompra." if rsi >= 70
                        else "Território de sobrevenda pode indicar recuperação." if rsi <= 30
                        else "Momentum equilibrado."),
            "evidence": f"rsi14={rsi:.2f}",
        })
    if atr14 > 0 and price > 0:
        reasons.append({
            "label": "Volatilidade (ATR)",
            "plain": f"ATR: {atr14:.4f} ({atr_pct:.2f}% do preço) — volatilidade {vol_label}.",
            "evidence": f"atr14={atr14:.4f}",
        })
    if ema200 > 0 and price > 0:
        reasons.append({
            "label": "Tendência de longo prazo (EMA200)",
            "plain": f"Preço {ema200_pos} da EMA200 ({ema200:.4f}). "
                     + ("Tendência de alta de longo prazo." if ema200_pos == "ACIMA"
                        else "Tendência de baixa de longo prazo — risco elevado."),
            "evidence": f"price={price:.4f}, ema200={ema200:.4f}",
        })
    if ema50 > 0 and price > 0:
        ema50_pos = "ACIMA" if price >= ema50 else "ABAIXO"
        reasons.append({
            "label": "Tendência de médio prazo (EMA50)",
            "plain": f"Preço {ema50_pos} da EMA50 ({ema50:.4f}).",
            "evidence": f"price={price:.4f}, ema50={ema50:.4f}",
        })
    reasons.append({
        "label": "Evento operacional",
        "plain": f"Evento detectado: {event_type}.",
        "evidence": "gatilho do trade-run/score",
    })

    # Dynamic mini-lesson: choose most relevant indicator
    if rsi >= 70 or rsi <= 30:
        mini = {
            "term": "RSI (Índice de Força Relativa)",
            "explain": "Mede o quão rápido o preço subiu ou caiu nos últimos 14 períodos, numa escala de 0 a 100.",
            "analogy": "É como medir o cansaço de um corredor: acima de 70 ele está exausto de tanto subir, abaixo de 30 está no limite de tanto cair.",
            "whyItMatters": "Ajuda a identificar momentos de sobrecompra (possível queda iminente) ou sobrevenda (possível recuperação).",
        }
    elif ema200_pos == "ABAIXO":
        mini = {
            "term": "EMA200 (Média Móvel Exponencial de 200 períodos)",
            "explain": "É a média ponderada do preço nas últimas 200 velas, dando mais peso às mais recentes.",
            "analogy": "Como a nota média do ano escolar: preço abaixo dela é como estar reprovado na tendência de longo prazo.",
            "whyItMatters": "Traders institucionais usam a EMA200 como referência de tendência; preço abaixo dela aumenta o risco de novas quedas.",
        }
    else:
        mini = {
            "term": "ATR (Average True Range)",
            "explain": "Mede a amplitude média de variação do preço em cada vela pelos últimos 14 períodos.",
            "analogy": "Quanto maior o ATR, mais o preço 'balança' — como ondas num dia de tempestade vs. lago calmo.",
            "whyItMatters": "Ajuda a calibrar stops e alvos para não ser derrubado pelo ruído normal do mercado.",
        }

    intermediario = (
        f"Evento {event_type}: regime={regime}, sinal={signal}, score={score}"
        + (f", RSI={rsi:.1f}" if rsi > 0 else "")
        + (f", ATR={atr14:.4f} ({atr_pct:.2f}%)" if atr14 > 0 else "")
        + (f", preço {ema200_pos} EMA200" if ema200_pos else "")
        + "."
    )

    return {
        "level": "LEIGO",
        "decisionOneLiner": one_liner,
        "reasons": reasons,
        "whatToSeeNext": [
            "Acompanhar mudança de regime e sinal nas próximas execuções",
            "Verificar se score melhora acima dos limiares",
            "Validar risco (stop/take/daily loss) antes de reativar",
        ],
        "riskNote": "Explicação educacional; o motor de trade continua 100% determinístico.",
        "miniLesson": mini,
        "confidence": "medium",
        "disclaimer": "Conteúdo educacional, não é recomendação financeira.",
        "levels": {
            "LEIGO": one_liner,
            "INTERMEDIARIO": intermediario,
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
