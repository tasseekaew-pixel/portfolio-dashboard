'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

const WL_KEY = 'portfolio_watchlist_v1'
const NEWS_EXTRA_KEY = 'news_extra_syms_v1'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2)+'%' }

function timeAgo(ts: number) {
  const d = Math.floor(Date.now()/1000 - ts)
  if (d < 3600)  return Math.floor(d/60)+'m ago'
  if (d < 86400) return Math.floor(d/3600)+'h ago'
  return Math.floor(d/86400)+'d ago'
}

const SOURCE_COLORS: Record<string,{bg:string;color:string}> = {
  'Yahoo Finance': { bg:'#e6f1fb', color:'#185fa5' },
  'Google News':   { bg:'#e1f5ee', color:'#0f6e56' },
  'Seeking Alpha': { bg:'#faeeda', color:'#854f0b' },
  'MarketWatch':   { bg:'#fcebeb', color:'#a32d2d' },
}

function SourceBadge({ source }: { source: string }) {
  const key = Object.keys(SOURCE_COLORS).find(k => source.startsWith(k)) || ''
  const s   = SOURCE_COLORS[key] || { bg:'#f4f4f4', color:'#666' }
  return (
    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, fontWeight:500,
      background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {key || source}
    </span>
  )
}

interface Article {
  headline: string
  summary:  string
  url:      string
  source:   string
  datetime: number
}

interface StockNews {
  sym:      string
  name:     string
  group:    string
  articles: Article[]
  analysis: string
  loading:  boolean
  loaded:   boolean
  error:    string
}

