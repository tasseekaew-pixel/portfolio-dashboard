import { NextResponse } from 'next/server'

// Called by Vercel Cron — runs daily at 8 AM ET (1 PM UTC) Mon-Fri
// Trigger manually: GET /api/alerts
export const dynamic = 'force-dynamic'

const RESEND_KEY  = process.env.RESEND_API_KEY
const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const GEMINI_KEY  = process.env.GEMINI_API_KEY
const TO_EMAIL    = 'tasseekaew@gmail.com'
const FROM_EMAIL  = 'portfolio@resend.dev'

const SCOUT_SYMS = [
  'META','MSFT','NVDA','GOOGL','AMZN','AAPL','TSM','AVGO',
  'PLTR','AMD','JPM','V','COST','LLY','CRWD','PANW',
]

// PE thresholds by sector — what counts as "reasonable" PE
// Growth tech can carry higher PE; financials/value should be lower
const PE_SECTOR_BENCHMARKS: Record<string, number> = {
  META: 35, MSFT: 40, NVDA: 60, GOOGL: 30, AMZN: 45, AAPL: 32,
  TSM: 25,  AVGO: 40, PLTR: 150,AMD: 40,  JPM: 16,   V: 35,
  COST: 55, LLY: 60,  CRWD: 80, PANW: 70,
}

// ── PE valuation label ────────────────────────────────────────────────────
function peLabel(sym: string, pe: number | null): { text: string; color: string } {
  if (!pe || pe <= 0) return { text: 'N/A', color: '#888' }
  const benchmark = PE_SECTOR_BENCHMARKS[sym] || 35
  if (pe < benchmark * 0.75) return { text: `${pe.toFixed(0)}x ✓ Cheap`,    color: '#1d9e75' }
  if (pe < benchmark)        return { text: `${pe.toFixed(0)}x ✓ Fair`,      color: '#1d9e75' }
  if (pe < benchmark * 1.3)  return { text: `${pe.toFixed(0)}x ~ Stretched`, color: '#e06c00' }
  return                            { text: `${pe.toFixed(0)}x ✗ Expensive`, color: '#d64045' }
}

// ── Composite score: upside + PE attractiveness ───────────────────────────
// Higher = more attractive alert. Rewards high upside + reasonable PE.
function compositeScore(upside: number, pe: number | null, sym: string): number {
  // Start with analyst upside (0-100 range, capped)
  let score = Math.min(upside, 60)

  if (pe && pe > 0) {
    const benchmark = PE_SECTOR_BENCHMARKS[sym] || 35
    const peRatio   = pe / benchmark // 1.0 = fairly valued
    if (peRatio < 0.75) score += 25      // deeply undervalued → strong bonus
    else if (peRatio < 1.0) score += 15  // fairly valued → moderate bonus
    else if (peRatio < 1.3) score += 0   // slightly stretched → no bonus
    else if (peRatio < 1.6) score -= 10  // expensive → penalty
    else score -= 20                     // very expensive → bigger penalty
  }

  return Math.round(score)
}

// ── Fetch live quote ──────────────────────────────────────────────────────
async function getQuote(sym: string) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    if (!d?.c || d.c <= 0) return null
    return { price: d.c, pct: d.pc > 0 ? (d.c - d.pc) / d.pc * 100 : 0 }
  } catch { return null }
}

// ── Fetch analyst target + PE in one call ────────────────────────────────
async function getMetrics(sym: string): Promise<{ target: number|null; pe: number|null; revGrowth: number|null }> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${FINNHUB_KEY}`)
    if (!r.ok) return { target: null, pe: null, revGrowth: null }
    const d = await r.json()
    const m = d?.metric || {}
    return {
      target:    m.targetMeanPrice          || null,
      pe:        m.peNormalizedAnnual || m.peTTM || null,
      revGrowth: m.revenueGrowthAnnual || m.revenueGrowth3Y || null,
    }
  } catch { return { target: null, pe: null, revGrowth: null } }
}

// ── Fetch company name from profile ──────────────────────────────────────
async function getName(sym: string): Promise<string> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_KEY}`)
    if (!r.ok) return sym
    const d = await r.json()
    return d?.name || sym
  } catch { return sym }
}

