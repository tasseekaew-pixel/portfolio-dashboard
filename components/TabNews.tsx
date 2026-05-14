'use client'
import { useState, useEffect, useCallback } from 'react'
import { HOLDINGS, WATCHLIST, SCOUT } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

const ALL_TRACKED = [
  ...HOLDINGS.map(h => ({ sym: h.sym, name: h.name, group: 'holding' as const })),
  ...WATCHLIST
    .filter(w => !HOLDINGS.find(h => h.sym === w.sym))
    .map(w => ({ sym: w.sym, name: w.name, group: 'watchlist' as const })),
  ...SCOUT
    .filter(s => !HOLDINGS.find(h => h.sym === s.sym) && !WATCHLIST.find(w => w.sym === s.sym))
    .map(s => ({ sym: s.sym, name: s.name, group: 'scout' as const })),
]

interface Article {
  headline: string
  summary:  string
  url:      string
  source:   string
  datetime: number
}

interface SymNews {
  sym:      string
  name:     string
  group:    'holding' | 'watchlist' | 'scout'
  articles: Article[]
  sources:  string[]
  analysis: string
  loading:  boolean
  error:    string
  loaded:   boolean
}

const SOURCE_STYLE: Record<string, { bg: string; color: string }> = {
  'Yahoo Finance': { bg: '#e6f1fb', color: '#185fa5' },
  'CNBC':          { bg: '#fcebeb', color: '#a32d2d' },
  'MarketWatch':   { bg: '#fff3e0', color: '#8a4500' },
  'Investing.com': { bg: '#e1f5ee', color: '#0f6e56' },
  'Finnhub':       { bg: '#f3f0ff', color: '#4c3d9e' },
}

function sourceBadge(source: string) {
  const key = Object.keys(SOURCE_STYLE).find(k => source.startsWith(k)) || ''
  const style = SOURCE_STYLE[key] || { bg: '#f4f4f4', color: '#666' }
  const label = key || source.split('/')[0].trim()
  return (
    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, fontWeight:500,
      background: style.bg, color: style.color, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

function groupLabel(g: string) {
  if (g === 'holding')   return { label:'Holding',   bg:'#e1f5ee', color:'#0f6e56' }
  if (g === 'watchlist') return { label:'Watchlist', bg:'#faeeda', color:'#854f0b' }
  return                        { label:'Scout',     bg:'#eeedfe', color:'#3c3489' }
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts)
  if (diff < 3600)  return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}


async function analyzeWithClaude(sym: string, name: string, articles: Article[]): Promise<string> {
  if (!articles.length) return 'No recent news found across sources for this symbol.'
  try {
    // Call our server-side route — avoids CORS and keeps the API key secure on the server
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sym, name, articles }),
    })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    const data = await res.json()
    return data.analysis || 'Analysis unavailable.'
  } catch (e: any) {
    return `Analysis unavailable: ${e.message}`
  }
}

