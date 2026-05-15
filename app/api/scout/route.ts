import { NextResponse } from 'next/server'

export const revalidate = 14400 // 4 hours

const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const GEMINI_KEY  = process.env.GEMINI_API_KEY

const BASE = [
  'META','MSFT','NVDA','GOOGL','AMZN','AAPL','TSM','AVGO',
  'PLTR','AMD','JPM','V','MA','UNH','COST','LLY','UBER','NFLX',
  'CRM','ORCL','CRWD','PANW','SNOW','SHOP','MELI',
]

async function fhGet(path: string) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1${path}&token=${FINNHUB_KEY}`)
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

async function getQuote(sym: string) {
  const d = await fhGet(`/quote?symbol=${sym}`)
  if (!d || d.c <= 0) return null
  return { price: d.c, prev: d.pc, pct: d.pc > 0 ? (d.c-d.pc)/d.pc*100 : 0 }
}

async function getProfile(sym: string) {
  const d = await fhGet(`/stock/profile2?symbol=${sym}`)
  if (!d?.name || !d.marketCapitalization) return null
  return { name: d.name, sector: d.finnhubIndustry||'Unknown', marketCap: d.marketCapitalization, country: d.country }
}

async function getFinancials(sym: string) {
  const d = await fhGet(`/stock/metric?symbol=${sym}&metric=all`)
  if (!d?.metric) return {}
  const m = d.metric
  return {
    pe:          m.peNormalizedAnnual || m.peTTM        || null,
    revGrowth:   m.revenueGrowthAnnual|| m.revenueGrowth3Y || null,
    week52High:  m['52WeekHigh']       || null,
    week52Low:   m['52WeekLow']        || null,
    analystTarget: m.targetMeanPrice   || null,
  }
}

// Score each stock locally without Gemini as a baseline
function localScore(c: any): number {
  let s = 40 // base
  if (c.pct > 0)   s += 10
  if (c.pct > 2)   s += 5
  if (c.revGrowth && c.revGrowth > 15) s += 10
  if (c.revGrowth && c.revGrowth > 40) s += 10
  if (c.analystTarget && c.price && c.analystTarget > c.price * 1.1) s += 10
  if (c.analystTarget && c.price && c.analystTarget > c.price * 1.2) s += 5
  if (c.pe && c.pe < 30) s += 5
  if (c.marketCap > 500000) s += 5 // mega cap = stability
  return Math.min(100, Math.round(s))
}

async function rankWithGemini(candidates: any[]): Promise<any[]> {
  if (!GEMINI_KEY || !candidates.length) {
    // Return with local scores if no Gemini
    return candidates.map(c => ({
      ...c,
      ltScore:  localScore(c),
      verdict:  localScore(c) >= 70 ? 'Strong long-term buy' : localScore(c) >= 50 ? 'Good accumulate candidate' : 'Watch for entry',
      why:      `${c.name} is a ${c.sec} company with ${c.revGrowth ? c.revGrowth.toFixed(1)+'% revenue growth' : 'solid fundamentals'} and a market cap of $${c.marketCap ? (c.marketCap/1000).toFixed(0)+'B' : 'N/A'}.`,
      risk:     'Monitor macro conditions and sector rotation.',
      topPick:  false,
    })).sort((a,b) => b.ltScore - a.ltScore).map((c,i) => ({ ...c, rank: i+1, topPick: i < 2 }))
  }

  const prompt = `You are a senior equity analyst. Rank these ${candidates.length} stocks for a long-term buy-and-hold investor (3-5 year horizon).

${candidates.map((c,i) => `${i+1}. ${c.sym} — ${c.name} (${c.sector})
   Price $${c.price?.toFixed(2)} | Day ${c.pct?.toFixed(2)}% | MCap $${c.marketCap?(c.marketCap/1000).toFixed(0)+'B':'?'} | PE ${c.pe?.toFixed(0)||'N/A'} | RevGrowth ${c.revGrowth?.toFixed(1)||'N/A'}% | Target $${c.analystTarget||'N/A'}`).join('\n')}

Return ONLY a JSON array, no markdown, no explanation. Pick the best 8:
[{"sym":"TICKER","rank":1,"ltScore":85,"verdict":"Strong long-term buy","why":"2-3 sentences on business quality and long-term thesis.","risk":"One key risk.","topPick":true}]

