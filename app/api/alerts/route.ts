import { NextResponse } from 'next/server'

// Called by Vercel Cron — runs daily at 8 AM ET
// Also callable manually: GET /api/alerts
export const dynamic = 'force-dynamic'

const RESEND_KEY  = process.env.RESEND_API_KEY
const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const GEMINI_KEY  = process.env.GEMINI_API_KEY
const TO_EMAIL    = 'tasseekaew@gmail.com'
const FROM_EMAIL  = 'portfolio@resend.dev' // works without domain verification on Resend free tier

const SCOUT_SYMS = [
  'META','MSFT','NVDA','GOOGL','AMZN','AAPL','TSM','AVGO',
  'PLTR','AMD','JPM','V','COST','LLY','CRWD','PANW',
]

// ── Fetch live quote ──────────────────────────────────────────────────────
async function getQuote(sym: string) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    if (!d?.c || d.c <= 0) return null
    return {
      price: d.c,
      prev:  d.pc,
      pct:   d.pc > 0 ? (d.c - d.pc) / d.pc * 100 : 0,
    }
  } catch { return null }
}

// ── Fetch basic financials for upside calc ────────────────────────────────
async function getTarget(sym: string): Promise<number|null> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${FINNHUB_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return d?.metric?.targetMeanPrice || null
  } catch { return null }
}

// ── Fetch top news headlines for a symbol ────────────────────────────────
async function getNews(sym: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://finance.yahoo.com/rss/headline?s=${sym}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!r.ok) return []
    const xml  = await r.text()
    const items = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
      .map(m => m[1].trim()).filter(Boolean).slice(0, 3)
    return items
  } catch { return [] }
}

// ── Ask Gemini to identify significant news ───────────────────────────────
async function assessImpact(alerts: AlertStock[]): Promise<string> {
  if (!GEMINI_KEY || !alerts.length) return ''
  const prompt = `You are a concise financial analyst for a long-term investor.

These stocks showed strong upside signals today:

${alerts.map(a => `${a.sym} (${a.name}): +${a.upside.toFixed(1)}% analyst upside, ${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}% today
Recent headlines: ${a.headlines.slice(0,2).join(' | ') || 'none'}`).join('\n\n')}

Write 2-3 sentences total summarizing: what's driving these signals and whether they represent a meaningful long-term opportunity or just short-term noise. Be specific and direct.`

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:200,temperature:0.3} }) }
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
  headlines: string[]
}

// ── Build HTML email ──────────────────────────────────────────────────────
function buildEmail(alerts: AlertStock[], aiSummary: string, date: string): string {
  const rows = alerts.map(a => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
        <div style="font-size:16px;font-weight:700;color:#111;">${a.sym}</div>
        <div style="font-size:12px;color:#888;margin-top:1px;">${a.name}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;">
        <div style="font-size:15px;font-weight:600;">$${a.price.toFixed(2)}</div>
        <div style="font-size:12px;color:${a.pct>=0?'#1d9e75':'#d64045'};font-weight:500;">
          ${a.pct>=0?'▲':'▼'} ${Math.abs(a.pct).toFixed(2)}% today
        </div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;">
        <div style="font-size:14px;font-weight:600;color:#1d9e75;">+${a.upside.toFixed(1)}%</div>
        <div style="font-size:11px;color:#888;">analyst upside</div>
      </td>
    </tr>
    ${a.headlines.length ? `
    <tr>
      <td colspan="3" style="padding:4px 16px 12px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
        ${a.headlines.map(h => `<div style="font-size:12px;color:#444;padding:2px 0;">• ${h}</div>`).join('')}
      </td>
    </tr>` : ''}
  `).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    
    <!-- Header -->
    <div style="background:#111;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Portfolio Alert</div>
      <div style="font-size:22px;font-weight:700;color:#fff;">📈 Strong Upside Stocks</div>
      <div style="font-size:13px;color:#aaa;margin-top:4px;">${date}</div>
    </div>

    <!-- AI Summary -->
    ${aiSummary ? `
    <div style="background:#1d9e75;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:10px;font-weight:700;color:#e8f5f0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">AI Analysis</div>
      <div style="font-size:13px;color:#fff;line-height:1.6;">${aiSummary}</div>
    </div>` : ''}

    <!-- Table -->
    <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8;margin-bottom:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f8f8;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Stock</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Price</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Upside</th>
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
    <div style="text-align:center;font-size:11px;color:#aaa;line-height:1.6;">
      Sent from your Portfolio Dashboard · Long-term investor alerts<br>
      Stocks shown have analyst upside &gt;15% and are in your scout universe.<br>
      <em>Not financial advice. Always do your own research.</em>
    </div>

  </div>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function GET() {
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }
  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })
  }

  // Fetch quotes + targets for scout universe (batched to respect rate limits)
  const alertStocks: AlertStock[] = []
  const batchSize = 4

  for (let i = 0; i < SCOUT_SYMS.length; i += batchSize) {
    const batch = SCOUT_SYMS.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(async sym => {
      const [quote, target] = await Promise.all([getQuote(sym), getTarget(sym)])
      if (!quote || !target) return null
      const upside = (target - quote.price) / quote.price * 100
      // Only alert on stocks with >15% analyst upside
      if (upside < 15) return null
      const headlines = await getNews(sym)
      return { sym, name: sym, price: quote.price, pct: quote.pct, upside, headlines } as AlertStock
    }))
    alertStocks.push(...results.filter(Boolean) as AlertStock[])
    if (i + batchSize < SCOUT_SYMS.length) await new Promise(r => setTimeout(r, 300))
  }

  if (!alertStocks.length) {
    return NextResponse.json({
      sent: false,
      reason: 'No stocks with >15% analyst upside found today',
      checked: SCOUT_SYMS.length,
    })
  }

  // Sort by upside descending
  alertStocks.sort((a, b) => b.upside - a.upside)

  // Get AI summary
  const aiSummary = await assessImpact(alertStocks.slice(0, 5))

  // Build and send email
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const html = buildEmail(alertStocks, aiSummary, date)

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [TO_EMAIL],
      subject: `📈 ${alertStocks.length} strong upside stock${alertStocks.length > 1 ? 's' : ''} — ${date}`,
      html,
    }),
  })

  const emailData = await emailRes.json()

  if (!emailRes.ok) {
    console.error('Resend error:', emailData)
    return NextResponse.json({ sent: false, error: emailData }, { status: 500 })
  }

  return NextResponse.json({
    sent:      true,
    to:        TO_EMAIL,
    stocks:    alertStocks.map(a => ({ sym: a.sym, upside: a.upside.toFixed(1)+'%' })),
    emailId:   emailData.id,
  })
}