export default function TabNews({ quotes }: { quotes: QuoteMap }) {
  const [filter, setFilter] = useState<'all'|'holding'|'watchlist'|'scout'>('all')
  const [newsMap, setNewsMap] = useState<Record<string, SymNews>>({})

  useEffect(() => {
    const init: Record<string, SymNews> = {}
    ALL_TRACKED.forEach(t => {
      init[t.sym] = { ...t, articles: [], sources: [], analysis: '', loading: false, error: '', loaded: false }
    })
    setNewsMap(init)
  }, [])

  const fetchSym = useCallback(async (sym: string, name: string) => {
    setNewsMap(prev => ({ ...prev, [sym]: { ...prev[sym], loading: true, error: '', loaded: false } }))
    try {
      const res = await fetch(`/api/news?sym=${sym}&name=${encodeURIComponent(name)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const articles: Article[] = data.articles || []
      const sources:  string[]  = data.sources  || []

      // Show articles immediately, then start Claude analysis
      setNewsMap(prev => ({
        ...prev,
        [sym]: { ...prev[sym], articles, sources, analysis: articles.length ? 'Analyzing with Claude…' : 'No recent news found.' }
      }))

      if (articles.length) {
        const analysis = await analyzeWithClaude(sym, name, articles)
        setNewsMap(prev => ({ ...prev, [sym]: { ...prev[sym], analysis, loading: false, loaded: true } }))
      } else {
        setNewsMap(prev => ({ ...prev, [sym]: { ...prev[sym], loading: false, loaded: true } }))
      }
    } catch (e: any) {
      setNewsMap(prev => ({ ...prev, [sym]: { ...prev[sym], loading: false, error: e.message, loaded: true } }))
    }
  }, [])

  // Load all on mount, staggered
  useEffect(() => {
    if (Object.keys(newsMap).length === 0) return
    ALL_TRACKED.forEach((t, i) => {
      setTimeout(() => fetchSym(t.sym, t.name), i * 600)
    })
  }, [Object.keys(newsMap).length > 0])  // eslint-disable-line

  const displayed = ALL_TRACKED.filter(t => filter === 'all' || t.group === filter)

  return (
    <div>
      {/* Hero */}
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Live news & AI impact analysis</strong> — Headlines aggregated from{' '}
        <strong style={{ color:'var(--text)' }}>Yahoo Finance, CNBC, MarketWatch, Investing.com</strong> and Finnhub.
        Claude analyzes each stock's news from a <strong style={{ color:'var(--text)' }}>long-term investor perspective</strong>.
        Cached 30 min · Up to 10 articles per stock.
      </div>

      {/* Source legend */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text3)' }}>Sources:</span>
        {Object.entries(SOURCE_STYLE).map(([name, style]) => (
          <span key={name} style={{ fontSize:10, padding:'2px 8px', borderRadius:999, fontWeight:500,
            background: style.bg, color: style.color }}>
            {name}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text2)' }}>Show:</span>
        {([
          ['all',       `All (${ALL_TRACKED.length})`],
          ['holding',   `Holdings (${ALL_TRACKED.filter(t => t.group === 'holding').length})`],
          ['watchlist', `Watchlist (${ALL_TRACKED.filter(t => t.group === 'watchlist').length})`],
          ['scout',     `Scout (${ALL_TRACKED.filter(t => t.group === 'scout').length})`],
        ] as const).map(([f, lbl]) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)', borderRadius:999,
              background: f === filter ? '#111' : 'transparent',
              color:      f === filter ? '#fff'  : 'var(--text2)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:14 }}>
        {displayed.map(t => {
          const s  = newsMap[t.sym]
          const q  = quotes[t.sym]
          const badge = groupLabel(t.group)

          return (
            <div key={t.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, display:'flex', flexDirection:'column' }}>

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:16, fontWeight:500 }}>{t.sym}</span>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, fontWeight:500,
                      background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{t.name}</div>
                  {/* Active sources */}
                  {s?.sources?.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                      {s.sources.map(src => (
                        <span key={src}>{sourceBadge(src)}</span>
                      ))}
                    </div>
                  )}
                </div>
                {q && (
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:14, fontWeight:500 }}>${q.price.toFixed(2)}</div>
                    <div style={{ fontSize:11, color: q.pct >= 0 ? '#1d9e75' : '#d64045' }}>
                      {q.pct >= 0 ? '▲' : '▼'} {Math.abs(q.pct).toFixed(2)}% today
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analysis box */}
              <div style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px', marginBottom:12, minHeight:80 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em' }}>
                    AI impact analysis
                  </span>
                  {s?.loading && (
                    <span style={{ fontSize:10, color:'var(--text3)' }}>— working…</span>
                  )}
                </div>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.65 }}>
                  {!s || (!s.loaded && !s.analysis) ? (
                    <span style={{ color:'var(--text3)' }}>Loading…</span>
                  ) : s.error ? (
                    <span style={{ color:'#d64045' }}>Failed to load: {s.error}</span>
                  ) : (
                    s.analysis
                  )}
                </div>
              </div>

              {/* Headlines */}
              <div style={{ fontSize:10, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                Headlines ({s?.articles?.length || 0})
              </div>

              {s?.articles?.length ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1 }}>
                  {s.articles.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration:'none', display:'block', paddingBottom:10,
                        borderBottom: i < s.articles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5, fontWeight:500, marginBottom:4 }}>
                        {a.headline}
                      </div>
                      {a.summary && (
                        <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.4, marginBottom:4 }}>
                          {a.summary.slice(0, 120)}{a.summary.length > 120 ? '…' : ''}
                        </div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {sourceBadge(a.source)}
                        <span style={{ fontSize:10, color:'var(--text3)' }}>{timeAgo(a.datetime)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : s?.loaded ? (
                <div style={{ fontSize:12, color:'var(--text3)', flex:1 }}>
                  No recent news found from any source. This may be a low-coverage symbol or markets were closed.
                </div>
              ) : (
                <div style={{ fontSize:12, color:'var(--text3)', flex:1 }}>Loading articles…</div>
              )}

              {/* Refresh */}
              <button
                onClick={() => fetchSym(t.sym, t.name)}
                disabled={s?.loading}
                style={{ marginTop:14, fontSize:11, padding:'5px 10px', border:'1px solid var(--border)',
                  borderRadius:6, background:'transparent', color:'var(--text2)',
                  cursor: s?.loading ? 'not-allowed' : 'pointer', alignSelf:'flex-start', opacity: s?.loading ? 0.5 : 1 }}>
                {s?.loading ? 'Refreshing…' : '⟳ Refresh'}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5, marginTop:'1.5rem' }}>
        News aggregated from Yahoo Finance, CNBC, MarketWatch, Investing.com, and Finnhub. Bloomberg requires a paid subscription and is not included.
        AI analysis by Claude is for informational purposes only — not financial advice. Long-term investors should treat news as context, not a trigger to act.
      </div>
    </div>
  )
}
