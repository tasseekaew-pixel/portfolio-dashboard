import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1800

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
}

interface Article {
  headline: string
  summary:  string
  url:      string
  source:   string
  datetime: number
}

function parseRSS(xml: string, source: string): Article[] {
  const items: Article[] = []
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
  for (const m of matches) {
    const block = m[1]
    const get = (tag: string) => {
      const r = block.match(new RegExp(`<${tag}(?:[^>]*)>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'))
      return r?.[1]?.trim() || ''
    }
    const title   = get('title')
    const link    = get('link') || get('guid')
    const pubDate = get('pubDate') || get('published') || get('dc:date')
    const desc    = get('description') || get('summary') || get('content')

    if (!title) continue
    items.push({
      headline: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim(),
      summary:  desc.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').slice(0,200).trim(),
      url:      link.trim(),
      source,
      datetime: pubDate ? Math.floor(new Date(pubDate).getTime()/1000) : Math.floor(Date.now()/1000),
    })
  }
  return items
}

async function fetchRSS(url: string, source: string): Promise<Article[]> {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml, source)
  } catch { return [] }
}

// Yahoo Finance per-ticker RSS — completely free, no key, reliable
async function fetchYahoo(sym: string): Promise<Article[]> {
  return fetchRSS(`https://finance.yahoo.com/rss/headline?s=${sym}`, 'Yahoo Finance')
}

// Google News RSS search — free, no key, great coverage
async function fetchGoogleNews(sym: string, name: string): Promise<Article[]> {
  const q = encodeURIComponent(`${sym} stock ${name}`)
  return fetchRSS(
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
    'Google News'
  )
}

// Seeking Alpha RSS — free public feed
async function fetchSeekingAlpha(sym: string): Promise<Article[]> {
  return fetchRSS(
    `https://seekingalpha.com/api/sa/combined/${sym}.xml`,
    'Seeking Alpha'
  )
}

// MarketWatch top stories — free general feed, filter for relevance
async function fetchMarketWatch(sym: string, name: string): Promise<Article[]> {
  const all = await fetchRSS('https://feeds.marketwatch.com/marketwatch/topstories/', 'MarketWatch')
  const kw  = [sym.toLowerCase(), ...name.toLowerCase().split(' ').filter(w => w.length > 3)]
  return all.filter(a => kw.some(k => (a.headline + a.summary).toLowerCase().includes(k)))
}

function dedup(articles: Article[]): Article[] {
  const seen = new Set<string>()
  return articles.filter(a => {
    const key = a.headline.slice(0, 50).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(req: NextRequest) {
  const sym  = req.nextUrl.searchParams.get('sym')  || ''
  const name = req.nextUrl.searchParams.get('name') || sym
  if (!sym) return NextResponse.json({ error: 'sym required' }, { status: 400 })

  // Fetch all sources in parallel — no API keys needed
  const [yahoo, google, seekingAlpha, marketWatch] = await Promise.all([
    fetchYahoo(sym),
    fetchGoogleNews(sym, name),
    fetchSeekingAlpha(sym),
    fetchMarketWatch(sym, name),
  ])

  const all = dedup([...yahoo, ...google, ...seekingAlpha, ...marketWatch])
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 10)

  const sources = [...new Set(all.map(a => a.source))]
  return NextResponse.json({ sym, articles: all, sources })
}
