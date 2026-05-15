'use client'
import { useState, useEffect } from 'react'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

const STORAGE_KEY = 'portfolio_watchlist_v1'
const DEFAULT_WATCHLIST = [
  { sym:'AMD',  name:'AMD',       revG:22, moPct:80.4, yrPct:107.9, tgt:500  },
  { sym:'NVDA', name:'NVIDIA',    revG:73, moPct:19.2, yrPct:21.1,  tgt:250  },
  { sym:'TSM',  name:'TSMC',      revG:35, moPct:8.2,  yrPct:31.6,  tgt:450  },
  { sym:'GOOGL',name:'Alphabet',  revG:12, moPct:25.2, yrPct:28.5,  tgt:430  },
  { sym:'LLY',  name:'Eli Lilly', revG:43, moPct:8.1,  yrPct:-5.5,  tgt:1225 },
]

function loadWatchlist() {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s) } catch {}
  return DEFAULT_WATCHLIST
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }
function pc(n: number) { return n>=0 ? '#1d9e75' : '#d64045' }

interface Candidate {
  sym:     string
  name:    string
  source:  'watchlist' | 'scout'
  price:   number
  pct:     number
  score:   number
  sig:     string
  upside:  number
  yrPct:   number
  revG:    number
  tgt:     number
  verdict?: string
  why?:    string
}

