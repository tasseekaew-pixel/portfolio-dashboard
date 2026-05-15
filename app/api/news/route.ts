import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 900 // cache 15 min — more frequent than before

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
      const r = block.match(
        new RegExp(`<${tag}(?:[^>]*)>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 's')
      )
      return r?.[1]?.trim() || ''
    }
    const title   = get('title').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim()
    const link    = get('link') || get('guid')
    const pubDate = get('pubDate') || get('published') || get('dc:date')
    const desc    = get('description').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').slice(0,180).trim()
    if (title && link) items.push({
      headline: title,
      summary:  desc,
      url:      link.trim(),
      source,
      datetime: pubDate ? Math.floor(new Date(pubDate).getTime()/1000) : Math.floor(Date.now()/1000),
    })
  }
  return items
}

async function rss(url: string, source: string): Promise<Article[]> {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return []
    return parseRSS(await res.text(), source)
  } catch { return [] }
}

function dedup(articles: Article[]): Article[] {
  const seen = new Set<string>()
  return articles.filter(a => {
    const key = a.headline.slice(0,55).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

function filterRelevant(articles: Article[], sym: string, name: string): Article[] {
  const kw = [sym.toLowerCase(), ...name.toLowerCase().split(' ').filter(w=>w.length>3)]
  return articles.filter(a => kw.some(k => (a.headline+' '+a.summary).toLowerCase().includes(k)))
}

export async function GET(req: NextRequest) {
  const sym  = req.nextUrl.searchParams.get('sym')  || ''
  const name = req.nextUrl.searchParams.get('name') || sym
  if (!sym) return NextResponse.json({ error: 'sym required' }, { status: 400 })

  // Fetch all sources in parallel — zero API keys needed
  const [yahoo, google, seekingAlpha, marketWatch] = await Promise.all([
    rss(`https://finance.yahoo.com/rss/headline?s=${sym}`, 'Yahoo Finance'),
    rss(`https://news.google.com/rss/search?q=${encodeURIComponent(sym+' stock '+name)}&hl=en-US&gl=US&ceid=US:en`, 'Google News'),
    rss(`https://seekingalpha.com/api/sa/combined/${sym}.xml`, 'Seeking Alpha'),
    rss('https://feeds.marketwatch.com/marketwatch/topstories/', 'MarketWatch'),
  ])

  const mwFiltered = filterRelevant(marketWatch, sym, name)

  const all = dedup([...yahoo, ...google, ...seekingAlpha, ...mwFiltered])
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 8)

  return NextResponse.json({
    sym,
    articles: all,
    sources: [...new Set(all.map(a => a.source))],
  })
}
