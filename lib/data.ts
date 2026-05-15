// ============================================================
//  PORTFOLIO DATA — edit this file to update your holdings
//  After editing, push to GitHub → Vercel auto-redeploys (~60s)
// ============================================================

// ────────────────────────────────────────────────────────────
//  YOUR HOLDINGS
//  Update `shares` after each Robinhood trade.
//  type: 'stock' or 'etf'
// ────────────────────────────────────────────────────────────
export const HOLDINGS = [
  // ── Stocks ──────────────────────────────────────────────
  { sym: 'AMZN',  shares: 0.34770,   type: 'stock', name: 'Amazon'   },
  { sym: 'NVDA',  shares: 1.67,      type: 'stock', name: 'NVIDIA'   },
  { sym: 'LIFE',  shares: 10,        type: 'stock', name: 'LIFE'     },
  { sym: 'TSM',   shares: 0.056262,  type: 'stock', name: 'TSMC'     },
  { sym: 'GOOGL', shares: 0.043085,  type: 'stock', name: 'Alphabet' },

  // ── ETFs ─────────────────────────────────────────────────
  { sym: 'SPY',   shares: 9.14,      type: 'etf',   name: 'S&P 500 ETF'       },
  { sym: 'VOO',   shares: 20.83,     type: 'etf',   name: 'Vanguard S&P 500'  },
  { sym: 'VTI',   shares: 17.87,     type: 'etf',   name: 'Vanguard Total Mkt' },
]

// ────────────────────────────────────────────────────────────
//  PORTFOLIO TARGET
//  Used for rebalance guidance in the Allocation tab.
// ────────────────────────────────────────────────────────────
export const TARGET_ETF_PCT   = 60   // % of portfolio in ETFs
export const TARGET_STOCK_PCT = 40   // % of portfolio in stocks

// ────────────────────────────────────────────────────────────
//  YOUR WATCHLIST
//  Stocks you're planning to buy.
//  Update revG (revenue growth %), tgt (analyst price target),
//  moPct/yrPct (1-month / 1-year return %) periodically.
// ────────────────────────────────────────────────────────────
export const WATCHLIST = [
  {
    sym: 'AMD',  name: 'AMD',
    revG: 22,  tgt: 500,  moPct: 80.4,  yrPct: 107.9,
    why: 'AI-era CPU/GPU challenger. Server AI accelerator market share growing. Long-term AI infrastructure pick.',
  },
  {
    sym: 'NVDA', name: 'NVIDIA',
    revG: 73,  tgt: 250,  moPct: 19.2,  yrPct: 21.1,
    why: 'Dominant AI accelerator. Datacenter revenue growing 73% YoY. Infrastructure of the AI era.',
  },
  {
    sym: 'TSM',  name: 'TSMC',
    revG: 35,  tgt: 450,  moPct: 8.2,   yrPct: 31.6,
    why: 'Makes chips for Apple, NVIDIA, AMD. Irreplaceable manufacturing scale. Long-term AI backbone.',
  },
  {
    sym: 'GOOGL', name: 'Alphabet',
    revG: 12,  tgt: 430,  moPct: 25.2,  yrPct: 28.5,
    why: 'Search monopoly + YouTube + Google Cloud growing 28%. Gemini AI expanding margins.',
  },
  {
    sym: 'LLY',  name: 'Eli Lilly',
    revG: 43,  tgt: 1225, moPct: 8.1,   yrPct: -5.5,
    why: 'GLP-1 drugs (Mounjaro/Zepbound) creating decade-long revenue stream. 43% revenue growth.',
  },
]

// ────────────────────────────────────────────────────────────
//  SCOUT LIST
//  Stocks outside your watchlist being evaluated.
//  topPick: true highlights the card with a green border.
// ────────────────────────────────────────────────────────────
export const SCOUT = [
  {
    sym: 'META',  name: 'Meta Platforms',       sec: 'AI/Social',
    revG: 24, tgt: 804,  moPct: 21.4, yrPct: 31.2, topPick: true,
    why: 'AI-driven ad revenue surging. 24% revenue growth and expanding margins. 3.2B+ daily users create an unbreakable network moat. Analyst target $804 implies ~30% upside.',
  },
  {
    sym: 'AVGO',  name: 'Broadcom Inc.',         sec: 'AI/Semis',
    revG: 51, tgt: 290,  moPct: 28.9, yrPct: 40.3, topPick: true,
    why: 'VMware integration delivering 51% revenue growth. Custom AI chips (XPUs) for hyperscalers. Growing dividend — compounding income over time.',
  },
  {
    sym: 'PLTR',  name: 'Palantir Technologies', sec: 'AI/Data',
    revG: 61, tgt: 160,  moPct: 27.9, yrPct: 55.8, topPick: false,
    why: '61% projected 2026 revenue growth. Dominant in US government AI — durable defensible moat. High PE justified by accelerating growth rate.',
  },
  {
    sym: 'MSFT',  name: 'Microsoft',             sec: 'AI/Cloud',
    revG: 15, tgt: 520,  moPct: 16.8, yrPct: 8.3,  topPick: false,
    why: 'Azure AI growing 21% YoY. Copilot upsell across 400M+ Office users. Most diversified technology moat — cloud, AI, gaming, productivity.',
  },
  {
    sym: 'ORCL',  name: 'Oracle Corporation',    sec: 'AI/Cloud',
    revG: 11, tgt: 200,  moPct: 20.1, yrPct: 34.6, topPick: false,
    why: 'OCI signing landmark AI infrastructure deals. Cloud growing 24%. Oracle database lock-in ensures decades of recurring revenue.',
  },
  {
    sym: 'JPM',   name: 'JPMorgan Chase',        sec: 'Financials',
    revG: 10, tgt: 355,  moPct: 21.7, yrPct: 46.6, topPick: false,
    why: "World's most profitable bank. 14x PE with 18% analyst upside. Rising dividends. Resilient across market cycles — ideal long-term compounder.",
  },
  {
    sym: 'UBER',  name: 'Uber Technologies',     sec: 'Consumer',
    revG: 18, tgt: 110,  moPct: 22.8, yrPct: 30.0, topPick: false,
    why: 'First full profitable year (2025). Platform network effects deepen globally. Waymo partnership = autonomous vehicle optionality at no extra capex.',
  },
  {
    sym: 'NFLX',  name: 'Netflix Inc.',          sec: 'Consumer',
    revG: 16, tgt: 1350, moPct: 21.0, yrPct: 93.7, topPick: false,
    why: 'Ad-supported tier now 40% of new sign-ups — margin expansion. Price increases stick globally. Live sports (NFL) opens massive new TAM.',
  },
]

// ────────────────────────────────────────────────────────────
//  ALL SYMBOLS (auto-derived — do not edit)
// ────────────────────────────────────────────────────────────
// SCOUT list is now dynamic (see /api/scout) — not needed here
export const ALL_SYMBOLS = Array.from(new Set(
  HOLDINGS.map(h => h.sym)
    .concat(WATCHLIST.map(w => w.sym))
))
