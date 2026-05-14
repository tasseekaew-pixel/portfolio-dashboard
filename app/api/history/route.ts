import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 3600 // cache 1 hour

export async function GET(req: NextRequest) {
  const sym  = req.nextUrl.searchParams.get('sym')
  const days = parseInt(req.nextUrl.searchParams.get('days') || '60')

  if (!sym) {
    return NextResponse.json({ error: 'sym parameter required' }, { status: 400 })
  }

  // Yahoo Finance v8 chart endpoint — free, no key needed
  // interval=1d gives daily closes; range covers requested days
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=${range}`

  try {
    const res = await fetch(url, {
      headers: {
        // Required — Yahoo blocks requests without a browser User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned HTTP ${res.status} for ${sym}` },
        { status: 502 }
      )
    }

    const json = await res.json()
    const result = json?.chart?.result?.[0]

    if (!result) {
      return NextResponse.json({ sym, closes: [], dates: [] })
    }

    const timestamps: number[] = result.timestamp || []
    const closes: number[] = result.indicators?.quote?.[0]?.close || []

    if (!timestamps.length || !closes.length) {
      return NextResponse.json({ sym, closes: [], dates: [] })
    }

    // Filter out any null/undefined closes (market holidays)
    const filtered = timestamps.reduce<{ closes: number[]; dates: string[] }>(
      (acc, ts, i) => {
        const c = closes[i]
        if (c != null && !isNaN(c)) {
          acc.closes.push(parseFloat(c.toFixed(2)))
          acc.dates.push(
            new Date(ts * 1000).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })
          )
        }
        return acc
      },
      { closes: [], dates: [] }
    )

    // Trim to exactly the requested number of days
    const trim = Math.min(days, filtered.closes.length)
    return NextResponse.json({
      sym,
      closes: filtered.closes.slice(-trim),
      dates:  filtered.dates.slice(-trim),
    })

  } catch (e: any) {
    console.error(`History fetch failed for ${sym}:`, e)
    return NextResponse.json(
      { error: `Failed to fetch history for ${sym}: ${e.message}` },
      { status: 502 }
    )
  }
}
