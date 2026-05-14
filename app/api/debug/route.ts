import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.FINNHUB_API_KEY

  // Test a single Finnhub call with whatever key is present
  let finnhubStatus = 'not tested'
  let finnhubResponse: any = null

  if (key && key !== 'your_finnhub_api_key_here') {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${key}`
      )
      finnhubStatus = `HTTP ${res.status}`
      finnhubResponse = await res.json()
    } catch (e: any) {
      finnhubStatus = `fetch threw: ${e.message}`
    }
  }

  return NextResponse.json({
    // Show first 4 and last 4 chars of key so you can verify it without exposing it
    keyPresent:   !!key,
    keyLength:    key?.length ?? 0,
    keyPreview:   key ? `${key.slice(0, 4)}...${key.slice(-4)}` : 'NOT SET',
    keyIsDefault: key === 'your_finnhub_api_key_here',
    finnhubStatus,
    finnhubResponse,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
}
