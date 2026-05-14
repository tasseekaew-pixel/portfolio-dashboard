// app/api/quotes/route.ts
import { NextResponse } from 'next/server'
import { ALL_SYMBOLS } from '@/lib/data'

const KEY = process.env.FINNHUB_API_KEY

export async function GET() {
  if (!KEY || KEY === 'your_finnhub_api_key_here') {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 })
  }

  const results: Record<string, any> = {}

  // Finnhub free tier: 60 calls/min — fetch in parallel with small batching
  const chunks: string[][] = []
  for (let i = 0; i < ALL_SYMBOLS.length; i += 10) {
    chunks.push(ALL_SYMBOLS.slice(i, i + 10))
  }

  for (const chunk of chunks) {
    const fetches = chunk.map(async (sym) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEY}`,
          { next: { revalidate: 300 } } // cache 5 min on Vercel edge
        )
        if (!res.ok) return
        const d = await res.json()
        // Finnhub quote fields: c=current, pc=prev close, o=open, h=high, l=low
        if (d && d.c > 0) {
          results[sym] = {
            price: d.c,
            prev:  d.pc,
            open:  d.o,
            high:  d.h,
            low:   d.l,
            pct:   d.pc > 0 ? ((d.c - d.pc) / d.pc * 100) : 0,
            change: d.c - d.pc,
          }
        }
      } catch (e) {
        console.error(`Failed to fetch ${sym}:`, e)
      }
    })
    await Promise.all(fetches)
    // Small delay between chunks to stay well within rate limit
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return NextResponse.json({
    quotes: results,
    fetchedAt: new Date().toISOString(),
    symbols: ALL_SYMBOLS.length,
  })
}
