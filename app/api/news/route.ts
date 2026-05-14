import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1800 // cache 30 min

const FINNHUB_KEY = process.env.FINNHUB_API_KEY

// Parse RSS XML — works without any npm package
function parseRSS(xml: string, source: string, sym: string): RawArticle[] {
  const items: RawArticle[] = []
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
  for (const match of itemMatches) {
    const item = match[1]
    const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || ''
    const link    = (item.match(/<link>(.*?)<\/link>/) || item.match(/<guid[^>]*>(.*?)<\/guid>/))?.[1] || ''
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || ''
    const desc    = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || ''
    if (title) {
      items.push({
        headline: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim(),
        summary:  desc.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').slice(0,200).trim(),
        url:      link.trim(),
        source,
        datetime: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
        sym,
      })
    }
  }
  return items
}

interface RawArticle {
  headline: string
  summary:  string
  url:      string
  source:   string
  datetime: number
  sym:      string
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
}

async function fetchRSS(url: string, source: string, sym: string): Promise<RawArticle[]> {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml, source, sym)
  } catch {
    return []
  }
}

async function fetchFinnhub(sym: string): Promise<RawArticle[]> {
  if (!FINNHUB_KEY || FINNHUB_KEY === 'your_finnhub_api_key_here') return []
  try {
    const to   = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const res  = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.slice(0, 5).map((a: any) => ({
      headline: a.headline || '',
      summary:  a.summary  || '',
      url:      a.url      || '',
      source:   'Finnhub / ' + (a.source || 'News'),
      datetime: a.datetime || Math.floor(Date.now() / 1000),
      sym,
    }))
  } catch {
    return []
  }
}

async function fetchYahoo(sym: string): Promise<RawArticle[]> {
  return fetchRSS(
    `https://finance.yahoo.com/rss/headline?s=${sym}`,
    'Yahoo Finance',
    sym
  )
}

async function fetchCNBC(sym: string, name: string): Promise<RawArticle[]> {
  // CNBC search RSS — search by ticker AND company name for better coverage
  const query = encodeURIComponent(`${sym} ${name}`)
  return fetchRSS(
    `https://search.cnbc.com/rs/search/combinedcombined/articletype/rss.html?query=${query}&partnerId=wrss01&id=100003114`,
    'CNBC',
    sym
  )
}

async function fetchMarketWatch(sym: string): Promise<RawArticle[]> {
  // MarketWatch top stories — general market news filtered by relevance
  return fetchRSS(
    `https://feeds.marketwatch.com/marketwatch/topstories/`,
    'MarketWatch',
    sym
  )
}

async function fetchInvesting(sym: string): Promise<RawArticle[]> {
  return fetchRSS(
    `https://www.investing.com/rss/news_25.rss`,
    'Investing.com',
    sym
  )
}

function filterRelevant(articles: RawArticle[], sym: string, name: string): RawArticle[] {
  const keywords = [sym.toLowerCase(), name.toLowerCase(), ...name.toLowerCase().split(' ')]
  return articles.filter(a => {
    const text = (a.headline + ' ' + a.summary).toLowerCase()
    return keywords.some(k => k.length > 2 && text.includes(k))
  })
}

function dedup(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>()
  return articles.filter(a => {
    const key = a.headline.slice(0, 60).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(req: NextRequest) {
  const sym  = req.nextUrl.searchParams.get('sym') || ''
  const name = req.nextUrl.searchParams.get('name') || sym

  if (!sym) {
    return NextResponse.json({ error: 'sym required' }, { status: 400 })
  }

  // Fetch from all sources in parallel
  const [finnhub, yahoo, cnbc, mw, investing] = await Promise.all([
    fetchFinnhub(sym),
    fetchYahoo(sym),
    fetchCNBC(sym, name),
    fetchMarketWatch(sym),
    fetchInvesting(sym),
  ])

  // Yahoo/Finnhub are already ticker-specific — use as-is
  // CNBC/MarketWatch/Investing are general — filter for relevance
  const cnbcFiltered      = filterRelevant(cnbc, sym, name)
  const mwFiltered        = filterRelevant(mw, sym, name)
  const investingFiltered = filterRelevant(investing, sym, name)

  // Merge all, deduplicate, sort newest first, take top 10
  const all = dedup([
    ...finnhub,
    ...yahoo,
    ...cnbcFiltered,
    ...mwFiltered,
    ...investingFiltered,
  ]).sort((a, b) => b.datetime - a.datetime).slice(0, 10)

  // Track which sources contributed
  const sources = [...new Set(all.map(a => a.source.split(' / ')[0]))]

  return NextResponse.json({ sym, articles: all, sources })
}
