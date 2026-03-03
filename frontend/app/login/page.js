"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, googleProvider, hasConfig } from "../../lib/firebase";
import { ensureUserDoc } from "../../lib/firestore";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin() {
    if (!hasConfig || !auth || !googleProvider) {
      setError("Configure as variáveis NEXT_PUBLIC_FIREBASE_* antes do login.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      await ensureUserDoc(user.uid, user.email || "");
      router.push("/dashboard");
    } catch (err) {
      setError(err.message || "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="40" height="40" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bbg-login" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop stopColor="rgba(96,165,250,.95)" />
                <stop offset="1" stopColor="rgba(59,130,246,.75)" />
              </linearGradient>
            </defs>
            <rect x="3" y="3" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="3" y="9" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="3" y="15" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="9" y="3" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="9" y="9" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="9" y="15" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="15" y="3" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="15" y="9" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="15" y="15" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="21" y="3" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="21" y="9" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.95" />
            <rect x="21" y="15" width="5" height="5" rx="1.4" fill="url(#bbg-login)" opacity="0.75" />
            <rect x="3" y="22" width="23" height="2" rx="1" fill="rgba(255,255,255,.18)" />
          </svg>
        </div>
        <div className="login-brand">BotBit</div>
        <div className="login-tagline">Robô inteligente de análise e trading de criptomoedas</div>
        <div className="login-features">
          <div className="login-feature">◈ Análise automática a cada 5 min</div>
          <div className="login-feature">◇ Score de qualidade por ativo</div>
          <div className="login-feature">◎ Stop-loss e take-profit automáticos</div>
          <div className="login-feature">▦ Modo simulado (PAPER) sem risco</div>
        </div>
        <button className="btn login-btn" onClick={handleLogin} disabled={loading}>
          {loading ? (
            <span>Entrando...</span>
          ) : (
            <span>Entrar com Google</span>
          )}
        </button>
        {error ? <div className="login-error">{error}</div> : null}
        <div className="login-note">Ao entrar, você concorda com o uso do app em modo experimental. Comece em PAPER — sem risco de capital real.</div>
      </div>
    </main>
  );
}
