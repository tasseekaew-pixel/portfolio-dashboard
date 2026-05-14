import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1800 // cache 30 min

const GEMINI_KEY = process.env.GEMINI_API_KEY

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return NextResponse.json(
      { analysis: 'AI analysis unavailable — GEMINI_API_KEY not configured in Vercel environment variables.' },
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

    // Use gemini-2.5-flash — free tier, 1500 req/day, no credit card
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-goog-api-key':  GEMINI_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 400,
          temperature:     0.4,
        },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`Gemini ${res.status}:`, errText)

      // Try to parse Gemini's error message for a friendlier response
      let reason = `error ${res.status}`
      try {
        const errJson = JSON.parse(errText)
        reason = errJson?.error?.message || reason
      } catch {}

      return NextResponse.json(
        { analysis: `AI analysis unavailable: ${reason}. Headlines above are still live.` },
        { status: 200 }
      )
    }

    const data = await res.json()
    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!analysis) {
      return NextResponse.json({ analysis: 'Gemini returned an empty response. Headlines above are still live.' })
    }

    return NextResponse.json({ analysis })

  } catch (e: any) {
    console.error('Analyze route error:', e)
    return NextResponse.json(
      { analysis: 'AI analysis temporarily unavailable. Headlines above are still live.' },
      { status: 200 }
    )
  }
}