function loadExtra(): string[] {
  try { const s=localStorage.getItem(NEWS_EXTRA_KEY); if(s) return JSON.parse(s) } catch {}
  return []
}
function saveExtra(syms: string[]) {
  try { localStorage.setItem(NEWS_EXTRA_KEY, JSON.stringify(syms)) } catch {}
}
function loadWatchlist(): {sym:string;name:string}[] {
  try { const s=localStorage.getItem(WL_KEY); if(s) return JSON.parse(s) } catch {}
  return []
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabNews({ quotes }: { quotes: QuoteMap }) {
  const [newsMap,   setNewsMap  ] = useState<Record<string,StockNews>>({})
  const [filter,    setFilter   ] = useState('all')
  const [searchSym, setSearchSym] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [extraSyms, setExtraSyms] = useState<string[]>([])
  const [refreshing,setRefreshing] = useState(false)
  const [lastRefresh,setLastRefresh] = useState('')
  const initialized = useRef(false)

  // Build tracked list: holdings + watchlist + extra user-added
  const buildTracked = useCallback(() => {
    const wl    = loadWatchlist()
    const extra = loadExtra()
    const tracked: { sym:string; name:string; group:string }[] = []
    const seen  = new Set<string>()

    HOLDINGS.forEach(h => {
      if (!seen.has(h.sym)) { tracked.push({sym:h.sym,name:h.name,group:'holding'}); seen.add(h.sym) }
    })
    wl.forEach((w:any) => {
      if (!seen.has(w.sym)) { tracked.push({sym:w.sym,name:w.name,group:'watchlist'}); seen.add(w.sym) }
    })
    extra.forEach(sym => {
      if (!seen.has(sym)) { tracked.push({sym,name:sym,group:'added'}); seen.add(sym) }
    })
    return tracked
  }, [])

  const fetchNewsForSyms = useCallback(async (tracked: {sym:string;name:string;group:string}[], force=false) => {
    // Initialize state for any new symbols
    setNewsMap(prev => {
      const next = { ...prev }
      tracked.forEach(t => {
        if (!next[t.sym] || force) {
          next[t.sym] = {
            sym:t.sym, name:t.name, group:t.group,
            articles:[], analysis:'', loading:true, loaded:false, error:''
          }
        }
      })
      return next
    })

    // Fetch news for all symbols in parallel
    const newsResults = await Promise.all(
      tracked.map(async t => {
        try {
          const res  = await fetch(`/api/news?sym=${t.sym}&name=${encodeURIComponent(t.name)}`, { cache: force?'no-store':'default' })
          const data = await res.json()
          return { sym:t.sym, articles:(data.articles||[]) as Article[], error:'' }
        } catch(e:any) {
          return { sym:t.sym, articles:[] as Article[], error:e.message }
        }
      })
    )

    // Update articles immediately so user sees headlines right away
    setNewsMap(prev => {
      const next = { ...prev }
      newsResults.forEach(r => {
        if (next[r.sym]) {
          next[r.sym] = { ...next[r.sym], articles:r.articles, error:r.error,
            analysis: r.articles.length ? 'Analyzing with AI…' : 'No recent news found.' }
        }
      })
      return next
    })

    // Single batch Gemini call for all stocks that have news
    const withNews = newsResults.filter(r => r.articles.length > 0)
    if (withNews.length > 0) {
      try {
        const payload = {
          stocks: withNews.map(r => ({
            sym:      r.sym,
            name:     tracked.find(t=>t.sym===r.sym)?.name || r.sym,
            articles: r.articles.slice(0,5),
          }))
        }
        const res  = await fetch('/api/analyze', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        const results: Record<string,string> = data.results || {}

        setNewsMap(prev => {
          const next = { ...prev }
          newsResults.forEach(r => {
            if (next[r.sym]) {
              next[r.sym] = {
                ...next[r.sym],
                analysis: results[r.sym] || (r.articles.length ? 'Analysis unavailable.' : 'No recent news found.'),
                loading:  false,
                loaded:   true,
              }
            }
          })
          return next
        })
      } catch(e:any) {
        setNewsMap(prev => {
          const next = { ...prev }
          newsResults.forEach(r => {
            if (next[r.sym]) {
              next[r.sym] = {
                ...next[r.sym],
                analysis: r.articles.length ? 'AI analysis temporarily unavailable.' : 'No recent news found.',
                loading:false, loaded:true,
              }
            }
          })
          return next
        })
      }
    } else {
      // No news found for any symbol
      setNewsMap(prev => {
        const next = { ...prev }
        newsResults.forEach(r => {
          if (next[r.sym]) {
            next[r.sym] = { ...next[r.sym], loading:false, loaded:true }
          }
        })
        return next
      })
    }

    setLastRefresh(new Date().toLocaleTimeString())
    setRefreshing(false)
  }, [])

  // Initial load
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const extra = loadExtra()
    setExtraSyms(extra)
    const tracked = buildTracked()
    fetchNewsForSyms(tracked)
  }, [])

  // Refresh all
  const handleRefreshAll = useCallback(() => {
    setRefreshing(true)
    const tracked = buildTracked()
    fetchNewsForSyms(tracked, true)
  }, [buildTracked, fetchNewsForSyms])

  // Add a stock by ticker
  const handleAddStock = useCallback(async () => {
    const sym = searchSym.trim().toUpperCase()
    if (!sym) return
    if (newsMap[sym]) { setSearchErr('Already tracking '+sym); return }

    setSearching(true)
    setSearchErr('')

    try {
      // Look up company name via profile API
      let name = sym
      try {
        const p = await fetch(`/api/profile?sym=${sym}`)
        const d = await p.json()
        if (d.name) name = d.name
      } catch {}

      const updated = [...extraSyms, sym]
      setExtraSyms(updated)
      saveExtra(updated)
      setSearchSym('')

      const newTracked = [{ sym, name, group:'added' }]
      await fetchNewsForSyms(newTracked)
    } catch(e:any) {
      setSearchErr(e.message)
    } finally {
      setSearching(false)
    }
  }, [searchSym, newsMap, extraSyms, fetchNewsForSyms])

  // Remove an added stock
  const handleRemove = useCallback((sym: string) => {
    const updated = extraSyms.filter(s => s !== sym)
    setExtraSyms(updated)
    saveExtra(updated)
    setNewsMap(prev => {
      const next = { ...prev }
      delete next[sym]
      return next
    })
  }, [extraSyms])

  const allStocks = Object.values(newsMap)
  const groups = ['all', 'holding', 'watchlist', 'added']
  const groupCounts = groups.reduce((acc, g) => {
    acc[g] = g === 'all' ? allStocks.length : allStocks.filter(s => s.group === g).length
    return acc
  }, {} as Record<string,number>)

  const displayed = filter === 'all' ? allStocks : allStocks.filter(s => s.group === filter)

  const anyLoading = allStocks.some(s => s.loading)

  return (
    <div>
      {/* Hero */}
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'12px 16px',
        marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Live news & AI analysis</strong> — Tracks your
        holdings, watchlist, and any stock you add. News from{' '}
        <strong style={{ color:'var(--text)' }}>Yahoo Finance, Google News, Seeking Alpha & MarketWatch</strong>{' '}
        — no API keys, no quotas. AI analysis by <strong style={{ color:'var(--text)' }}>Gemini 2.5 Flash</strong>,
        all stocks analyzed in one batch call. Refreshes every 15 minutes.
        {lastRefresh && <span style={{ color:'var(--text3)', fontSize:11 }}> · Last updated {lastRefresh}</span>}
      </div>

      {/* Controls row */}
      <div style={{ display:'flex', gap:10, marginBottom:'1.25rem', flexWrap:'wrap', alignItems:'center' }}>
        {/* Add stock search */}
        <div style={{ display:'flex', gap:6, flex:1, minWidth:220 }}>
          <input
            value={searchSym}
            onChange={e => { setSearchSym(e.target.value.toUpperCase()); setSearchErr('') }}
            onKeyDown={e => e.key==='Enter' && handleAddStock()}
            placeholder="Add any stock — e.g. AAPL, TSLA"
            style={{ flex:1, padding:'7px 12px', border:'1px solid var(--border)',
              borderRadius:8, fontSize:13, background:'var(--bg)', color:'var(--text)' }}
          />
          <button onClick={handleAddStock} disabled={searching || !searchSym}
            style={{ padding:'7px 14px', border:'none', borderRadius:8,
              background:'#1d9e75', color:'#fff', fontSize:13, fontWeight:500,
              cursor: searching||!searchSym ? 'not-allowed' : 'pointer',
              opacity: searching||!searchSym ? 0.6 : 1 }}>
            {searching ? '…' : '+ Track'}
          </button>
        </div>

        {/* Refresh button */}
        <button onClick={handleRefreshAll} disabled={refreshing || anyLoading}
          style={{ padding:'7px 14px', border:'1px solid var(--border)', borderRadius:8,
            background:'transparent', color:'var(--text2)', fontSize:13,
            cursor: refreshing||anyLoading ? 'not-allowed' : 'pointer',
            opacity: refreshing||anyLoading ? 0.6 : 1 }}>
          {refreshing || anyLoading ? '⟳ Fetching…' : '⟳ Refresh all'}
        </button>
      </div>

      {searchErr && (
        <div style={{ fontSize:12, color:'#d64045', marginBottom:10 }}>⚠ {searchErr}</div>
      )}

      {/* Filter chips */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text2)' }}>Show:</span>
        {groups.filter(g => g==='all' || groupCounts[g]>0).map(g => (
          <button key={g} onClick={() => setFilter(g)}
            style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)',
              borderRadius:999, cursor:'pointer',
              background: g===filter ? '#111' : 'transparent',
              color:      g===filter ? '#fff'  : 'var(--text2)' }}>
            {g==='all'      ? `All (${groupCounts.all})`
            : g==='holding' ? `Holdings (${groupCounts.holding})`
            : g==='watchlist'? `Watchlist (${groupCounts.watchlist})`
            : `Added (${groupCounts.added})`}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:14 }}>
        {displayed.map(s => {
          const q = quotes[s.sym]
          const badgeStyle =
            s.group==='holding'   ? { bg:'#e1f5ee', color:'#0f6e56', label:'Holding'   } :
            s.group==='watchlist' ? { bg:'#faeeda', color:'#854f0b', label:'Watchlist' } :
                                    { bg:'#eeedfe', color:'#3c3489', label:'Added'      }

          return (
            <div key={s.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:16, display:'flex', flexDirection:'column' }}>

              {/* Card header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:16, fontWeight:500 }}>{s.sym}</span>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, fontWeight:500,
                      background:badgeStyle.bg, color:badgeStyle.color }}>
                      {badgeStyle.label}
                    </span>
                    {s.group==='added' && (
                      <button onClick={() => handleRemove(s.sym)}
                        title="Stop tracking"
                        style={{ fontSize:12, background:'none', border:'none',
                          color:'var(--text3)', cursor:'pointer', padding:'0 2px' }}>✕</button>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{s.name}</div>
                </div>
                {q && (
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:14, fontWeight:500 }}>{fmt(q.price)}</div>
                    <div style={{ fontSize:11, color: q.pct>=0?'#1d9e75':'#d64045' }}>
                      {q.pct>=0?'▲':'▼'} {Math.abs(q.pct).toFixed(2)}% today
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              <div style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px',
                marginBottom:12, minHeight:72 }}>
                <div style={{ fontSize:10, fontWeight:500, color:'var(--text3)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>AI impact analysis</span>
                  {s.loading && <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400 }}>working…</span>}
                </div>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.65 }}>
                  {!s.loaded && !s.analysis
                    ? <span style={{ color:'var(--text3)' }}>Loading…</span>
                    : s.error
                    ? <span style={{ color:'#d64045' }}>Error: {s.error}</span>
                    : s.analysis}
                </div>
              </div>

              {/* Headlines */}
              <div style={{ fontSize:10, fontWeight:500, color:'var(--text3)',
                textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                Headlines ({s.articles.length})
              </div>

              {s.articles.length ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1 }}>
                  {s.articles.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration:'none', display:'block', paddingBottom:10,
                        borderBottom: i<s.articles.length-1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize:12, color:'var(--text)', fontWeight:500,
                        lineHeight:1.5, marginBottom:4 }}>
                        {a.headline}
                      </div>
                      {a.summary && (
                        <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.4, marginBottom:4 }}>
                          {a.summary}
                        </div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <SourceBadge source={a.source} />
                        <span style={{ fontSize:10, color:'var(--text3)' }}>{timeAgo(a.datetime)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : s.loaded ? (
                <div style={{ fontSize:12, color:'var(--text3)', flex:1 }}>
                  No recent news found from any source for {s.sym}.
                </div>
              ) : (
                <div style={{ fontSize:12, color:'var(--text3)', flex:1 }}>Loading articles…</div>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {displayed.length === 0 && (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text3)',
            fontSize:13, gridColumn:'1/-1' }}>
            No stocks in this group yet.
          </div>
        )}
      </div>

      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)',
        paddingTop:10, lineHeight:1.5, marginTop:'1.5rem' }}>
        News from Yahoo Finance, Google News, Seeking Alpha and MarketWatch — no API keys, no quotas, updates every 15 minutes.
        AI analysis by Gemini 2.5 Flash (free tier, 1,500 req/day) — all stocks analyzed in a single batch call to minimize usage.
        For informational purposes only. Not financial advice.
      </div>
    </div>
  )
}
