'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

const WL_KEY         = 'portfolio_watchlist_v1'
const NEWS_EXTRA_KEY = 'news_extra_syms_v1'

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}
function timeAgo(ts: number) {
  const d = Math.floor(Date.now()/1000 - ts)
  if (d < 60)    return 'just now'
  if (d < 3600)  return Math.floor(d/60)+'m ago'
  if (d < 86400) return Math.floor(d/3600)+'h ago'
  return Math.floor(d/86400)+'d ago'
}
function cleanUrl(url: string) {
  try { return new URL(url).hostname.replace('www.','') } catch { return '' }
}

const SRC_COLORS: Record<string,{bg:string;fg:string}> = {
  'Yahoo Finance': {bg:'#e6f1fb',fg:'#185fa5'},
  'Google News':   {bg:'#e8f5e9',fg:'#2e7d32'},
  'Seeking Alpha': {bg:'#fff3e0',fg:'#e65100'},
  'MarketWatch':   {bg:'#fce4ec',fg:'#c62828'},
}
function srcBadge(source: string) {
  const key = Object.keys(SRC_COLORS).find(k => source.startsWith(k)) || ''
  const s   = SRC_COLORS[key] || {bg:'#f4f4f4',fg:'#555'}
  return { bg: s.bg, fg: s.fg, label: key || source.split('/')[0].trim() }
}

interface Article { headline:string; summary:string; url:string; source:string; datetime:number }
interface SymNews  { sym:string; name:string; group:string; articles:Article[]; analysis:string; loading:boolean; loaded:boolean; error:string }

function loadExtra():string[]                     { try{const s=localStorage.getItem(NEWS_EXTRA_KEY);if(s)return JSON.parse(s)}catch{} return [] }
function saveExtra(v:string[])                    { try{localStorage.setItem(NEWS_EXTRA_KEY,JSON.stringify(v))}catch{} }
function loadWatchlist():{sym:string;name:string}[]{ try{const s=localStorage.getItem(WL_KEY);if(s)return JSON.parse(s)}catch{} return [] }

