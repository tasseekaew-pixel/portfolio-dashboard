import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1800 // cache 30 min

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent'

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return NextResponse.json(
      { analysis: 'AI analysis unavailable — GEMINI_API_KEY not configured.' },
      { status: 200 }
    )
  }

  try {
    const { sym, name, articles } = await req.json()

    if (!sym || !articles?.length) {
      return NextResponse.json({ analysis: 'No recent news found for this symbol.' })
    }

    const prompt = `You are a concise financial analyst focused on long-term investing (buy-and-hold, not trading).

Here are recent news headlines for ${name} (${sym}) from multiple financial sources:

${articles.slice(0, 8).map((a: any, i: number) =>
  `${i + 1}. [${a.source.split('/')[0].trim()}] ${a.headline}${a.summary ? '\n   ' + a.summary.slice(0, 120) : ''}`
).join('\n\n')}

Write a 3-4 sentence analysis covering:
1. The key theme across these news items and what it means for ${sym}'s long-term business fundamentals
2. Whether this is bullish, bearish, or neutral for a patient long-term holder
3. Any specific risk or opportunity worth monitoring over the next 6-12 months

Be direct and specific. No bullet points. No financial advice disclaimers. No repetition of headlines.`

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0.4,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini API error:', res.status, err)
      // Graceful fallback — still return 200 so UI shows a message
      return NextResponse.json(
        { analysis: `AI analysis temporarily unavailable (${res.status}). Headlines above are still live.` },
        { status: 200 }
      )
    }

    const data = await res.json()
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || 'Analysis unavailable.'

    return NextResponse.json({ analysis })

  } catch (e: any) {
    console.error('Analyze route error:', e)
    return NextResponse.json(
      { analysis: 'AI analysis temporarily unavailable. Headlines above are still live.' },
      { status: 200 }
    )
  }
}
