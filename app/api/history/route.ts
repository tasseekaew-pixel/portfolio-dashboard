import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.FINNHUB_API_KEY

export const revalidate = 3600 // cache 1 hour

export async function GET(req: NextRequest) {
  if (!KEY || KEY === 'your_finnhub_api_key_here') {
    return NextResponse.json(
      { error: 'FINNHUB_API_KEY not configured in environment variables' },
      { status: 500 }
    )
  }

  const sym  = req.nextUrl.searchParams.get('sym')
  const days = parseInt(req.nextUrl.searchParams.get('days') || '60')

  if (!sym) {
    return NextResponse.json({ error: 'sym parameter is required' }, { status: 400 })
  }

  const to   = Math.floor(Date.now() / 1000)
  const from = to - days * 24 * 60 * 60

  try {
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${KEY}`
    const res = await fetch(url)

    if (!res.ok) {
      return NextResponse.json(
        { error: `Finnhub returned HTTP ${res.status} for ${sym}` },
        { status: 502 }
      )
    }

    const d = await res.json()

    // d.s === 'ok' means Finnhub has data; 'no_data' means no trading data for range
    if (!d || d.s !== 'ok' || !Array.isArray(d.c) || d.c.length === 0) {
      return NextResponse.json({ sym, closes: [], dates: [] })
    }

    const dates = (d.t as number[]).map((ts) => {
      const dt = new Date(ts * 1000)
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })

    return NextResponse.json({ sym, closes: d.c, dates })

  } catch (e: any) {
    console.error(`History fetch failed for ${sym}:`, e)
    return NextResponse.json(
      { error: `Failed to fetch history for ${sym}: ${e.message}` },
      { status: 502 }
    )
  }
}
