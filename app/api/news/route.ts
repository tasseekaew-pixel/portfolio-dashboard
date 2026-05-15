import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 900 // 15 min cache

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  try {
    const body = await req.json()
    // Support both single { sym, name, articles } and batch { stocks: [{sym,name,articles}] }
    const stocks: { sym: string; name: string; articles: any[] }[] =
      body.stocks || [{ sym: body.sym, name: body.name, articles: body.articles }]

    if (!stocks.length || !stocks[0].sym) {
      return NextResponse.json({ results: {} })
    }

    // Filter only stocks that have articles
    const withNews = stocks.filter(s => s.articles?.length > 0)
    if (!withNews.length) {
      const results: Record<string,string> = {}
      stocks.forEach(s => { results[s.sym] = 'No recent news found for this symbol.' })
      return NextResponse.json({ results })
    }

    // Single Gemini call for all stocks — much more efficient
    const prompt = `You are a senior equity analyst focused on long-term investing (3-5 year buy-and-hold horizon).

Analyze the following stocks based on their recent news. For EACH stock write a 2-3 sentence analysis covering:
1. What the news means for the company's long-term business fundamentals
2. Whether it is bullish, bearish, or neutral for a long-term investor
3. One specific opportunity or risk to watch over the next 6-12 months

Be direct, specific, and insightful. No generic statements. No disclaimers. No bullet points.

${withNews.map(s => `
--- ${s.sym} (${s.name}) ---
${s.articles.slice(0,5).map((a,i) => `${i+1}. [${a.source}] ${a.headline}${a.summary ? ' — '+a.summary.slice(0,100) : ''}`).join('\n')}
`).join('\n')}

Respond ONLY with valid JSON (no markdown fences) in this exact format:
{
  ${withNews.map(s => `"${s.sym}": "your 2-3 sentence analysis here"`).join(',\n  ')}
}`

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1200, temperature: 0.3 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini error:', res.status, err)
      const results: Record<string,string> = {}
      stocks.forEach(s => { results[s.sym] = 'AI analysis temporarily unavailable.' })
      return NextResponse.json({ results })
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from Gemini response — strip any accidental markdown fences
    let parsed: Record<string,string> = {}
    try {
      const clean = text.replace(/```json|```/g,'').trim()
      parsed = JSON.parse(clean)
    } catch {
      // If JSON parse fails, try to extract per-symbol manually
      for (const s of withNews) {
        const re = new RegExp(`"${s.sym}"\\s*:\\s*"([^"]+)"`)
        const match = text.match(re)
        if (match) parsed[s.sym] = match[1]
      }
    }

    // Fill in any missing symbols
    const results: Record<string,string> = {}
    stocks.forEach(s => {
      results[s.sym] = parsed[s.sym] || (s.articles.length ? 'Analysis unavailable for this symbol.' : 'No recent news found.')
    })

    return NextResponse.json({ results })

  } catch (e: any) {
    console.error('Analyze error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
