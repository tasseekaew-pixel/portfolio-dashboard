// app/api/history/route.ts
import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.FINNHUB_API_KEY

export async function GET(req: NextRequest) {
  if (!KEY || KEY === 'your_finnhub_api_key_here') {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })
  }

  const sym = req.nextUrl.searchParams.get('sym')
  const days = parseInt(req.nextUrl.searchParams.get('days') || '60')
  if (!sym) return NextResponse.json({ error: 'sym required' }, { status: 400 })

  const to = Math.floor(Date.now() / 1000)
  const from = to - days * 24 * 60 * 60

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${KEY}`,
      { next: { revalidate: 3600 } } // cache 1hr — history doesn't change
    )
    if (!res.ok) return NextResponse.json({ error: 'Finnhub error' }, { status: 502 })
    const d = await res.json()

    if (d.s !== 'ok' || !d.c) {
      return NextResponse.json({ sym, closes: [], dates: [] })
    }

    return NextResponse.json({
      sym,
      closes: d.c,         // close prices array
      dates:  d.t.map((ts: number) => {
        const dt = new Date(ts * 1000)
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
