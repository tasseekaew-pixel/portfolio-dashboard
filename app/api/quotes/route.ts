import { NextResponse } from 'next/server'
import { ALL_SYMBOLS } from '@/lib/data'

const KEY = process.env.FINNHUB_API_KEY

export const revalidate = 300 // cache the whole route for 5 min

export async function GET() {
  if (!KEY || KEY === 'your_finnhub_api_key_here') {
    return NextResponse.json(
      { error: 'FINNHUB_API_KEY not configured in environment variables' },
      { status: 500 }
    )
  }

  const results: Record<string, any> = {}
  const errors: string[] = []

  // Fetch all symbols — Finnhub free tier allows 60 calls/min
  await Promise.all(
    ALL_SYMBOLS.map(async (sym) => {
      try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEY}`
        const res = await fetch(url)
        if (!res.ok) {
          errors.push(`${sym}: HTTP ${res.status}`)
          return
        }
        const d = await res.json()
        // d.c = current price, d.pc = previous close
        if (d && typeof d.c === 'number' && d.c > 0) {
          results[sym] = {
            price:  d.c,
            prev:   d.pc,
            open:   d.o,
            high:   d.h,
            low:    d.l,
            pct:    d.pc > 0 ? (d.c - d.pc) / d.pc * 100 : 0,
            change: d.c - d.pc,
          }
        } else {
          errors.push(`${sym}: invalid data`)
        }
      } catch (e: any) {
        errors.push(`${sym}: ${e.message}`)
      }
    })
  )

  return NextResponse.json({
    quotes: results,
    fetchedAt: new Date().toISOString(),
    symbolCount: ALL_SYMBOLS.length,
    successCount: Object.keys(results).length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