Rules: ltScore 0-100. topPick true only for rank 1-2. verdict must be exactly one of: "Strong long-term buy", "Good accumulate candidate", "Watch for entry".`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
      }
    )

    if (!res.ok) {
      console.error('Gemini scout HTTP', res.status, await res.text())
      throw new Error(`Gemini ${res.status}`)
    }

    const data = await res.json()
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!raw) throw new Error('Empty Gemini response')

    // Robust JSON extraction — find the first [...] block
    const start = raw.indexOf('[')
    const end   = raw.lastIndexOf(']')
    if (start === -1 || end === -1) throw new Error('No JSON array in response')

    const ranked: any[] = JSON.parse(raw.slice(start, end+1))
    if (!Array.isArray(ranked) || !ranked.length) throw new Error('Empty array from Gemini')

    // Merge Gemini enrichment back onto fetched candidate data
    const enriched = ranked.map((r: any) => {
      const base = candidates.find(c => c.sym === r.sym)
      if (!base) return null
      return {
        ...base,
        rank:     r.rank    || 99,
        ltScore:  typeof r.ltScore === 'number' ? r.ltScore : localScore(base),
        verdict:  r.verdict || 'Watch for entry',
        why:      r.why     || '',
        risk:     r.risk    || '',
        topPick:  r.topPick === true,
      }
    }).filter(Boolean)

    // If Gemini returned fewer than expected, pad with remaining candidates using local scores
    const enrichedSyms = new Set(enriched.map((c:any) => c.sym))
    const remaining = candidates
      .filter(c => !enrichedSyms.has(c.sym))
      .map(c => ({
        ...c,
        rank: 99, ltScore: localScore(c),
        verdict: 'Watch for entry', why: '', risk: '', topPick: false,
      }))

    return [...enriched, ...remaining].sort((a:any,b:any) => a.rank - b.rank)

  } catch (e) {
    console.error('Gemini ranking failed, using local scores:', e)
    // Graceful fallback — local scoring so the tab always shows something
    return candidates
      .map(c => ({
        ...c,
        ltScore:  localScore(c),
        verdict:  localScore(c)>=70 ? 'Strong long-term buy' : localScore(c)>=50 ? 'Good accumulate candidate' : 'Watch for entry',
        why:      `${c.name} operates in ${c.sec} with ${c.revGrowth ? c.revGrowth.toFixed(1)+'% annual revenue growth' : 'stable fundamentals'}. Market cap $${c.marketCap?(c.marketCap/1000).toFixed(0)+'B':'N/A'}.`,
        risk:     'Monitor sector rotation and macro conditions.',
        topPick:  false,
      }))
      .sort((a,b) => b.ltScore - a.ltScore)
      .map((c,i) => ({ ...c, rank: i+1, topPick: i < 2 }))
  }
}

export async function GET() {
  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })
  }

  // Fetch quotes and profiles in parallel batches
  const results: any[] = []
  const batchSize = 5

  for (let i = 0; i < BASE.length; i += batchSize) {
    const batch = BASE.slice(i, i+batchSize)
    const fetched = await Promise.all(batch.map(async sym => {
      const [quote, profile, fins] = await Promise.all([
        getQuote(sym),
        getProfile(sym),
        getFinancials(sym),
      ])
      if (!quote || !profile) return null
      if (profile.marketCap < 3000) return null // >$3B only
      return {
        sym, name: profile.name, sec: profile.sector,
        price: quote.price, pct: quote.pct, prev: quote.prev,
        marketCap: profile.marketCap,
        pe: fins.pe, revGrowth: fins.revGrowth,
        week52High: fins.week52High, week52Low: fins.week52Low,
        analystTarget: fins.analystTarget,
        headlines: [], // skip per-symbol news to save Finnhub quota
        why: '', risk: '', verdict: 'Watch for entry', ltScore: 50, topPick: false, rank: 99,
      }
    }))
    results.push(...fetched.filter(Boolean))
    if (i+batchSize < BASE.length) await new Promise(r => setTimeout(r, 250))
  }

  if (!results.length) {
    return NextResponse.json({ error: 'Could not fetch any candidate data. Check Finnhub API key.', stocks: [] })
  }

  // Pre-sort by momentum then let Gemini pick the best 8
  const preRanked = [...results].sort((a,b) => b.pct - a.pct).slice(0, 15)
  const ranked = await rankWithGemini(preRanked)

  return NextResponse.json({
    stocks: ranked.slice(0, 8),
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: results.length,
    geminiUsed: !!GEMINI_KEY,
  })
}