// ── Article card — no raw URLs visible ──────────────────────────────────────
function ArticleCard({ a, index, total }: { a:Article; index:number; total:number }) {
  const badge = srcBadge(a.source)
  const domain = cleanUrl(a.url)
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer"
      style={{ display:'block', textDecoration:'none', padding:'10px 0',
        borderBottom: index < total-1 ? '1px solid var(--border)' : 'none' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        {/* Source color strip */}
        <div style={{ width:3, borderRadius:2, background:badge.fg, flexShrink:0, alignSelf:'stretch', minHeight:40 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', lineHeight:1.5, marginBottom:4 }}>
            {a.headline}
          </div>
          {a.summary && (
            <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, marginBottom:5 }}>
              {a.summary}
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, fontWeight:500, padding:'1px 8px', borderRadius:999,
              background:badge.bg, color:badge.fg }}>{badge.label}</span>
            {domain && (
              <span style={{ fontSize:11, color:'var(--text3)' }}>{domain}</span>
            )}
            <span style={{ fontSize:11, color:'var(--text3)' }}>{timeAgo(a.datetime)}</span>
            <span style={{ fontSize:11, color:'#378add', marginLeft:'auto' }}>Read →</span>
          </div>
        </div>
      </div>
    </a>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabNews({ quotes }: { quotes: QuoteMap }) {
  const [newsMap,    setNewsMap   ] = useState<Record<string,SymNews>>({})
  const [filter,     setFilter    ] = useState('all')
  const [searchSym,  setSearchSym ] = useState('')
  const [searching,  setSearching ] = useState(false)
  const [searchErr,  setSearchErr ] = useState('')
  const [extraSyms,  setExtraSyms ] = useState<string[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh,setLastRefresh]= useState('')
  const initialized = useRef(false)

  const buildTracked = useCallback(() => {
    const wl    = loadWatchlist()
    const extra = loadExtra()
    const out: {sym:string;name:string;group:string}[] = []
    const seen  = new Set<string>()
    HOLDINGS.forEach(h => { if(!seen.has(h.sym)){out.push({sym:h.sym,name:h.name,group:'holding'});seen.add(h.sym)} })
    wl.forEach((w:any) => { if(!seen.has(w.sym)){out.push({sym:w.sym,name:w.name,group:'watchlist'});seen.add(w.sym)} })
    extra.forEach(sym => { if(!seen.has(sym)){out.push({sym,name:sym,group:'added'});seen.add(sym)} })
    return out
  }, [])

  const fetchAll = useCallback(async (tracked:{sym:string;name:string;group:string}[], force=false) => {
    // Mark all as loading
    setNewsMap(prev => {
      const next = {...prev}
      tracked.forEach(t => {
        next[t.sym] = { sym:t.sym, name:t.name, group:t.group,
          articles:[], analysis:'', loading:true, loaded:false, error:'' }
      })
      return next
    })

    // Fetch news for all in parallel
    const newsResults = await Promise.all(tracked.map(async t => {
      try {
        const r = await fetch(`/api/news?sym=${t.sym}&name=${encodeURIComponent(t.name)}`,
          { cache: force ? 'no-store' : 'default' })
        const d = await r.json()
        return { sym:t.sym, articles:(d.articles||[]) as Article[], error:'' }
      } catch(e:any) { return { sym:t.sym, articles:[] as Article[], error:e.message } }
    }))

    // Show articles immediately
    setNewsMap(prev => {
      const next = {...prev}
      newsResults.forEach(r => {
        if(next[r.sym]) next[r.sym] = {
          ...next[r.sym], articles:r.articles, error:r.error,
          analysis: r.articles.length ? 'Analyzing…' : 'No recent news found.'
        }
      })
      return next
    })

    // One batch Gemini call for everything with news
    const withNews = newsResults.filter(r => r.articles.length > 0)
    if (withNews.length) {
      try {
        const res = await fetch('/api/analyze', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            stocks: withNews.map(r => ({
              sym:      r.sym,
              name:     tracked.find(t=>t.sym===r.sym)?.name||r.sym,
              articles: r.articles.slice(0,5),
            }))
          }),
        })
        const data = await res.json()
        const results: Record<string,string> = data.results || {}
        setNewsMap(prev => {
          const next = {...prev}
          newsResults.forEach(r => {
            if(next[r.sym]) next[r.sym] = {
              ...next[r.sym], loading:false, loaded:true,
              analysis: results[r.sym] || (r.articles.length ? 'Analysis unavailable.' : 'No recent news found.'),
            }
          })
          return next
        })
      } catch {
        setNewsMap(prev => {
          const next = {...prev}
          newsResults.forEach(r => {
            if(next[r.sym]) next[r.sym] = { ...next[r.sym], loading:false, loaded:true,
              analysis: r.articles.length ? 'AI analysis temporarily unavailable. See headlines below.' : 'No recent news found.' }
          })
          return next
        })
      }
    } else {
      setNewsMap(prev => {
        const next = {...prev}
        newsResults.forEach(r => { if(next[r.sym]) next[r.sym]={...next[r.sym],loading:false,loaded:true} })
        return next
      })
    }
    setLastRefresh(new Date().toLocaleTimeString())
    setRefreshing(false)
  }, [])

  useEffect(() => {
    if(initialized.current) return
    initialized.current = true
    const extra = loadExtra()
    setExtraSyms(extra)
    fetchAll(buildTracked())
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchAll(buildTracked(), true)
  }, [buildTracked, fetchAll])

  const handleAdd = useCallback(async () => {
    const sym = searchSym.trim().toUpperCase()
    if (!sym) return
    if (newsMap[sym]) { setSearchErr('Already tracking '+sym); return }
    setSearching(true); setSearchErr('')
    try {
      let name = sym
      try { const p=await fetch(`/api/profile?sym=${sym}`); const d=await p.json(); if(d.name) name=d.name } catch {}
      const updated = [...extraSyms, sym]
      setExtraSyms(updated); saveExtra(updated); setSearchSym('')
      await fetchAll([{sym,name,group:'added'}])
    } catch(e:any) { setSearchErr(e.message) }
    finally { setSearching(false) }
  }, [searchSym, newsMap, extraSyms, fetchAll])

  const handleRemove = useCallback((sym:string) => {
    const updated = extraSyms.filter(s=>s!==sym)
    setExtraSyms(updated); saveExtra(updated)
    setNewsMap(prev => { const next={...prev}; delete next[sym]; return next })
  }, [extraSyms])

  const allStocks = Object.values(newsMap)
  const displayed = filter==='all' ? allStocks : allStocks.filter(s=>s.group===filter)
  const anyLoading = allStocks.some(s=>s.loading)

  const groupCount = (g:string) => g==='all' ? allStocks.length : allStocks.filter(s=>s.group===g).length

  return (
    <div>
      {/* Hero */}
      <div style={{background:'var(--bg2)',borderRadius:'var(--radius)',padding:'12px 16px',
        marginBottom:'1.25rem',fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
        <strong style={{color:'var(--text)'}}>Live news & AI analysis</strong> — Headlines from{' '}
        Yahoo Finance, Google News, Seeking Alpha & MarketWatch. AI by Gemini — all stocks in one batch.
        No API quotas. Updates every 15 min.
        {lastRefresh && <span style={{color:'var(--text3)',fontSize:11}}> · Updated {lastRefresh}</span>}
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:10,marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:6,flex:1,minWidth:220}}>
          <input value={searchSym} onChange={e=>{setSearchSym(e.target.value.toUpperCase());setSearchErr('')}}
            onKeyDown={e=>e.key==='Enter'&&handleAdd()}
            placeholder="Track any stock — e.g. AAPL, TSLA"
            style={{flex:1,padding:'7px 12px',border:'1px solid var(--border)',borderRadius:8,
              fontSize:13,background:'var(--bg)',color:'var(--text)'}} />
          <button onClick={handleAdd} disabled={searching||!searchSym}
            style={{padding:'7px 14px',border:'none',borderRadius:8,background:'#1d9e75',
              color:'#fff',fontSize:13,fontWeight:500,
              cursor:searching||!searchSym?'not-allowed':'pointer',
              opacity:searching||!searchSym?0.6:1}}>
            {searching?'…':'+ Track'}
          </button>
        </div>
        <button onClick={handleRefresh} disabled={refreshing||anyLoading}
          style={{padding:'7px 14px',border:'1px solid var(--border)',borderRadius:8,
            background:'transparent',color:'var(--text2)',fontSize:13,
            cursor:refreshing||anyLoading?'not-allowed':'pointer',
            opacity:refreshing||anyLoading?0.6:1}}>
          {refreshing||anyLoading?'⟳ Fetching…':'⟳ Refresh all'}
        </button>
      </div>

      {searchErr && <div style={{fontSize:12,color:'#d64045',marginBottom:10}}>⚠ {searchErr}</div>}

      {/* Filter chips */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:'1.25rem',alignItems:'center'}}>
        <span style={{fontSize:12,color:'var(--text2)'}}>Show:</span>
        {(['all','holding','watchlist','added'] as const)
          .filter(g => groupCount(g) > 0)
          .map(g => (
            <button key={g} onClick={()=>setFilter(g)}
              style={{fontSize:12,padding:'4px 12px',border:'1px solid var(--border)',
                borderRadius:999,cursor:'pointer',
                background:g===filter?'#111':'transparent',
                color:g===filter?'#fff':'var(--text2)'}}>
              {g==='all'?`All (${groupCount('all')})`:
               g==='holding'?`Holdings (${groupCount('holding')})`:
               g==='watchlist'?`Watchlist (${groupCount('watchlist')})`:
               `Added (${groupCount('added')})`}
            </button>
          ))}
      </div>

      {/* Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))',gap:16}}>
        {displayed.map(s => {
          const q = quotes[s.sym]
          const badge =
            s.group==='holding'  ?{bg:'#e1f5ee',fg:'#0f6e56',label:'Holding'}:
            s.group==='watchlist'?{bg:'#faeeda',fg:'#854f0b',label:'Watchlist'}:
                                  {bg:'#eeedfe',fg:'#3c3489',label:'Added'}

          return (
            <div key={s.sym} style={{background:'var(--bg)',border:'1px solid var(--border)',
              borderRadius:'var(--radius)',padding:20,display:'flex',flexDirection:'column',gap:0}}>

              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:18,fontWeight:600}}>{s.sym}</span>
                    <span style={{fontSize:10,padding:'2px 8px',borderRadius:999,fontWeight:600,
                      background:badge.bg,color:badge.fg}}>{badge.label}</span>
                    {s.group==='added' && (
                      <button onClick={()=>handleRemove(s.sym)} title="Stop tracking"
                        style={{fontSize:12,background:'none',border:'none',
                          color:'var(--text3)',cursor:'pointer',padding:'0 2px'}}>✕</button>
                    )}
                  </div>
                  <div style={{fontSize:12,color:'var(--text3)',fontWeight:400}}>{s.name}</div>
                </div>
                {q && (
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:16,fontWeight:600}}>{fmt(q.price)}</div>
                    <div style={{fontSize:12,color:q.pct>=0?'#1d9e75':'#d64045',fontWeight:500}}>
                      {q.pct>=0?'▲':'▼'} {Math.abs(q.pct).toFixed(2)}% today
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              <div style={{background:'var(--bg2)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:10,fontWeight:600,color:'var(--text3)',
                      textTransform:'uppercase',letterSpacing:'.06em'}}>AI Impact Analysis</span>
                  </div>
                  {s.loading && (
                    <span style={{fontSize:10,color:'var(--text3)'}}>
                      <span style={{animation:'pulse 1.5s infinite'}}>●</span> Analyzing…
                    </span>
                  )}
                </div>
                <div style={{fontSize:13,color:'var(--text)',lineHeight:1.7,
                  fontStyle: s.loading && !s.analysis ? 'italic' : 'normal',
                  color: s.loading && !s.analysis ? 'var(--text3)' : 'var(--text)'}}>
                  {!s.loaded && !s.analysis ? 'Fetching news and running analysis…'
                    : s.error ? <span style={{color:'#d64045'}}>Error: {s.error}</span>
                    : s.analysis || 'Loading…'}
                </div>
              </div>

              {/* Headlines — clean card style, no raw URLs */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:11,fontWeight:600,color:'var(--text3)',
                  textTransform:'uppercase',letterSpacing:'.06em'}}>
                  Headlines
                </span>
                <span style={{fontSize:11,color:'var(--text3)'}}>
                  {s.articles.length} articles
                </span>
              </div>

              {s.articles.length > 0 ? (
                <div style={{flex:1}}>
                  {s.articles.map((a,i) => (
                    <ArticleCard key={i} a={a} index={i} total={s.articles.length} />
                  ))}
                </div>
              ) : s.loaded ? (
                <div style={{fontSize:13,color:'var(--text3)',padding:'12px 0',
                  textAlign:'center',borderTop:'1px solid var(--border)'}}>
                  No recent news found for {s.sym}.
                  <div style={{fontSize:11,marginTop:4}}>Try refreshing or check the ticker.</div>
                </div>
              ) : (
                <div style={{fontSize:13,color:'var(--text3)',padding:'12px 0',textAlign:'center'}}>
                  Loading articles…
                </div>
              )}
            </div>
          )
        })}

        {displayed.length === 0 && (
          <div style={{textAlign:'center',padding:'3rem',color:'var(--text3)',
            fontSize:13,gridColumn:'1/-1'}}>
            No stocks in this group. Add one using the search bar above.
          </div>
        )}
      </div>

      <div style={{fontSize:11,color:'var(--text3)',borderTop:'1px solid var(--border)',
        paddingTop:10,lineHeight:1.5,marginTop:'1.5rem'}}>
        News from Yahoo Finance, Google News, Seeking Alpha and MarketWatch — no API keys, no quotas.
        AI analysis by Gemini 2.5 Flash. For informational purposes only. Not financial advice.
      </div>
    </div>
  )
}