// ── Fetch Yahoo Finance RSS headlines ────────────────────────────────────
async function getNews(sym: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://finance.yahoo.com/rss/headline?s=${sym}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!r.ok) return []
    const xml = await r.text()
    return [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
      .map(m => m[1].trim()).filter(Boolean).slice(0, 3)
  } catch { return [] }
}

// ── Ask Gemini for AI analysis — now includes PE context ─────────────────
async function assessImpact(alerts: AlertStock[]): Promise<string> {
  if (!GEMINI_KEY || !alerts.length) return ''

  const prompt = `You are a concise financial analyst for a long-term buy-and-hold investor.

These stocks showed strong upside signals today, sorted by attractiveness (upside + valuation):

${alerts.map(a => {
  const benchmark = PE_SECTOR_BENCHMARKS[a.sym] || 35
  const peNote = a.pe
    ? `PE ${a.pe.toFixed(0)}x (sector benchmark ~${benchmark}x — ${a.pe < benchmark ? 'below benchmark, relatively cheap' : 'above benchmark, priced for growth'})`
    : 'PE unavailable'
  return `${a.sym} (${a.name}):
  - Analyst upside: +${a.upside.toFixed(1)}% to price target
  - Daily change: ${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%
  - ${peNote}
  - Revenue growth: ${a.revGrowth ? a.revGrowth.toFixed(1)+'%' : 'N/A'}
  - Recent news: ${a.headlines.slice(0,2).join(' | ') || 'none'}`
}).join('\n\n')}

Write 3-4 sentences covering:
1. Which stocks look most attractive considering BOTH upside AND valuation (PE relative to their sector)
2. Whether the current PE levels suggest the upside is priced in or still achievable
3. Any news-driven catalyst worth watching

Be specific. Reference ticker symbols and numbers. No disclaimers.`

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 280, temperature: 0.3 },
        }),
      }
    )
    if (!r.ok) return ''
    const d = await r.json()
    return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  } catch { return '' }
}

interface AlertStock {
  sym:       string
  name:      string
  price:     number
  pct:       number
  upside:    number
  pe:        number | null
  revGrowth: number | null
  score:     number        // composite score for sorting
  headlines: string[]
}

