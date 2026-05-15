import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.FINNHUB_API_KEY

export async function GET(req: NextRequest) {
  const sym = req.nextUrl.searchParams.get('sym')
  if (!sym) return NextResponse.json({ error: 'sym required' }, { status: 400 })

  try {
    const [profileRes, metricRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${KEY}`),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${KEY}`),
    ])

    const profile = profileRes.ok ? await profileRes.json() : {}
    const metric  = metricRes.ok  ? await metricRes.json()  : {}
    const m = metric?.metric || {}

    return NextResponse.json({
      sym,
      name:          profile.name             || '',
      sector:        profile.finnhubIndustry  || '',
      analystTarget: m.targetMeanPrice        || null,
      revGrowth:     m.revenueGrowthAnnual    || m.revenueGrowth3Y || null,
      pe:            m.peNormalizedAnnual      || m.peTTM          || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
