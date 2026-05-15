import { NextResponse } from 'next/server'

export const revalidate = 14400 // cache 4 hours

const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const GEMINI_KEY  = process.env.GEMINI_API_KEY

// ── Step 1: Get trending symbols from Finnhub market news ──────────────────
async function getTrendingSymbols(): Promise<string[]> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${FINNHUB_KEY}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) return []
    const articles = await res.json()
    if (!Array.isArray(articles)) return []

    // Extract ticker-like uppercase words from headlines (2-5 chars, all caps)
    const tickerRe = /\b([A-Z]{2,5})\b/g
    const counts: Record<string, number> = {}
    const noise = new Set([
      'AI','US','CEO','IPO','GDP','FED','SEC','ETF','EPS','PE','Q1','Q2','Q3','Q4',
      'YOY','MOM','USD','EUR','NEW','NOW','THE','AND','FOR','BUT','NOT','HAS'
    ])
    for (const a of articles.slice(0, 30)) {
      const text = (a.headline || '') + ' ' + (a.summary || '')
      for (const m of text.matchAll(tickerRe)) {
        const t = m[1]
        if (!noise.has(t)) counts[t] = (counts[t] || 0) + 1
      }
    }
    // Return top mentioned, likely tickers
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([t]) => t)
  } catch { return [] }
}

// ── Step 2: Get live quote for a symbol ────────────────────────────────────
async function getQuote(sym: string) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return null
    const d = await res.json()
    if (!d || !d.c || d.c <= 0) return null
    return {
      price:  d.c,
      prev:   d.pc,
      pct:    d.pc > 0 ? (d.c - d.pc) / d.pc * 100 : 0,
      high52: d.h,  // note: finnhub /quote gives day high, not 52w
    }
  } catch { return null }
}

// ── Step 3: Get company profile ────────────────────────────────────────────
async function getProfile(sym: string) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return null
    const d = await res.json()
    if (!d || !d.name || !d.marketCapitalization) return null
    return {
      name:       d.name,
      sector:     d.finnhubIndustry || 'Unknown',
      marketCap:  d.marketCapitalization, // in millions
      country:    d.country,
      exchange:   d.exchange,
    }
  } catch { return null }
}

// ── Step 4: Get basic financials for fundamentals ─────────────────────────
async function getBasicFinancials(sym: string) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return null
    const d = await res.json()
    const m = d?.metric || {}
    return {
      pe:          m['peNormalizedAnnual']    || m['peTTM']         || null,
      revGrowth:   m['revenueGrowthAnnual']   || m['revenueGrowth3Y'] || null,
      eps:         m['epsTTM']                || null,
      roe:         m['roeTTM']                || null,
      week52High:  m['52WeekHigh']            || null,
      week52Low:   m['52WeekLow']             || null,
      analystTarget: m['targetMeanPrice']     || null,
    }
  } catch { return null }
}

// ── Step 5: Get recent news for the symbol ────────────────────────────────
async function getSymbolNews(sym: string): Promise<string[]> {
  try {
    const to   = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const res  = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return []
    const articles = await res.json()
    if (!Array.isArray(articles)) return []
    return articles.slice(0, 4).map((a: any) => a.headline).filter(Boolean)
  } catch { return [] }
}

