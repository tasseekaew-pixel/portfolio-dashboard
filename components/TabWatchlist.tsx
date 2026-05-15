'use client'
import '@/components/ChartSetup'
import { useState, useEffect, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

// ── Persistent watchlist stored in localStorage ─────────────────────────────
const STORAGE_KEY = 'portfolio_watchlist_v1'

const DEFAULT_WATCHLIST = [
  { sym:'AMD',  name:'AMD',       revG:22, moPct:80.4, yrPct:107.9, tgt:500  },
  { sym:'NVDA', name:'NVIDIA',    revG:73, moPct:19.2, yrPct:21.1,  tgt:250  },
  { sym:'TSM',  name:'TSMC',      revG:35, moPct:8.2,  yrPct:31.6,  tgt:450  },
  { sym:'GOOGL',name:'Alphabet',  revG:12, moPct:25.2, yrPct:28.5,  tgt:430  },
  { sym:'LLY',  name:'Eli Lilly', revG:43, moPct:8.1,  yrPct:-5.5,  tgt:1225 },
]

interface WatchItem {
  sym:    string
  name:   string
  revG:   number
  moPct:  number
  yrPct:  number
  tgt:    number
}

function loadList(): WatchItem[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return JSON.parse(s)
  } catch {}
  return DEFAULT_WATCHLIST
}

function saveList(list: WatchItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}
function fp(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function pc(n: number) { return n >= 0 ? '#1d9e75' : '#d64045' }

const ANALYSIS_ITEMS = [
  { sym:'AMZN', n:'Amazon',        t:'stock', revG:12, moPct:12.6, yrPct:17.1, tgt:310 },
  { sym:'SPY',  n:'S&P 500 ETF',   t:'etf',   revG:0,  moPct:8.2,  yrPct:8.8,  tgt:780 },
  { sym:'VOO',  n:'Vanguard S&P',  t:'etf',   revG:0,  moPct:8.2,  yrPct:8.8,  tgt:720 },
  { sym:'VTI',  n:'Vanguard Total',t:'etf',   revG:0,  moPct:7.8,  yrPct:8.8,  tgt:385 },
]

// ── Sparkline chart ───────────────────────────────────────────────────────────
function Spark({ sym, color, height = 120 }: { sym: string; color: string; height?: number }) {
  const [data, setData] = useState<{ closes: number[]; dates: string[] } | null>(null)

  useEffect(() => {
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(d => { if (d.closes?.length) setData(d) })
      .catch(() => {})
  }, [sym])

  if (!data) return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:11, color:'#999' }}>Loading chart…</div>
  )

  const sma = data.closes.map((_, i, a) => {
    if (i < 6) return null
    const sl = a.slice(i-6, i+1)
    return sl.reduce((s,v)=>s+v,0)/sl.length
  })

  return (
    <div style={{ height }}>
      <Line
        data={{ labels: data.dates, datasets: [
          { data: data.closes, borderColor: color, backgroundColor: color+'22',
            borderWidth:2, pointRadius:0, tension:0.3, fill:true },
          { data: sma, borderColor:'rgba(0,0,0,0.15)', borderWidth:1,
            borderDash:[3,2], pointRadius:0, fill:false },
        ]}}
        options={{
          responsive:true, maintainAspectRatio:false, animation:false,
          plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(c:any)=>` $${Number(c.raw).toFixed(2)}`}} },
          scales:{
            x:{ ticks:{maxTicksLimit:5, font:{size:10}}, grid:{display:false} },
            y:{ ticks:{font:{size:10}, callback:(v:any)=>'$'+Number(v).toFixed(0)}, grid:{color:'rgba(0,0,0,0.05)'} },
          },
        }}
      />
    </div>
  )
}