export default function TabPlanner({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [amount,     setAmount    ] = useState(1000)
  const [filter,     setFilter    ] = useState<'all'|'watchlist'|'scout'>('all')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [scoutLoading, setScoutLoading] = useState(true)
  const [histories,  setHistories ] = useState<Record<string, number[]>>({})

  // Load watchlist candidates from localStorage
  const [watchlistCands, setWatchlistCands] = useState<Candidate[]>([])
  useEffect(() => {
    const wl = loadWatchlist()
    setWatchlistCands(wl.map((w: any) => ({
      sym: w.sym, name: w.name, source: 'watchlist' as const,
      price: 0, pct: 0, score: 0, sig: 'wait', upside: 0,
      yrPct: w.yrPct, revG: w.revG, tgt: w.tgt,
    })))
  }, [])

  // Fetch scout candidates
  const [scoutCands, setScoutCands] = useState<Candidate[]>([])
  useEffect(() => {
    setScoutLoading(true)
    fetch('/api/scout')
      .then(r => r.json())
      .then(data => {
        if (data.stocks) {
          setScoutCands(data.stocks.slice(0, 8).map((s: any) => ({
            sym:     s.sym,
            name:    s.name,
            source:  'scout' as const,
            price:   s.price || 0,
            pct:     s.pct   || 0,
            score:   s.ltScore || 50,
            sig:     s.ltScore>=70?'buy':s.ltScore>=50?'watch':'wait',
            upside:  s.analystTarget && s.price ? (s.analystTarget - s.price)/s.price*100 : 0,
            yrPct:   s.yrPct    || 0,
            revG:    s.revGrowth || 0,
            tgt:     s.analystTarget || 0,
            verdict: s.verdict,
            why:     s.why,
          })))
        }
      })
      .catch(() => {})
      .finally(() => setScoutLoading(false))
  }, [])

  // Fetch history for scoring watchlist items
  useEffect(() => {
    watchlistCands.forEach(c => {
      if (histories[c.sym]) return
      fetch(`/api/history?sym=${c.sym}&days=30`)
        .then(r => r.json())
        .then(d => { if (d.closes?.length) setHistories(prev => ({...prev, [c.sym]: d.closes})) })
        .catch(() => {})
    })
  }, [watchlistCands])

  // Merge quotes + histories into final scored candidates
  useEffect(() => {
    // Score watchlist items using live quotes + history
    const scoredWL = watchlistCands.map(c => {
      const q = quotes[c.sym]
      const h = histories[c.sym] || []
      const sc = ltScore({ price: q?.price||0, history: h,
        revG: c.revG, moPct: 0, yrPct: c.yrPct, tgt: c.tgt })
      return {
        ...c,
        price:  q?.price || 0,
        pct:    q?.pct   || 0,
        score:  sc.score,
        sig:    sc.sig,
        upside: sc.upside,
      }
    })

    // Update scout items with live quotes where available
    const scoredSC = scoutCands.map(c => {
      const q = quotes[c.sym]
      return {
        ...c,
        price: q?.price || c.price,
        pct:   q?.pct   || c.pct,
      }
    })

    // Merge, deduplicate (watchlist takes priority), sort by score
    const seen = new Set<string>()
    const merged: Candidate[] = []
    for (const c of [...scoredWL, ...scoredSC]) {
      if (!seen.has(c.sym) && c.price > 0) {
        seen.add(c.sym)
        merged.push(c)
      }
    }
    setCandidates(merged.sort((a,b) => b.score - a.score))
  }, [watchlistCands, scoutCands, quotes, histories])

  const filtered = filter === 'all' ? candidates
    : candidates.filter(c => c.source === filter)

  const top = filtered.slice(0, 8)
  const totalScore = top.reduce((s,c) => s + Math.max(c.score,1), 0)
  const alloc = top.map(c => ({
    dollars: Math.round(amount * Math.max(c.score,1) / totalScore),
    pct:     Math.max(c.score,1) / totalScore * 100,
  }))
  const totalAlloc = alloc.reduce((s,a) => s+a.dollars, 0)

  const isLoading = loading || scoutLoading

  return (
    <div>
      {/* Input card */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', padding:18, marginBottom:'1.25rem' }}>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>
          How much do you want to invest?
        </div>
        <div style={{ fontSize:28, fontWeight:500, marginBottom:10 }}>{fmt(amount)}</div>
        <input type="range" min={100} max={10000} step={100} value={amount}
          onChange={e => setAmount(Number(e.target.value))}
          style={{ width:'100%', marginBottom:12 }} />
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {[250,500,1000,2500,5000,10000].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)',
                borderRadius:999, cursor:'pointer',
                background: v===amount ? '#7f77dd' : 'transparent',
                color:      v===amount ? '#fff'    : 'var(--text2)' }}>
              ${v>=1000 ? v/1000+'k' : v}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center',
          paddingTop:12, borderTop:'1px solid var(--border)' }}>
          <span style={{ fontSize:12, color:'var(--text2)' }}>Show candidates from:</span>
          {(['all','watchlist','scout'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)',
                borderRadius:999, cursor:'pointer',
                background: f===filter ? '#111' : 'transparent',
                color:      f===filter ? '#fff'  : 'var(--text2)' }}>
              {f==='all'?`All (${candidates.length})`:f==='watchlist'?`My watchlist (${watchlistCands.length})`:`Scout picks (${scoutCands.length})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'var(--text3)', fontSize:13 }}>
          Loading candidates from watchlist and scout…
        </div>
      ) : top.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'var(--text3)', fontSize:13 }}>
          No candidates found. Add stocks to your watchlist or wait for the scout to load.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'10px 14px', background:'var(--bg2)', borderRadius:'var(--radius-sm)',
            marginBottom:'1rem', fontSize:13, flexWrap:'wrap', gap:8 }}>
            <div>
              Deploying <strong>${amount.toLocaleString()}</strong> across{' '}
              <strong>{top.length} picks</strong>
              {' '}({top.filter(c=>c.source==='watchlist').length} watchlist,{' '}
              {top.filter(c=>c.source==='scout').length} scout)
            </div>
            {amount - totalAlloc > 0 && (
              <div style={{ fontSize:11, color:'var(--text3)' }}>
                ${amount-totalAlloc} unallocated (rounding)
              </div>
            )}
          </div>

          <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'12px 16px',
            marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
            Allocation is <strong style={{ color:'var(--text)' }}>weighted by long-term score</strong>.
            Watchlist stocks you've researched and scout AI picks are combined and ranked.
            Higher-scored stocks get a larger share. For volatile picks,
            consider <strong style={{ color:'var(--text)' }}>DCA</strong> — splitting
            across 2–3 months instead of investing all at once.
          </div>

          {/* Allocation cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))', gap:12 }}>
            {top.map((c, i) => {
              const al  = alloc[i]
              const shares = c.price > 0 ? al.dollars / c.price : 0
              const bc  = c.score>=70?'#1d9e75':c.score>=50?'#e06c00':'#7f77dd'
              const srcStyle = c.source==='watchlist'
                ? { bg:'#faeeda', color:'#854f0b', label:'Watchlist' }
                : { bg:'#eeedfe', color:'#3c3489', label:'Scout' }
              const why2 = c.sig==='buy'
                ? `Strong long-term setup — ${fp(c.yrPct)} past year, RSI healthy, momentum positive.`
                : c.sig==='watch'
                ? `DCA recommended — split $${al.dollars.toLocaleString()} across 2–3 months. Trend building.`
                : `Smaller allocation — trend not yet confirmed. Watch for price to reclaim 30-day average.`

              return (
                <div key={c.sym} style={{ background:'var(--bg)', position:'relative',
                  border: i===0 ? '1.5px solid #1d9e75' : '1px solid var(--border)',
                  borderRadius:'var(--radius)', padding:14 }}>

                  {/* Rank badge */}
                  <div style={{ position:'absolute', top:12, right:12, width:22, height:22,
                    borderRadius:'50%', background:'var(--bg2)', display:'flex',
                    alignItems:'center', justifyContent:'center', fontSize:11,
                    fontWeight:500, color:'var(--text3)' }}>{i+1}</div>

                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'flex-start', marginBottom:4 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:500 }}>{c.sym}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                        {c.name}{' '}
                        <span style={{ fontSize:10, padding:'1px 7px', borderRadius:999,
                          fontWeight:500, background:srcStyle.bg, color:srcStyle.color }}>
                          {srcStyle.label}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:20, fontWeight:500 }}>
                        ${al.dollars.toLocaleString()}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>
                        {al.pct.toFixed(1)}% of budget
                      </div>
                    </div>
                  </div>

                  {/* Allocation bar */}
                  <div style={{ height:5, background:'var(--bg2)', borderRadius:3,
                    overflow:'hidden', margin:'8px 0' }}>
                    <div style={{ height:'100%', borderRadius:3, background:bc,
                      width:al.pct.toFixed(1)+'%', transition:'width .4s ease' }} />
                  </div>

                  {/* Details */}
                  {[
                    ['Price per share', c.price>0 ? fmt(c.price) : '—'],
                    ['Shares to buy',   shares>=1 ? shares.toFixed(3) : shares.toFixed(5)],
                    ['1Y return',       fp(c.yrPct)],
                    ['Analyst upside',  c.upside ? (c.upside>=0?'+':'')+c.upside.toFixed(1)+'%' : '—'],
                    ['Long-term score', `${c.score}/100`],
                  ].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between',
                      fontSize:12, marginTop:4 }}>
                      <span style={{ color:'var(--text2)' }}>{l}</span>
                      <strong style={{ color: l==='1Y return' ? pc(c.yrPct) : 'var(--text)' }}>{v}</strong>
                    </div>
                  ))}

                  {/* Why */}
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:8,
                    paddingTop:8, borderTop:'1px solid var(--border)', lineHeight:1.5 }}>
                    <strong style={{ color:'var(--text)' }}>Why:</strong>{' '}
                    {c.why ? c.why.replace(/<[^>]+>/g,'').slice(0,120)+'…' : why2}
                    {c.revG>15 && ` Revenue growing ${c.revG}% — fundamentals support long-term hold.`}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)',
            paddingTop:10, lineHeight:1.5, marginTop:'1rem' }}>
            Watchlist scores use live prices + 30-day price history. Scout scores come from
            Gemini AI analysis. DCA (investing a fixed amount regularly) reduces timing risk.
            Always verify prices before trading. Not financial advice.
          </div>
        </>
      )}
    </div>
  )
}