// ── Step 6: Ask Gemini to evaluate & rank the candidates ──────────────────
async function rankWithGemini(candidates: any[]): Promise<any[]> {
  if (!GEMINI_KEY || !candidates.length) return candidates

  const prompt = `You are a long-term equity analyst. Evaluate these stock candidates for a buy-and-hold investor (3-5 year horizon). 

For each stock, consider: business quality, growth runway, competitive moat, current momentum, and valuation.

Candidates:
${candidates.map((c, i) => `
${i + 1}. ${c.sym} — ${c.name} (${c.sector})
   Price: $${c.price?.toFixed(2)} | Daily change: ${c.pct?.toFixed(2)}%
   Market cap: $${c.marketCap ? (c.marketCap / 1000).toFixed(1) + 'B' : 'unknown'}
   PE: ${c.pe || 'N/A'} | Revenue growth: ${c.revGrowth ? c.revGrowth.toFixed(1) + '%' : 'N/A'}
   52w range: $${c.week52Low || '?'} – $${c.week52High || '?'}
   Analyst target: $${c.analystTarget || 'N/A'}
   Recent news: ${c.headlines?.slice(0,2).join(' | ') || 'none'}
`).join('\n')}

Respond ONLY with a valid JSON array (no markdown, no explanation) of the top 8 picks in this exact format:
[
  {
    "sym": "TICKER",
    "rank": 1,
    "verdict": "Strong long-term buy",
    "why": "2-3 sentence explanation of why this is a strong long-term hold. Be specific about the business.",
    "risk": "Key risk to monitor",
    "ltScore": 85,
    "topPick": true
  }
]

ltScore is 0-100 for long-term suitability. topPick is true only for the top 2. verdict is one of: "Strong long-term buy", "Good accumulate candidate", "Watch for entry".`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
        }),
      }
    )
    if (!res.ok) return candidates

    const data   = await res.json()
    const text   = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Strip any markdown fences and parse JSON
    const clean  = text.replace(/```json|```/g, '').trim()
    const ranked = JSON.parse(clean)
    if (!Array.isArray(ranked)) return candidates

    // Merge Gemini rankings back with our fetched data
    return ranked.map((r: any) => {
      const base = candidates.find(c => c.sym === r.sym) || {}
      return { ...base, ...r }
    }).filter((r: any) => r.sym && r.price)

  } catch (e) {
    console.error('Gemini ranking error:', e)
    return candidates
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function GET() {
  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })
  }

  // Seed list: trending from news + a stable base of quality large-caps to ensure
  // we always have good candidates even on slow news days
  const baseCandidates = [
    'META','MSFT','NVDA','GOOGL','AMZN','AAPL','TSM','AVGO',
    'PLTR','AMD','JPM','V','MA','UNH','COST','LLY','UBER','NFLX',
    'CRM','ORCL','SNOW','SHOP','MELI','SE','CRWD','PANW'
  ]
  const trending = await getTrendingSymbols()

  // Combine, deduplicate, limit total candidates
  const allSyms = [...new Set([...trending, ...baseCandidates])].slice(0, 30)

  // Fetch data in parallel — use small batches to respect rate limits
  const results: any[] = []
  const batchSize = 6
  for (let i = 0; i < allSyms.length; i += batchSize) {
    const batch = allSyms.slice(i, i + batchSize)
    const fetched = await Promise.all(batch.map(async sym => {
      const [quote, profile, financials, headlines] = await Promise.all([
        getQuote(sym),
        getProfile(sym),
        getBasicFinancials(sym),
        getSymbolNews(sym),
      ])
      if (!quote || !profile) return null
      // Filter: US-listed, reasonable market cap (>$5B), positive price
      if (profile.marketCap < 5000) return null
      if (profile.country !== 'US' && !['TSM','SHOP','MELI','SE'].includes(sym)) return null
      return {
        sym,
        name:        profile.name,
        sec:         profile.sector,
        price:       quote.price,
        pct:         quote.pct,
        prev:        quote.prev,
        marketCap:   profile.marketCap,
        pe:          financials?.pe,
        revGrowth:   financials?.revGrowth,
        eps:         financials?.eps,
        week52High:  financials?.week52High,
        week52Low:   financials?.week52Low,
        analystTarget: financials?.analystTarget,
        headlines,
        // Defaults before Gemini enriches them
        why:      '',
        risk:     '',
        verdict:  'Watch for entry',
        ltScore:  50,
        topPick:  false,
        rank:     99,
      }
    }))
    results.push(...fetched.filter(Boolean))
    // Brief delay between batches to respect Finnhub rate limit
    if (i + batchSize < allSyms.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  if (!results.length) {
    return NextResponse.json({ error: 'No candidates found', stocks: [] }, { status: 200 })
  }

  // Sort by momentum + size before sending to Gemini (pick top 15 to keep prompt concise)
  const preRanked = results
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 15)

  // Let Gemini rank and enrich the top candidates
  const ranked = await rankWithGemini(preRanked)

  return NextResponse.json({
    stocks: ranked,
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: results.length,
  })
}