// ── Add stock modal ───────────────────────────────────────────────────────────
function AddStockModal({ onAdd, onClose }: {
  onAdd: (item: WatchItem) => void
  onClose: () => void
}) {
  const [sym,  setSym ] = useState('')
  const [name, setName] = useState('')
  const [tgt,  setTgt ] = useState('')
  const [revG, setRevG] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState('')

  // Auto-fetch company name when ticker is entered
  const lookupProfile = async (ticker: string) => {
    if (ticker.length < 1) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/profile?sym=${ticker.toUpperCase()}`)
      const d   = await res.json()
      if (d.name) setName(d.name)
      if (d.analystTarget) setTgt(d.analystTarget.toFixed(2))
      if (d.revGrowth) setRevG(d.revGrowth.toFixed(1))
    } catch {}
    finally { setLoading(false) }
  }

  const handleAdd = () => {
    if (!sym.trim()) { setError('Ticker symbol is required'); return }
    onAdd({
      sym:   sym.toUpperCase().trim(),
      name:  name.trim() || sym.toUpperCase().trim(),
      revG:  parseFloat(revG) || 0,
      moPct: 0,
      yrPct: 0,
      tgt:   parseFloat(tgt) || 0,
    })
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--bg)', borderRadius:'var(--radius)', padding:24,
        width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:500 }}>Add stock to watchlist</div>
          <button onClick={onClose} style={{ fontSize:18, background:'none', border:'none',
            color:'var(--text2)', cursor:'pointer', padding:'0 4px' }}>✕</button>
        </div>

        {/* Ticker input */}
        <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>
          Ticker symbol *
        </label>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <input
            value={sym}
            onChange={e => setSym(e.target.value.toUpperCase())}
            onBlur={e => lookupProfile(e.target.value)}
            placeholder="e.g. AAPL"
            style={{ flex:1, padding:'8px 12px', border:'1px solid var(--border)',
              borderRadius:8, fontSize:14, background:'var(--bg)', color:'var(--text)',
              textTransform:'uppercase' }}
          />
          <button onClick={() => lookupProfile(sym)} disabled={loading}
            style={{ padding:'8px 14px', border:'1px solid var(--border)', borderRadius:8,
              background:'var(--bg2)', color:'var(--text2)', fontSize:12, cursor:'pointer' }}>
            {loading ? '…' : 'Lookup'}
          </button>
        </div>

        {/* Company name */}
        <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>
          Company name
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Auto-filled on lookup"
          style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)',
            borderRadius:8, fontSize:13, background:'var(--bg)', color:'var(--text)',
            marginBottom:16, boxSizing:'border-box' }}
        />

        {/* Optional fields */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>
              Analyst target ($)
            </label>
            <input
              value={tgt}
              onChange={e => setTgt(e.target.value)}
              placeholder="e.g. 250"
              type="number"
              style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)',
                borderRadius:8, fontSize:13, background:'var(--bg)', color:'var(--text)',
                boxSizing:'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>
              Revenue growth (%)
            </label>
            <input
              value={revG}
              onChange={e => setRevG(e.target.value)}
              placeholder="e.g. 20"
              type="number"
              style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)',
                borderRadius:8, fontSize:13, background:'var(--bg)', color:'var(--text)',
                boxSizing:'border-box' }}
            />
          </div>
        </div>

        {error && <div style={{ fontSize:12, color:'#d64045', marginBottom:12 }}>⚠ {error}</div>}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 16px', border:'1px solid var(--border)', borderRadius:8,
              background:'transparent', color:'var(--text2)', fontSize:13, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd}
            style={{ padding:'8px 20px', border:'none', borderRadius:8,
              background:'#1d9e75', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            Add to watchlist
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabWatchlist({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [subTab,    setSubTab   ] = useState<'watchlist'|'analysis'>('watchlist')
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [showAdd,   setShowAdd  ] = useState(false)
  const [histories, setHistories] = useState<Record<string,number[]>>({})

  // Load from localStorage on mount
  useEffect(() => { setWatchlist(loadList()) }, [])

  // Fetch histories for analysis scoring
  useEffect(() => {
    const syms = [...new Set([
      ...watchlist.map(w => w.sym),
      ...ANALYSIS_ITEMS.map(x => x.sym),
    ])]
    syms.forEach(sym => {
      if (histories[sym]) return
      fetch(`/api/history?sym=${sym}&days=30`)
        .then(r => r.json())
        .then(d => { if (d.closes?.length) setHistories(prev => ({...prev, [sym]: d.closes})) })
        .catch(() => {})
    })
  }, [watchlist])

  const addStock = (item: WatchItem) => {
    if (watchlist.find(w => w.sym === item.sym)) return
    const updated = [...watchlist, item]
    setWatchlist(updated)
    saveList(updated)
  }

  const removeStock = (sym: string) => {
    const updated = watchlist.filter(w => w.sym !== sym)
    setWatchlist(updated)
    saveList(updated)
  }

  // ── Watchlist sub-tab ───────────────────────────────────────────────────────
  const WatchlistTab = () => (
    <div>
      {/* Quote cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:'1.5rem' }}>
        {watchlist.map(w => {
          const q = quotes[w.sym]
          return (
            <div key={w.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'14px 16px', position:'relative' }}>
              <button onClick={() => removeStock(w.sym)}
                title="Remove from watchlist"
                style={{ position:'absolute', top:10, right:10, background:'none', border:'none',
                  fontSize:14, color:'var(--text3)', cursor:'pointer', padding:'0 4px',
                  lineHeight:1 }}>✕</button>
              <div style={{ marginBottom:8, paddingRight:20 }}>
                <div style={{ fontSize:15, fontWeight:500 }}>{w.sym}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{w.name}</div>
              </div>
              <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>
                {loading || !q ? '—' : fmt(q.price)}
              </div>
              <div style={{ fontSize:12, color: q ? pc(q.pct) : 'var(--text3)' }}>
                {q ? (q.pct>=0?'▲':'▼') + ' ' + fp(q.pct) + ' today' : '—'}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11,
                borderTop:'1px solid var(--border)', marginTop:10, paddingTop:8,
                color:'var(--text3)' }}>
                <span>Target: {w.tgt ? fmt(w.tgt) : '—'}</span>
                {q && w.tgt ? (
                  <span style={{ color: pc(w.tgt - q.price) }}>
                    {fp((w.tgt - q.price)/q.price*100)} upside
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}

        {/* Add stock card */}
        <button onClick={() => setShowAdd(true)}
          style={{ background:'var(--bg2)', border:'1.5px dashed var(--border)',
            borderRadius:'var(--radius)', padding:'14px 16px', cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:8, minHeight:140 }}>
          <span style={{ fontSize:24, color:'var(--text3)' }}>+</span>
          <span style={{ fontSize:13, color:'var(--text2)', fontWeight:500 }}>Add stock</span>
          <span style={{ fontSize:11, color:'var(--text3)' }}>by name or ticker</span>
        </button>
      </div>

      {/* Charts */}
      <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>
        30-day price trends
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
        {watchlist.map(w => {
          const q = quotes[w.sym]
          return (
            <div key={w.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontSize:14, fontWeight:500 }}>{w.sym} — {w.name}</div>
                <span style={{ fontSize:13, fontWeight:500, color: q ? pc(q.pct) : 'var(--text3)' }}>
                  {q ? fp(q.pct) + ' today' : '—'}
                </span>
              </div>
              <Spark sym={w.sym} color={q && q.pct>=0 ? '#1d9e75' : '#d64045'} height={120} />
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Analysis sub-tab ────────────────────────────────────────────────────────
  const allAnalysis = [
    ...watchlist.map(w => ({
      sym: w.sym, n: w.name, t: 'watchlist',
      revG: w.revG, moPct: w.moPct, yrPct: w.yrPct, tgt: w.tgt,
    })),
    ...ANALYSIS_ITEMS.filter(x => !watchlist.find(w => w.sym === x.sym)),
  ]

  const scored = allAnalysis.map(x => {
    const q = quotes[x.sym]
    const h = histories[x.sym] || []
    const sc = ltScore({ price: q?.price||0, history: h,
      revG: x.revG, moPct: x.moPct, yrPct: x.yrPct, tgt: x.tgt })
    return { ...x, q, ...sc }
  }).sort((a,b) => b.score - a.score)

  const buy   = scored.filter(x => x.sig === 'buy')
  const watch2 = scored.filter(x => x.sig === 'watch')
  const wait  = scored.filter(x => x.sig === 'wait')

  const AnalysisCard = ({ x, hi }: { x: typeof scored[0]; hi: boolean }) => {
    const bg  = x.score>=70?'#e1f5ee':x.score>=50?'#faeeda':'#f4f4f4'
    const txt = x.score>=70?'#0f6e56':x.score>=50?'#854f0b':'#666'
    const lbl = x.sig==='buy'?'Strong long-term setup':x.sig==='watch'?'Accumulate gradually':'Wait for better entry'
    const col = x.color

    const reasons: string[] = []
    if (x.sig==='buy') {
      if ((x.q?.price||0)>x.a7) reasons.push(`Trading above 7-day average — near-term confirms long-term direction`)
      if (x.yrPct>20) reasons.push(`${fp(x.yrPct)} over the past year — sustained multi-month trend`)
      if (x.revG>15) reasons.push(`${x.revG}% revenue growth — expanding earnings power`)
      if (x.upside>10) reasons.push(`Analyst target implies ${x.upside.toFixed(1)}% upside`)
    } else if (x.sig==='watch') {
      reasons.push(`Trend building — consider DCA rather than lump sum`)
      if (x.rsi<55) reasons.push(`RSI ${x.rsi.toFixed(0)} — may be forming a better entry point`)
    } else {
      reasons.push(`Short-term trend unfavorable — wait for 30-day trend to turn upward`)
      if (x.rsi>65) reasons.push(`RSI ${x.rsi.toFixed(0)} — overbought, wait for a pullback first`)
    }

    return (
      <div style={{ background:'var(--bg)',
        border: hi ? '1.5px solid #1d9e75' : '1px solid var(--border)',
        borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16, fontWeight:500 }}>{x.sym}</span>
              {x.t==='watchlist' && (
                <span style={{ fontSize:10, padding:'1px 7px', borderRadius:999,
                  background:'#faeeda', color:'#854f0b', fontWeight:500 }}>Watchlist</span>
              )}
            </div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{x.n} · {x.t==='etf'?'ETF':'Stock'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:15, fontWeight:500 }}>{x.q ? fmt(x.q.price) : '—'}</div>
            <div style={{ fontSize:11, color: x.q ? pc(x.q.pct) : 'var(--text3)' }}>
              {x.q ? fp(x.q.pct)+' today' : '—'}
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10 }}>
          {[['7d avg',fmt(x.a7)],['RSI-14',x.rsi.toFixed(0)],['1Y return',fp(x.yrPct)]].map(([l,v])=>(
            <div key={l} style={{ background:'var(--bg2)', borderRadius:8, padding:'7px 9px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:500,
                color: l==='1Y return' ? pc(x.yrPct) : 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:11, color:'var(--text3)' }}>Long-term score</span>
          <span style={{ fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:999,
            background:bg, color:txt }}>{lbl} · {x.score}/100</span>
        </div>
        <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:8 }}>
          <div style={{ height:'100%', borderRadius:3, background:col, width:x.score+'%', transition:'width .4s ease' }} />
        </div>
        <Spark sym={x.sym} color={col} height={70} />
        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6,
          borderTop:'1px solid var(--border)', paddingTop:8 }}>
          {reasons.map((r,i) => <div key={i}>· {r}</div>)}
        </div>
      </div>
    )
  }

  const Section = ({ title, items }: { title: string; items: typeof scored }) =>
    items.length > 0 ? (
      <>
        <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.06em', marginBottom:10 }}>{title}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',
          gap:12, marginBottom:'1rem' }}>
          {items.map((x,i) => <AnalysisCard key={x.sym} x={x} hi={i===0 && title.startsWith('Strong')} />)}
        </div>
      </>
    ) : null

  const AnalysisTab = () => (
    <div>
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px',
        marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Long-term analysis</strong> — Your watchlist stocks
        plus holdings are scored for <strong style={{ color:'var(--text)' }}>buy-and-hold suitability</strong>.
        Scores use 7-day momentum, RSI, 1-year return, revenue growth, and analyst upside.
        Add stocks to your watchlist to see them analyzed here. Not financial advice.
      </div>
      <Section title="Strong long-term setups — consider buying or adding" items={buy} />
      <Section title="Accumulate gradually — DCA recommended" items={watch2} />
      <Section title="Wait for better entry — don't chase" items={wait} />
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)',
        paddingTop:10, lineHeight:1.5 }}>
        Not financial advice. Scores are informational only.
      </div>
    </div>
  )

  return (
    <div>
      {/* Sub-tab switcher */}
      <div style={{ display:'flex', gap:4, marginBottom:'1.25rem' }}>
        {(['watchlist','analysis'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            style={{ fontSize:13, padding:'7px 18px', borderRadius:8, border:'1px solid var(--border)',
              cursor:'pointer', fontWeight: t===subTab ? 500 : 400,
              background: t===subTab ? 'var(--text)' : 'transparent',
              color:      t===subTab ? 'var(--bg)'   : 'var(--text2)' }}>
            {t === 'watchlist' ? `Watchlist (${watchlist.length})` : 'Analysis'}
          </button>
        ))}
      </div>

      {subTab === 'watchlist' && <WatchlistTab />}
      {subTab === 'analysis'  && <AnalysisTab />}

      {showAdd && <AddStockModal onAdd={addStock} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
