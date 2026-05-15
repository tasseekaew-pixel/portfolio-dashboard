'use client'
import { useState, useEffect, useCallback } from 'react'
import { HOLDINGS } from '@/lib/data'
import TabHoldings from '@/components/TabHoldings'
import TabWatchlist from '@/components/TabWatchlist'
import TabScout from '@/components/TabScout'
import TabPlanner from '@/components/TabPlanner'
import TabNews from '@/components/TabNews'

export type QuoteMap = Record<string, {
  price:  number
  prev:   number
  pct:    number
  change: number
  high:   number
  low:    number
  open:   number
}>

const TABS = [
  'Holdings', 'Watchlist & Analysis',
  'Scout', 'Buy planner', 'News'
] as const
type Tab = typeof TABS[number]

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fp(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function pc(n: number) { return n >= 0 ? 'pos' : 'neg' }

function portCalc(quotes: QuoteMap) {
  let eV = 0, sV = 0, eP = 0, sP = 0
  for (const h of HOLDINGS) {
    const q = quotes[h.sym]
    if (!q || !q.price) continue
    const v = q.price * h.shares
    const p = q.prev  * h.shares
    if (h.type === 'etf') { eV += v; eP += p }
    else                  { sV += v; sP += p }
  }
  return {
    eV, sV,
    tot: eV + sV,
    eD:  eP ? (eV - eP) / eP * 100 : 0,
    sD:  sP ? (sV - sP) / sP * 100 : 0,
    eDa: eV - eP,
    sDa: sV - sP,
  }
}

export default function Dashboard() {
  const [tab,         setTab        ] = useState<Tab>('Holdings')
  const [quotes,      setQuotes     ] = useState<QuoteMap>({})
  const [status,      setStatus     ] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [lastUpdated, setLastUpdated] = useState('')
  const [errorMsg,    setErrorMsg   ] = useState('')

  const fetchQuotes = useCallback(async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      const res  = await fetch('/api/quotes', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok || data.error) {
        setErrorMsg(data.error || `HTTP ${res.status}`)
        setStatus('error')
        return
      }

      if (data.quotes && Object.keys(data.quotes).length > 0) {
        setQuotes(data.quotes)
        setLastUpdated(new Date(data.fetchedAt).toLocaleTimeString())
        setStatus('done')
      } else {
        setErrorMsg('API returned empty quotes — check Finnhub key')
        setStatus('error')
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error')
      setStatus('error')
    }
  }, [])

  // Fetch on mount, then every 5 minutes
  useEffect(() => {
    fetchQuotes()
    const t = setInterval(fetchQuotes, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchQuotes])

  const loading = status === 'idle' || status === 'loading'
  const p   = portCalc(quotes)
  const tDa = p.eDa + p.sDa
  const tDp = (p.tot - tDa) !== 0 ? tDa / (p.tot - tDa) * 100 : 0

  // Header status line
  const statusLine = status === 'idle'    ? 'Initializing…'
    : status === 'loading'                ? 'Fetching live data…'
    : status === 'error'                  ? `⚠ ${errorMsg}`
    : `Live · Updated ${lastUpdated} · ${Object.keys(quotes).length} symbols`

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'1rem 1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'1.25rem', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20, fontWeight:500 }}>Portfolio dashboard</span>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999,
              background:'#eeedfe', color:'#3c3489', fontWeight:500 }}>Long-term</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{statusLine}</div>
        </div>
        <button onClick={fetchQuotes} disabled={loading}
          style={{ fontSize:13, padding:'6px 14px', border:'1px solid var(--border)',
            borderRadius:8, background:'transparent', color:'var(--text2)',
            opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:'1.25rem' }}>
        {/* ETF */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#185fa5', marginBottom:10 }}>ETF holdings</div>
          <div style={{ fontSize:22, fontWeight:500, marginBottom:10 }}>
            {loading ? '…' : fmt(p.eV)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            {(['Daily', 'Monthly', 'Yearly'] as const).map((lbl, i) => (
              <div key={lbl} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)',
                padding:'7px 8px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{lbl}</div>
                <div style={{ fontSize:13, fontWeight:500 }}
                  className={i === 0 ? pc(p.eD) : ''}>
                  {i === 0 ? (loading ? '…' : fp(p.eD)) : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:8 }}>
            {p.tot > 0 ? (p.eV / p.tot * 100).toFixed(1) + '% of portfolio' : '—'} · SPY, VOO, VTI
          </div>
        </div>

        {/* Stocks */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#0f6e56', marginBottom:10 }}>Stock holdings</div>
          <div style={{ fontSize:22, fontWeight:500, marginBottom:10 }}>
            {loading ? '…' : fmt(p.sV)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            {(['Daily', 'Monthly', 'Yearly'] as const).map((lbl, i) => (
              <div key={lbl} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)',
                padding:'7px 8px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{lbl}</div>
                <div style={{ fontSize:13, fontWeight:500 }}
                  className={i === 0 ? pc(p.sD) : ''}>
                  {i === 0 ? (loading ? '…' : fp(p.sD)) : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:8 }}>
            {p.tot > 0 ? (p.sV / p.tot * 100).toFixed(1) + '% of portfolio' : '—'} · AMZN, NVDA, LIFE, TSM, GOOGL
          </div>
        </div>
      </div>

      {/* ── Strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',
        gap:8, marginBottom:'1.5rem' }}>
        {[
          { lbl:'Total portfolio', val: fmt(p.tot),                           sub: fp(tDp) + ' today', cls: pc(tDp) },
          { lbl:'Day gain/loss',   val: (tDa >= 0 ? '+' : '') + fmt(tDa),    sub: 'vs yesterday',     cls: pc(tDa) },
          { lbl:'Holdings',        val: HOLDINGS.length.toString(),           sub: '5 watchlist',      cls: '' },
          { lbl:'Strategy',        val: 'Long-term',                          sub: 'Buy & hold',       cls: '' },
        ].map(m => (
          <div key={m.lbl} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase',
              letterSpacing:'.05em', marginBottom:3 }}>{m.lbl}</div>
            <div style={{ fontSize:16, fontWeight:500 }} className={m.cls}>
              {loading && m.lbl !== 'Holdings' && m.lbl !== 'Strategy' ? '…' : m.val}
            </div>
            <div style={{ fontSize:11, marginTop:2 }} className={m.cls}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)',
        marginBottom:'1.25rem', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize:13, padding:'7px 12px', background:'none', border:'none',
            borderBottom: t === tab ? '2px solid var(--text)' : '2px solid transparent',
            marginBottom:-1,
            color:      t === tab ? 'var(--text)'  : 'var(--text2)',
            fontWeight: t === tab ? 500 : 400,
            cursor: 'pointer',
          }}>
            {t}
            {t === 'Scout'       && <span style={{ fontSize:10, background:'#7f77dd', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>8</span>}
            {t === 'Buy planner' && <span style={{ fontSize:10, background:'#1d9e75', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>new</span>}
            {t === 'News'        && <span style={{ fontSize:10, background:'#d85a30', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>live</span>}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'Holdings'    && <TabHoldings  quotes={quotes} loading={loading} />}
      {tab === 'Watchlist & Analysis' && <TabWatchlist quotes={quotes} loading={loading} />}
      {tab === 'Scout'       && <TabScout     quotes={quotes} />}
      {tab === 'Buy planner' && <TabPlanner   quotes={quotes} loading={loading} />}
      {tab === 'News'        && <TabNews      quotes={quotes} />}
    </div>
  )
}
