<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BotBit — Market Intelligence Engine</title>

  <!-- Optional: Inter (fallbacks abaixo). Remova se quiser 100% offline. -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    /* ------------------------------
       TOKENS (Dark default)
    ------------------------------ */
    :root{
      --bg:#0E1117;
      --bg2:#0B0F14;
      --panel:#161B22;
      --panel2:#10151B;
      --text:#E5E7EB;
      --muted:#9CA3AF;
      --muted2:#6B7280;
      --line:rgba(255,255,255,.06);
      --line2:rgba(255,255,255,.10);
      --accent:#3B82F6;        /* azul discreto */
      --accent2:#60A5FA;
      --good:#16A34A;
      --bad:#DC2626;
      --warn:#9CA3AF;
      --shadow: 0 10px 30px rgba(0,0,0,.35);

      --r:14px;
      --t:150ms;

      --font: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    /* Light mode (opcional) */
    body.light{
      --bg:#F9FAFB;
      --bg2:#F3F4F6;
      --panel:#FFFFFF;
      --panel2:#FFFFFF;
      --text:#111827;
      --muted:#6B7280;
      --muted2:#6B7280;
      --line:rgba(17,24,39,.08);
      --line2:rgba(17,24,39,.12);
      --shadow: 0 10px 25px rgba(17,24,39,.10);
    }

    /* ------------------------------
       BASE
    ------------------------------ */
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0;
      background: radial-gradient(1200px 700px at 30% 0%, rgba(59,130,246,.08), transparent 55%),
                  radial-gradient(900px 500px at 75% 20%, rgba(96,165,250,.06), transparent 55%),
                  var(--bg);
      color:var(--text);
      font-family:var(--font);
      letter-spacing:-0.01em;
      -webkit-font-smoothing:antialiased;
      -moz-osx-font-smoothing:grayscale;
    }
    a{color:inherit; text-decoration:none}
    .app{display:flex; min-height:100vh}

    /* ------------------------------
       SIDEBAR
    ------------------------------ */
    .sidebar{
      width:240px;
      position:fixed;
      inset:0 auto 0 0;
      background: linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%);
      border-right:1px solid var(--line);
      padding:16px 14px;
      display:flex;
      flex-direction:column;
      gap:14px;
    }

    .brand{
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px;
      border-radius:12px;
      transition: transform var(--t) ease, background var(--t) ease;
    }
    .brand:hover{
      background:rgba(59,130,246,.07);
      transform: translateY(-1px);
    }
    .brand .title{font-weight:700; font-size:14px; letter-spacing:-0.02em}
    .brand .subtitle{font-size:11px; color:var(--muted); margin-top:2px}

    /* Logo: BB em blocos (SVG) */
    .logo{
      width:34px; height:34px;
      border-radius:10px;
      background:rgba(255,255,255,.02);
      border:1px solid var(--line);
      display:grid;
      place-items:center;
      overflow:hidden;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }

    .nav{
      margin-top:4px;
      display:flex;
      flex-direction:column;
      gap:4px;
    }
    .nav a{
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px 10px;
      border-radius:12px;
      color:var(--muted);
      border:1px solid transparent;
      transition: background var(--t) ease, color var(--t) ease, border var(--t) ease;
      user-select:none;
    }
    .nav a:hover{
      background:rgba(59,130,246,.06);
      color:var(--text);
      border-color:rgba(59,130,246,.10);
      box-shadow: 0 0 0 1px rgba(59,130,246,.06), 0 0 18px rgba(59,130,246,.08);
    }
    .nav a.active{
      background:rgba(255,255,255,.04);
      color:var(--text);
      border-color:rgba(255,255,255,.08);
    }

    .nav .icon{
      width:18px; height:18px;
      display:inline-grid;
      place-items:center;
      opacity:.95;
    }

    .sidebar-footer{
      margin-top:auto;
      padding:12px 10px;
      border-top:1px solid var(--line);
      display:flex;
      flex-direction:column;
      gap:8px;
      color:var(--muted);
      font-size:12px;
    }
    .status{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .dot{width:8px;height:8px;border-radius:99px; background:var(--good); box-shadow:0 0 10px rgba(22,163,74,.35)}
    .dot.sync{background:var(--accent); box-shadow:0 0 10px rgba(59,130,246,.35)}

    /* ------------------------------
       MAIN
    ------------------------------ */
    .main{
      margin-left:240px;
      width:calc(100% - 240px);
      padding:22px 24px 40px;
    }

    .topbar{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:18px;
      margin-bottom:16px;
    }
    .page-title{font-size:18px; font-weight:700; letter-spacing:-0.02em}
    .page-sub{font-size:12px; color:var(--muted); margin-top:4px}

    .right-actions{
      display:flex;
      gap:10px;
      align-items:center;
    }

    .btn{
      border:1px solid var(--line);
      background:rgba(255,255,255,.03);
      color:var(--text);
      padding:9px 10px;
      border-radius:12px;
      font-size:12px;
      cursor:pointer;
      transition: transform var(--t) ease, background var(--t) ease, border var(--t) ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .btn:hover{transform:translateY(-1px); background:rgba(59,130,246,.06); border-color:rgba(59,130,246,.14)}

    .kpi-ring{
      display:flex;
      align-items:center;
      gap:10px;
      padding:10px 12px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.02);
      border-radius:16px;
      box-shadow: var(--shadow);
      min-width:180px;
    }
    .kpi-ring .label{font-size:11px; color:var(--muted)}
    .kpi-ring .value{font-size:16px; font-weight:700; margin-top:2px}

    .ring{
      width:42px;height:42px;
      display:grid;place-items:center;
    }

    /* ------------------------------
       SECTIONS / CARDS
    ------------------------------ */
    .section{
      margin-top:14px;
    }

    .section-head{
      display:flex;
      align-items:flex-end;
      justify-content:space-between;
      gap:12px;
      margin:16px 0 10px;
    }
    .section-title{font-size:13px; font-weight:700}
    .section-meta{font-size:12px; color:var(--muted)}

    .grid3{
      display:grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap:12px;
    }

    @media (max-width: 1100px){
      .grid3{grid-template-columns:1fr}
      .sidebar{position:sticky; height:100vh}
      .main{width:100%}
    }

    .card{
      background:linear-gradient(180deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.02) 100%), var(--panel);
      border:1px solid var(--line);
      border-radius:var(--r);
      padding:14px;
      box-shadow: var(--shadow);
      position:relative;
      overflow:hidden;
    }

    .card::after{
      content:"";
      position:absolute;
      inset:-1px -1px auto -1px;
      height:1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent);
      opacity:.7;
    }

    .card-title{font-size:12px; color:var(--muted); display:flex; justify-content:space-between; align-items:center}
    .card-title strong{color:var(--text); font-weight:700}

    .price{
      font-family:var(--mono);
      font-size:22px;
      font-weight:700;
      letter-spacing:-0.02em;
      margin-top:10px;
    }

    .row{
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      margin-top:10px;
      color:var(--muted);
      font-size:12px;
    }

    .score{
      font-size:22px;
      font-weight:800;
      letter-spacing:-0.02em;
    }

    .badge{
      font-size:11px;
      padding:4px 8px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.02);
      color:var(--muted);
      display:inline-flex;
      gap:6px;
      align-items:center;
      user-select:none;
    }
    .badge.buy{border-color:rgba(22,163,74,.25); color:#c7f9d1; background:rgba(22,163,74,.10)}
    .badge.wait{border-color:rgba(156,163,175,.25); color:var(--muted); background:rgba(156,163,175,.08)}
    .badge.avoid{border-color:rgba(220,38,38,.25); color:#ffd2d2; background:rgba(220,38,38,.10)}

    .mini{
      display:flex;
      gap:12px;
      align-items:center;
      justify-content:space-between;
      margin-top:10px;
    }

    .bar{
      width:100%;
      height:6px;
      background:rgba(255,255,255,.05);
      border:1px solid var(--line);
      border-radius:999px;
      overflow:hidden;
    }
    .bar > span{
      display:block;
      height:100%;
      width:50%;
      background:linear-gradient(90deg, rgba(59,130,246,.55), rgba(59,130,246,.95));
      box-shadow:0 0 18px rgba(59,130,246,.22);
    }

    /* ------------------------------
       TABLES
    ------------------------------ */
    .table{
      width:100%;
      border-collapse:separate;
      border-spacing:0;
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:var(--r);
      background:rgba(255,255,255,.02);
      box-shadow: var(--shadow);
    }
    .table th,
    .table td{
      padding:12px 12px;
      font-size:12px;
      border-bottom:1px solid var(--line);
      color:var(--muted);
      text-align:left;
    }
    .table th{
      color:var(--muted);
      font-weight:600;
      background:rgba(255,255,255,.02);
      position:sticky;
      top:0;
      z-index:1;
    }
    .table tr:last-child td{border-bottom:none}
    .table tbody tr{
      transition: background var(--t) ease;
      cursor:default;
    }
    .table tbody tr:hover{background:rgba(59,130,246,.06)}
    .table .asset{color:var(--text); font-weight:600}
    .table .mono{font-family:var(--mono); color:var(--text)}

    /* ------------------------------
       CHARTS (SVG)
    ------------------------------ */
    .chartWrap{
      position:relative;
      padding:12px;
    }
    .chart{
      width:100%;
      height:220px;
      border-radius:var(--r);
      border:1px solid var(--line);
      background:linear-gradient(180deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,.01) 100%), var(--panel);
      box-shadow: var(--shadow);
      overflow:hidden;
    }
    .chart svg{width:100%; height:100%; display:block}
    .tooltip{
      position:absolute;
      pointer-events:none;
      transform: translate(-50%, -115%);
      padding:8px 10px;
      border-radius:12px;
      border:1px solid var(--line);
      background:rgba(0,0,0,.55);
      backdrop-filter: blur(8px);
      color:var(--text);
      font-size:11px;
      opacity:0;
      transition: opacity var(--t) ease;
      white-space:nowrap;
    }
    body.light .tooltip{background:rgba(255,255,255,.75); color:var(--text)}

    /* ------------------------------
       SIGNAL BOX
    ------------------------------ */
    .signal{
      border:1px solid var(--line);
      border-radius:var(--r);
      background:linear-gradient(180deg, rgba(59,130,246,.10), rgba(255,255,255,.02)), var(--panel);
      box-shadow: var(--shadow);
      padding:14px;
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
    }
    .signal h3{margin:0; font-size:13px}
    .signal p{margin:6px 0 0; font-size:12px; color:var(--muted); line-height:1.45}
    .signal .meta{display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end}

    .pill{
      font-size:11px;
      padding:6px 10px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.03);
      color:var(--text);
      font-family:var(--mono);
    }

    /* ------------------------------
       VIEW SWITCH
    ------------------------------ */
    .view{display:none}
    .view.active{display:block}

    /* ------------------------------
       SKELETON
    ------------------------------ */
    .skeleton{
      position:relative;
      overflow:hidden;
      background: rgba(255,255,255,.04);
      border:1px solid var(--line);
      border-radius:12px;
    }
    .skeleton::after{
      content:"";
      position:absolute;
      inset:0;
      background: linear-gradient(90deg, transparent, rgba(59,130,246,.10), transparent);
      transform: translateX(-100%);
      animation: shimmer 1.05s linear infinite;
    }
    @keyframes shimmer{
      100%{transform:translateX(100%)}
    }

    /* ------------------------------
       SMALL UTILITIES
    ------------------------------ */
    .muted{color:var(--muted)}
    .flex{display:flex; gap:12px; align-items:center}
    .spacer{height:8px}
    .chip{
      font-size:11px;
      padding:4px 8px;
      border-radius:999px;
      background:rgba(255,255,255,.03);
      border:1px solid var(--line);
      color:var(--muted);
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand" title="BotBit">
        <div class="logo" aria-label="Logo BotBit">
          <!-- BB Blocks Logo (SVG) -->
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
            <defs>
              <linearGradient id="bbg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop stop-color="rgba(96,165,250,.95)"/>
                <stop offset="1" stop-color="rgba(59,130,246,.75)"/>
              </linearGradient>
              <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.6" result="blur"/>
                <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0" result="g"/>
                <feMerge>
                  <feMergeNode in="g"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <!-- grid 4x4 blocks forming stylized 'BB' -->
            <g filter="url(#glow)">
              <!-- Left B -->
              <rect x="3" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="3" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
              <rect x="3" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="9" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
              <rect x="9" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="9" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
              <!-- Right B -->
              <rect x="15" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="15" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
              <rect x="15" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="21" y="3" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
              <rect x="21" y="9" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.95"/>
              <rect x="21" y="15" width="5" height="5" rx="1.4" fill="url(#bbg)" opacity="0.75"/>
            </g>
            <!-- Base line hint -->
            <rect x="3" y="22" width="23" height="2" rx="1" fill="rgba(255,255,255,.18)"/>
          </svg>
        </div>
        <div>
          <div class="title">BotBit</div>
          <div class="subtitle">Market Intelligence Engine</div>
        </div>
      </div>

      <nav class="nav" id="nav">
        <a href="#/dashboard" data-view="dashboard" class="active">
          <span class="icon">▦</span><span>Dashboard</span>
        </a>
        <a href="#/watchlist" data-view="watchlist">
          <span class="icon">◎</span><span>Watchlist</span>
        </a>
        <a href="#/assets" data-view="assets">
          <span class="icon">◈</span><span>Assets</span>
        </a>
        <a href="#/backtests" data-view="backtests">
          <span class="icon">↗</span><span>Backtests</span>
        </a>
        <a href="#/signals" data-view="signals">
          <span class="icon">⌁</span><span>Signals</span>
        </a>
        <a href="#/notifications" data-view="notifications">
          <span class="icon">◍</span><span>Notifications</span>
        </a>
        <a href="#/settings" data-view="settings">
          <span class="icon">⚙</span><span>Settings</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="status">
          <div class="flex"><span class="dot" id="sysDot"></span><span id="sysStatus">Online</span></div>
          <span class="chip" id="sysMode">LIVE</span>
        </div>
        <div class="status">
          <span>Última atualização</span>
          <span id="lastUpdate" class="mono"></span>
        </div>
      </div>
    </aside>

    <main class="main">
      <!-- DASHBOARD -->
      <section class="view active" id="view-dashboard">
        <div class="topbar">
          <div>
            <div class="page-title">Market Overview</div>
            <div class="page-sub">Regime: <span id="regimeText" class="muted">—</span></div>
          </div>
          <div class="right-actions">
            <button class="btn" id="themeBtn" title="Alternar tema">Tema</button>
            <div class="kpi-ring" title="Score Global (0–100)">
              <div class="ring" aria-hidden="true">
                <svg width="42" height="42" viewBox="0 0 42 42">
                  <circle cx="21" cy="21" r="18" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="3" />
                  <circle id="globalRing" cx="21" cy="21" r="18" fill="none" stroke="rgba(59,130,246,.95)" stroke-width="3" stroke-linecap="round"
                          stroke-dasharray="0 200" transform="rotate(-90 21 21)" />
                </svg>
              </div>
              <div>
                <div class="label">Score Global</div>
                <div class="value" id="globalScore">—</div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Cards Principais</div>
              <div class="section-meta">Decisão acima de decoração.</div>
            </div>
            <div class="section-meta">Transições: 150ms • Sinais discretos</div>
          </div>

          <div class="grid3" id="mainCards"></div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Watchlist</div>
              <div class="section-meta">Tabela minimalista, hover suave.</div>
            </div>
            <div class="section-meta">Score → barra fina • Sinal → micro badge</div>
          </div>

          <table class="table" aria-label="Watchlist">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Score</th>
                <th>Regime</th>
                <th>RSI</th>
                <th>30d</th>
                <th>Sinal</th>
              </tr>
            </thead>
            <tbody id="watchlistBody"></tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Histórico de Score</div>
              <div class="section-meta">Linha única. Tooltip discreto. Glow leve.</div>
            </div>
            <div class="section-meta">Exemplo: BTCUSDT</div>
          </div>

          <div class="chartWrap">
            <div class="tooltip" id="chartTip">—</div>
            <div class="chart" id="scoreChart"></div>
          </div>
        </div>
      </section>

      <!-- ASSET (ex: /asset/BTCUSDT) -->
      <section class="view" id="view-assets">
        <div class="topbar">
          <div>
            <div class="page-title" id="assetTitle">BTCUSDT</div>
            <div class="page-sub">Detalhe do ativo • estrutura técnica • sinal atual</div>
          </div>
          <div class="right-actions">
            <button class="btn" id="openBtcBtn">Abrir BTCUSDT</button>
            <button class="btn" id="openSolBtn">Abrir SOLUSDT</button>
          </div>
        </div>

        <div class="grid3">
          <div class="card">
            <div class="card-title"><span>Preço</span><span class="chip">spot</span></div>
            <div class="price" id="assetPrice">—</div>
            <div class="row"><span>Volatilidade</span><span id="assetVol" class="mono">—</span></div>
            <div class="row"><span>Retorno 30d</span><span id="assetRet" class="mono">—</span></div>
          </div>
          <div class="card">
            <div class="card-title"><span>Score</span><span class="chip">0–100</span></div>
            <div class="score" id="assetScore">—</div>
            <div class="mini">
              <div class="bar" aria-label="Score bar"><span id="assetScoreBar"></span></div>
            </div>
            <div class="row"><span>Regime</span><span id="assetRegime" class="mono">—</span></div>
          </div>
          <div class="card">
            <div class="card-title"><span>Sinal</span><span class="chip">NOW</span></div>
            <div style="margin-top:10px">
              <span class="badge" id="assetSignal">—</span>
            </div>
            <div class="row"><span>RSI</span><span id="assetRsi" class="mono">—</span></div>
            <div class="row"><span>ATR (%)</span><span id="assetAtr" class="mono">—</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Estrutura Técnica</div>
              <div class="section-meta">Cards horizontais, leitura rápida.</div>
            </div>
          </div>

          <div class="grid3">
            <div class="card">
              <div class="card-title"><span>EMA50 vs EMA200</span><span class="chip">trend</span></div>
              <div class="row" style="margin-top:12px"><span>Direção</span><span id="emaDir" class="mono">—</span></div>
              <div class="row"><span>Cruzamento</span><span id="emaCross" class="mono">—</span></div>
            </div>
            <div class="card">
              <div class="card-title"><span>RSI</span><span class="chip">gauge</span></div>
              <div class="price" style="font-size:18px" id="rsiGauge">—</div>
              <div class="row"><span>Zona</span><span id="rsiZone" class="mono">—</span></div>
            </div>
            <div class="card">
              <div class="card-title"><span>ATR</span><span class="chip">risk</span></div>
              <div class="price" style="font-size:18px" id="atrPct">—</div>
              <div class="row"><span>Leitura</span><span id="atrRead" class="mono">—</span></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Sinal Atual</div>
              <div class="section-meta">Texto curto, decisivo.</div>
            </div>
          </div>

          <div class="signal">
            <div>
              <h3>Agora: <span id="signalStrong">—</span></h3>
              <p id="signalExplain">—</p>
            </div>
            <div class="meta">
              <span class="pill" id="stopSugerido">Stop: —</span>
              <span class="pill" id="riskEst">Risco: —</span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Histórico de Trades</div>
              <div class="section-meta">Se houver execução/automação.</div>
            </div>
          </div>

          <table class="table" aria-label="Trades">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Resultado</th>
                <th>R múltiplos</th>
              </tr>
            </thead>
            <tbody id="tradesBody"></tbody>
          </table>
        </div>
      </section>

      <!-- BACKTESTS -->
      <section class="view" id="view-backtests">
        <div class="topbar">
          <div>
            <div class="page-title">Backtests</div>
            <div class="page-sub">KPIs no topo • equity curve • trades</div>
          </div>
          <div class="right-actions">
            <button class="btn" id="runBacktestBtn">Executar (mock)</button>
          </div>
        </div>

        <div class="grid3" id="kpiRow"></div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Equity Curve</div>
              <div class="section-meta">Linha única • sem grid exagerado</div>
            </div>
          </div>
          <div class="chartWrap">
            <div class="tooltip" id="eqTip">—</div>
            <div class="chart" id="equityChart"></div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Trades (Backtest)</div>
              <div class="section-meta">Tabela final, auditável.</div>
            </div>
          </div>
          <table class="table" aria-label="Backtest trades">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ativo</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>PnL</th>
                <th>R</th>
              </tr>
            </thead>
            <tbody id="btTrades"></tbody>
          </table>
        </div>
      </section>

      <!-- WATCHLIST (page) -->
      <section class="view" id="view-watchlist">
        <div class="topbar">
          <div>
            <div class="page-title">Watchlist</div>
            <div class="page-sub">Seleção curada • foco em decisão</div>
          </div>
          <div class="right-actions">
            <button class="btn" id="addAssetBtn">Adicionar (mock)</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><strong>Notas</strong><span class="chip">minimal</span></div>
          <div class="row" style="margin-top:12px"><span>Regras</span><span class="muted">Sem hype • Sem cassino • Sem ruído</span></div>
          <div class="spacer"></div>
          <table class="table" aria-label="Watchlist full">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Score</th>
                <th>Regime</th>
                <th>RSI</th>
                <th>30d</th>
                <th>Sinal</th>
              </tr>
            </thead>
            <tbody id="watchlistBody2"></tbody>
          </table>
        </div>
      </section>

      <!-- SIGNALS -->
      <section class="view" id="view-signals">
        <div class="topbar">
          <div>
            <div class="page-title">Signals</div>
            <div class="page-sub">Registro de mudanças relevantes • sem spam</div>
          </div>
          <div class="right-actions">
            <button class="btn" id="refreshSignalsBtn">Atualizar (mock)</button>
          </div>
        </div>

        <table class="table" aria-label="Signals">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Ativo</th>
              <th>Evento</th>
              <th>Score</th>
              <th>Regime</th>
              <th>Sinal</th>
            </tr>
          </thead>
          <tbody id="signalsBody"></tbody>
        </table>
      </section>

      <!-- NOTIFICATIONS -->
      <section class="view" id="view-notifications">
        <div class="topbar">
          <div>
            <div class="page-title">Notifications</div>
            <div class="page-sub">Timestamp • mudança • ação</div>
          </div>
          <div class="right-actions">
            <button class="btn" id="markReadBtn">Marcar como lido</button>
          </div>
        </div>

        <table class="table" aria-label="Notifications">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Ativo</th>
              <th>Mudança</th>
              <th>Score</th>
              <th>Regime</th>
            </tr>
          </thead>
          <tbody id="notifBody"></tbody>
        </table>
      </section>

      <!-- SETTINGS -->
      <section class="view" id="view-settings">
        <div class="topbar">
          <div>
            <div class="page-title">Settings</div>
            <div class="page-sub">Configuração mínima e controlável</div>
          </div>
        </div>

        <div class="grid3">
          <div class="card">
            <div class="card-title"><strong>Fonte de dados</strong><span class="chip">Binance</span></div>
            <div class="row" style="margin-top:12px"><span>Modo</span><span class="mono">Read-only (mock)</span></div>
            <div class="row"><span>Atualização</span><span class="mono">60s</span></div>
          </div>
          <div class="card">
            <div class="card-title"><strong>Notificações</strong><span class="chip">Email</span></div>
            <div class="row" style="margin-top:12px"><span>Canal</span><span class="mono">Apps Script</span></div>
            <div class="row"><span>Filtro</span><span class="mono">Score Δ ≥ 7</span></div>
          </div>
          <div class="card">
            <div class="card-title"><strong>Risco</strong><span class="chip">Guardrails</span></div>
            <div class="row" style="margin-top:12px"><span>Max exposição</span><span class="mono">—</span></div>
            <div class="row"><span>Stop padrão</span><span class="mono">ATR-based</span></div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    /* ------------------------------
       MOCK DATA
    ------------------------------ */
    const DATA = {
      globalScore: 78,
      regime: "Risk-On",
      cards: [
        {
          symbol:"BTCUSDT",
          name:"Bitcoin",
          price: "R$ 343.120",
          score: 82,
          regime: "Alta",
          rsi: 57.4,
          signal: "BUY"
        },
        {
          symbol:"SOLUSDT",
          name:"Solana",
          price: "R$ 728",
          score: 71,
          regime: "Neutro",
          rsi: 52.1,
          signal: "WAIT"
        },
        {
          symbol:"B3",
          name:"B3 (proxy)",
          price: "R$ 12,34",
          score: 64,
          regime: "Lateral",
          rsi: 49.2,
          signal: "WAIT"
        }
      ],
      watchlist: [
        {asset:"BTCUSDT", score:82, regime:"Alta", rsi:57.4, d30:"+9,2%", signal:"BUY"},
        {asset:"SOLUSDT", score:71, regime:"Neutro", rsi:52.1, d30:"+4,1%", signal:"WAIT"},
        {asset:"ETHUSDT", score:67, regime:"Neutro", rsi:50.8, d30:"+2,6%", signal:"WAIT"},
        {asset:"BNBUSDT", score:58, regime:"Lateral", rsi:47.9, d30:"-1,2%", signal:"WAIT"},
        {asset:"ADAUSDT", score:44, regime:"Baixa", rsi:41.7, d30:"-6,9%", signal:"AVOID"}
      ],
      scoreSeries: [62,64,63,66,68,72,74,73,75,78,80,79,82,81,82,83,82],
      equitySeries: [10000,10120,10080,10240,10310,10220,10490,10630,10540,10790,10860,11040,10910,11220,11310,11450],
      notifications: [
        {ts:"2026-03-03 08:11", asset:"BTCUSDT", change:"Score +6", score:82, regime:"Alta"},
        {ts:"2026-03-03 07:42", asset:"SOLUSDT", change:"Regime: Neutro", score:71, regime:"Neutro"},
        {ts:"2026-03-03 07:10", asset:"ADAUSDT", change:"Sinal: AVOID", score:44, regime:"Baixa"}
      ],
      signals: [
        {ts:"2026-03-03 08:11", asset:"BTCUSDT", event:"Breakout confirmado (EMA)", score:82, regime:"Alta", signal:"BUY"},
        {ts:"2026-03-03 07:42", asset:"SOLUSDT", event:"Volatilidade normalizou (ATR)", score:71, regime:"Neutro", signal:"WAIT"},
        {ts:"2026-03-03 07:10", asset:"ADAUSDT", event:"RSI fraco + trend down", score:44, regime:"Baixa", signal:"AVOID"}
      ],
      trades: [
        {entry:"2026-02-12", exit:"2026-02-28", result:"+5,1%", r:"1,2R"},
        {entry:"2026-01-20", exit:"2026-02-02", result:"+3,4%", r:"0,8R"},
        {entry:"2025-12-10", exit:"2025-12-22", result:"-2,0%", r:"-0,6R"}
      ],
      btKpis: [
        {label:"Win rate", value:"61%"},
        {label:"Profit factor", value:"1,42"},
        {label:"Max drawdown", value:"-8,7%"},
        {label:"Expectativa/trade", value:"+0,23R"}
      ],
      btTrades: [
        {date:"2026-02-28", asset:"BTCUSDT", entry:"332.900", exit:"343.120", pnl:"+3,1%", r:"1,0R"},
        {date:"2026-02-16", asset:"SOLUSDT", entry:"690", exit:"728", pnl:"+5,5%", r:"1,2R"},
        {date:"2026-02-03", asset:"ETHUSDT", entry:"—", exit:"—", pnl:"-1,8%", r:"-0,5R"}
      ]
    };

    /* ------------------------------
       HELPERS
    ------------------------------ */
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    function fmtNow(){
      const d = new Date();
      const pad = (n)=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function signalClass(signal){
      if(signal === "BUY") return "buy";
      if(signal === "AVOID") return "avoid";
      return "wait";
    }

    function setRing(el, value /*0-100*/){
      const r = 18;
      const c = 2 * Math.PI * r;
      const pct = Math.max(0, Math.min(100, value));
      const dash = (pct/100) * c;
      el.setAttribute("stroke-dasharray", `${dash} ${c-dash}`);
    }

    /* ------------------------------
       RENDER: DASHBOARD
    ------------------------------ */
    function renderDashboard(){
      $("#globalScore").textContent = DATA.globalScore;
      $("#regimeText").textContent = DATA.regime;
      setRing($("#globalRing"), DATA.globalScore);

      // Cards
      const wrap = $("#mainCards");
      wrap.innerHTML = "";
      for(const c of DATA.cards){
        const b = document.createElement("div");
        b.className = "card";
        b.innerHTML = `
          <div class="card-title">
            <strong>${c.symbol}</strong>
            <span class="chip">${c.name}</span>
          </div>
          <div class="price">${c.price}</div>
          <div class="row">
            <span>Score</span>
            <span class="score">${c.score}</span>
          </div>
          <div class="row">
            <span>Regime</span>
            <span class="mono">${c.regime}</span>
          </div>
          <div class="row">
            <span>RSI</span>
            <span class="mono">${c.rsi.toFixed(1)}</span>
          </div>
          <div class="row">
            <span>Sinal</span>
            <span class="badge ${signalClass(c.signal)}">${c.signal}</span>
          </div>
        `;
        wrap.appendChild(b);
      }

      // Watchlist
      const w = $("#watchlistBody");
      const w2 = $("#watchlistBody2");
      w.innerHTML = "";
      w2.innerHTML = "";
      for(const r of DATA.watchlist){
        const barW = Math.max(0, Math.min(100, r.score));
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="asset">${r.asset}</td>
          <td>
            <div class="mini">
              <div class="bar"><span style="width:${barW}%"></span></div>
              <span class="mono">${r.score}</span>
            </div>
          </td>
          <td>${r.regime}</td>
          <td class="mono">${r.rsi.toFixed(1)}</td>
          <td class="mono">${r.d30}</td>
          <td><span class="badge ${signalClass(r.signal)}">${r.signal}</span></td>
        `;
        const tr2 = tr.cloneNode(true);
        w.appendChild(tr);
        w2.appendChild(tr2);
      }

      // Score chart
      drawLineChart({
        mount: "#scoreChart",
        tip: "#chartTip",
        series: DATA.scoreSeries,
        label: (i,v)=>`BTCUSDT • Score ${v} • T-${DATA.scoreSeries.length-1-i}`
      });

      $("#lastUpdate").textContent = fmtNow();
    }

    /* ------------------------------
       RENDER: ASSET
    ------------------------------ */
    function renderAsset(symbol){
      const c = DATA.cards.find(x=>x.symbol===symbol) || DATA.cards[0];
      $("#assetTitle").textContent = c.symbol;
      $("#assetPrice").textContent = c.price;
      $("#assetScore").textContent = c.score;
      $("#assetScoreBar").style.width = `${c.score}%`;
      $("#assetRegime").textContent = c.regime;
      $("#assetRsi").textContent = c.rsi.toFixed(1);

      // mock derivations
      const atr = symbol === "BTCUSDT" ? 2.8 : 3.6;
      const vol = symbol === "BTCUSDT" ? "Moderada" : "Moderada";
      const ret = symbol === "BTCUSDT" ? "+9,2%" : "+4,1%";
      $("#assetAtr").textContent = atr.toFixed(1);
      $("#assetVol").textContent = vol;
      $("#assetRet").textContent = ret;

      const signal = c.signal;
      const badge = $("#assetSignal");
      badge.className = `badge ${signalClass(signal)}`;
      badge.textContent = signal;

      // EMA mock
      const emaDir = signal === "BUY" ? "↑" : (signal === "AVOID" ? "↓" : "→");
      $("#emaDir").textContent = emaDir;
      $("#emaCross").textContent = signal === "BUY" ? "Bullish" : (signal === "AVOID" ? "Bearish" : "Neutral");

      // RSI gauge
      $("#rsiGauge").textContent = `${c.rsi.toFixed(1)}`;
      $("#rsiZone").textContent = c.rsi >= 60 ? "Força" : (c.rsi <= 40 ? "Fraqueza" : "Saudável");

      // ATR read
      $("#atrPct").textContent = `${atr.toFixed(1)}%`;
      $("#atrRead").textContent = atr <= 3.0 ? "Controlada" : "Atenção";

      // Signal box
      $("#signalStrong").textContent = signal;
      $("#signalExplain").textContent =
        signal === "BUY"
          ? "Tendência positiva, RSI saudável, volatilidade controlada."
          : (signal === "AVOID"
              ? "Tendência negativa, RSI fraco, risco assimétrico desfavorável."
              : "Mercado sem convicção clara. Priorize espera e confirmações.");

      const stop = signal === "BUY" ? "-2,8%" : (signal === "AVOID" ? "—" : "-3,6%");
      const risk = signal === "BUY" ? "Baixo a moderado" : (signal === "AVOID" ? "Elevado" : "Moderado");
      $("#stopSugerido").textContent = `Stop: ${stop}`;
      $("#riskEst").textContent = `Risco: ${risk}`;

      // Trades table
      const tb = $("#tradesBody");
      tb.innerHTML = "";
      for(const t of DATA.trades){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${t.entry}</td>
          <td class="mono">${t.exit}</td>
          <td class="mono">${t.result}</td>
          <td class="mono">${t.r}</td>
        `;
        tb.appendChild(tr);
      }
    }

    /* ------------------------------
       RENDER: BACKTESTS
    ------------------------------ */
    function renderBacktests(){
      const row = $("#kpiRow");
      row.innerHTML = "";
      for(const k of DATA.btKpis){
        const d = document.createElement("div");
        d.className = "card";
        d.innerHTML = `
          <div class="card-title"><span>${k.label}</span><span class="chip">KPI</span></div>
          <div class="price" style="font-size:20px">${k.value}</div>
          <div class="row"><span>Leitura</span><span class="muted">Consistente</span></div>
        `;
        row.appendChild(d);
      }

      drawLineChart({
        mount: "#equityChart",
        tip: "#eqTip",
        series: DATA.equitySeries,
        label: (i,v)=>`Equity ${v.toFixed(0)} • passo ${i+1}`
      });

      const tb = $("#btTrades");
      tb.innerHTML = "";
      for(const t of DATA.btTrades){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${t.date}</td>
          <td class="asset">${t.asset}</td>
          <td class="mono">${t.entry}</td>
          <td class="mono">${t.exit}</td>
          <td class="mono">${t.pnl}</td>
          <td class="mono">${t.r}</td>
        `;
        tb.appendChild(tr);
      }
    }

    /* ------------------------------
       RENDER: NOTIFICATIONS & SIGNALS
    ------------------------------ */
    function renderNotifications(){
      const nb = $("#notifBody");
      nb.innerHTML = "";
      for(const n of DATA.notifications){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${n.ts}</td>
          <td class="asset">${n.asset}</td>
          <td>${n.change}</td>
          <td class="mono">${n.score}</td>
          <td class="mono">${n.regime}</td>
        `;
        nb.appendChild(tr);
      }

      const sb = $("#signalsBody");
      sb.innerHTML = "";
      for(const s of DATA.signals){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${s.ts}</td>
          <td class="asset">${s.asset}</td>
          <td>${s.event}</td>
          <td class="mono">${s.score}</td>
          <td class="mono">${s.regime}</td>
          <td><span class="badge ${signalClass(s.signal)}">${s.signal}</span></td>
        `;
        sb.appendChild(tr);
      }
    }

    /* ------------------------------
       MINIMAL SVG LINE CHART
    ------------------------------ */
    function drawLineChart({mount, tip, series, label}){
      const el = document.querySelector(mount);
      const tipEl = document.querySelector(tip);
      el.innerHTML = "";

      const w = el.clientWidth || 900;
      const h = el.clientHeight || 220;
      const pad = 18;

      const min = Math.min(...series);
      const max = Math.max(...series);
      const range = (max - min) || 1;

      const pts = series.map((v,i)=>{
        const x = pad + (i/(series.length-1))*(w - pad*2);
        const y = pad + (1-((v-min)/range))*(h - pad*2);
        return {x,y,v,i};
      });

      const d = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

      // subtle baseline
      const base = document.createElementNS(svg.namespaceURI,"path");
      base.setAttribute("d", `M ${pad} ${h-pad} L ${w-pad} ${h-pad}`);
      base.setAttribute("stroke","rgba(255,255,255,.08)");
      base.setAttribute("stroke-width","1");
      base.setAttribute("fill","none");
      svg.appendChild(base);

      // glow path (behind)
      const glow = document.createElementNS(svg.namespaceURI,"path");
      glow.setAttribute("d", d);
      glow.setAttribute("stroke","rgba(59,130,246,.30)");
      glow.setAttribute("stroke-width","6");
      glow.setAttribute("fill","none");
      glow.setAttribute("stroke-linecap","round");
      glow.setAttribute("stroke-linejoin","round");
      svg.appendChild(glow);

      // main path
      const path = document.createElementNS(svg.namespaceURI,"path");
      path.setAttribute("d", d);
      path.setAttribute("stroke","rgba(59,130,246,.95)");
      path.setAttribute("stroke-width","2.2");
      path.setAttribute("fill","none");
      path.setAttribute("stroke-linecap","round");
      path.setAttribute("stroke-linejoin","round");
      svg.appendChild(path);

      // hover dot
      const dot = document.createElementNS(svg.namespaceURI,"circle");
      dot.setAttribute("r","4.5");
      dot.setAttribute("fill","rgba(255,255,255,.92)");
      dot.setAttribute("stroke","rgba(59,130,246,.95)");
      dot.setAttribute("stroke-width","2");
      dot.style.opacity = 0;
      svg.appendChild(dot);

      // capture layer
      const rect = document.createElementNS(svg.namespaceURI,"rect");
      rect.setAttribute("x","0"); rect.setAttribute("y","0");
      rect.setAttribute("width", String(w)); rect.setAttribute("height", String(h));
      rect.setAttribute("fill","transparent");
      svg.appendChild(rect);

      rect.addEventListener("mousemove", (e)=>{
        const r = svg.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (w / r.width);

        // nearest point
        let best = pts[0];
        for(const p of pts){
          if(Math.abs(p.x - mx) < Math.abs(best.x - mx)) best = p;
        }

        dot.setAttribute("cx", best.x);
        dot.setAttribute("cy", best.y);
        dot.style.opacity = 1;

        tipEl.style.left = `${(best.x / w) * 100}%`;
        tipEl.style.top  = `${(best.y / h) * 100}%`;
        tipEl.textContent = label(best.i, best.v);
        tipEl.style.opacity = 1;
      });

      rect.addEventListener("mouseleave", ()=>{
        dot.style.opacity = 0;
        tipEl.style.opacity = 0;
      });

      el.appendChild(svg);
    }

    /* ------------------------------
       NAV / ROUTING
    ------------------------------ */
    function setActiveView(view){
      $$(".view").forEach(v=>v.classList.remove("active"));
      const el = document.querySelector(`#view-${view}`);
      if(el) el.classList.add("active");

      $$(".nav a").forEach(a=>a.classList.toggle("active", a.dataset.view === view));

      // page-specific renders
      if(view === "dashboard" || view === "watchlist") renderDashboard();
      if(view === "assets") renderAsset("BTCUSDT");
      if(view === "backtests") renderBacktests();
      if(view === "notifications" || view === "signals") renderNotifications();
      if(view === "settings") $("#lastUpdate").textContent = fmtNow();
    }

    function route(){
      const hash = location.hash || "#/dashboard";
      const view = hash.replace("#/","") || "dashboard";
      // map /assets to assets
      setActiveView(view);
    }

    /* ------------------------------
       THEME
    ------------------------------ */
    function applyTheme(next){
      if(next === "light") document.body.classList.add("light");
      else document.body.classList.remove("light");
      localStorage.setItem("botbit_theme", next);
    }

    function toggleTheme(){
      const isLight = document.body.classList.contains("light");
      applyTheme(isLight ? "dark" : "light");
      // redraw charts after theme change
      const active = document.querySelector(".view.active");
      if(active?.id === "view-dashboard") renderDashboard();
      if(active?.id === "view-backtests") renderBacktests();
    }

    /* ------------------------------
       INIT
    ------------------------------ */
    window.addEventListener("hashchange", route);

    document.addEventListener("DOMContentLoaded", ()=>{
      // load theme
      const saved = localStorage.getItem("botbit_theme") || "dark";
      applyTheme(saved);

      $("#themeBtn").addEventListener("click", toggleTheme);

      // asset shortcuts
      $("#openBtcBtn").addEventListener("click", ()=>renderAsset("BTCUSDT"));
      $("#openSolBtn").addEventListener("click", ()=>renderAsset("SOLUSDT"));

      // backtest button mock
      $("#runBacktestBtn").addEventListener("click", ()=>{
        // simple system status pulse
        const dot = $("#sysDot");
        dot.classList.add("sync");
        $("#sysStatus").textContent = "Syncing";
        setTimeout(()=>{
          dot.classList.remove("sync");
          $("#sysStatus").textContent = "Online";
          $("#lastUpdate").textContent = fmtNow();
          renderBacktests();
        }, 900);
      });

      // mark read
      $("#markReadBtn").addEventListener("click", ()=>{
        DATA.notifications = [];
        renderNotifications();
      });

      // initial
      $("#lastUpdate").textContent = fmtNow();
      route();
      renderNotifica