// ── Build HTML email ──────────────────────────────────────────────────────
function buildEmail(alerts: AlertStock[], aiSummary: string, date: string): string {
  const rows = alerts.map(a => {
    const pl    = peLabel(a.sym, a.pe)
    const bench = PE_SECTOR_BENCHMARKS[a.sym] || 35
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
        <div style="font-size:16px;font-weight:700;color:#111;">${a.sym}</div>
        <div style="font-size:12px;color:#888;margin-top:1px;">${a.name}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
        <div style="font-size:15px;font-weight:600;color:#111;">$${a.price.toFixed(2)}</div>
        <div style="font-size:12px;color:${a.pct>=0?'#1d9e75':'#d64045'};font-weight:500;margin-top:2px;">
          ${a.pct>=0?'▲':'▼'} ${Math.abs(a.pct).toFixed(2)}% today
        </div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
        <div style="font-size:14px;font-weight:700;color:#1d9e75;">+${a.upside.toFixed(1)}%</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">analyst upside</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
        <div style="font-size:13px;font-weight:600;color:${pl.color};">${pl.text}</div>
        <div style="font-size:10px;color:#bbb;margin-top:2px;">bench: ~${bench}x</div>
      </td>
    </tr>
    ${a.headlines.length ? `
    <tr>
      <td colspan="4" style="padding:4px 16px 12px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
        ${a.headlines.map(h => `<div style="font-size:12px;color:#444;padding:2px 0;line-height:1.5;">• ${h}</div>`).join('')}
      </td>
    </tr>` : ''}
  `}).join('')

  // PE legend
  const legend = `
    <div style="background:#f8f8f8;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#666;line-height:1.8;">
      <strong style="color:#111;">PE Guide</strong> (vs sector benchmark):<br>
      <span style="color:#1d9e75;">✓ Cheap / Fair</span> — below or at sector benchmark &nbsp;·&nbsp;
      <span style="color:#e06c00;">~ Stretched</span> — 0–30% above benchmark &nbsp;·&nbsp;
      <span style="color:#d64045;">✗ Expensive</span> — 30%+ above benchmark
    </div>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:#111;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Portfolio Alert</div>
      <div style="font-size:22px;font-weight:700;color:#fff;">📈 Strong Upside Stocks</div>
      <div style="font-size:13px;color:#aaa;margin-top:4px;">${date}</div>
      <div style="font-size:11px;color:#666;margin-top:6px;">Sorted by composite score (analyst upside + PE attractiveness)</div>
    </div>

    <!-- AI Summary -->
    ${aiSummary ? `
    <div style="background:#1d9e75;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:10px;font-weight:700;color:#e8f5f0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">AI Analysis — Upside + Valuation</div>
      <div style="font-size:13px;color:#fff;line-height:1.7;">${aiSummary}</div>
    </div>` : ''}

    <!-- PE Legend -->
    ${legend}

    <!-- Table -->
    <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8;margin-bottom:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f8f8;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Stock</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Price</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Upside</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">PE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:16px;">
      <a href="https://portfolio-dashboard-psi-five.vercel.app"
        style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
        Open Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:11px;color:#aaa;line-height:1.7;">
      Sent from your Portfolio Dashboard · Long-term investor alerts<br>
      Stocks shown: analyst upside &gt;15% · sorted by upside + PE composite score<br>
      PE benchmarks are sector-adjusted (e.g. growth tech &gt; value stocks).<br>
      <em>Not financial advice. Always do your own research.</em>
    </div>

  </div>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function GET() {
  if (!RESEND_KEY)  return NextResponse.json({ error: 'RESEND_API_KEY not configured'  }, { status: 500 })
  if (!FINNHUB_KEY) return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })

  const alertStocks: AlertStock[] = []
  const batchSize = 3 // smaller batches — we now make 3 API calls per symbol

  for (let i = 0; i < SCOUT_SYMS.length; i += batchSize) {
    const batch = SCOUT_SYMS.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(async sym => {
      const [quote, metrics, name] = await Promise.all([
        getQuote(sym),
        getMetrics(sym),
        getName(sym),
      ])
      if (!quote || !metrics.target) return null

      const upside = (metrics.target - quote.price) / quote.price * 100
      if (upside < 15) return null // minimum upside threshold

      const headlines = await getNews(sym)
      const score     = compositeScore(upside, metrics.pe, sym)

      return {
        sym,
        name,
        price:     quote.price,
        pct:       quote.pct,
        upside,
        pe:        metrics.pe,
        revGrowth: metrics.revGrowth,
        score,
        headlines,
      } as AlertStock
    }))
    alertStocks.push(...results.filter(Boolean) as AlertStock[])
    if (i + batchSize < SCOUT_SYMS.length) await new Promise(r => setTimeout(r, 400))
  }

  if (!alertStocks.length) {
    return NextResponse.json({
      sent:    false,
      reason:  'No stocks with >15% analyst upside found today',
      checked: SCOUT_SYMS.length,
    })
  }

  // Sort by composite score — best upside+PE combination first
  alertStocks.sort((a, b) => b.score - a.score)

  const aiSummary = await assessImpact(alertStocks.slice(0, 6))

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const html = buildEmail(alertStocks, aiSummary, date)

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [TO_EMAIL],
      subject: `📈 ${alertStocks.length} upside stock${alertStocks.length > 1 ? 's' : ''} — ${date}`,
      html,
    }),
  })

  const emailData = await emailRes.json()
  if (!emailRes.ok) {
    console.error('Resend error:', emailData)
    return NextResponse.json({ sent: false, error: emailData }, { status: 500 })
  }

  return NextResponse.json({
    sent:    true,
    to:      TO_EMAIL,
    stocks:  alertStocks.map(a => ({
      sym:    a.sym,
      upside: a.upside.toFixed(1) + '%',
      pe:     a.pe ? a.pe.toFixed(0) + 'x' : 'N/A',
      score:  a.score,
    })),
    emailId: emailData.id,
  })
}
