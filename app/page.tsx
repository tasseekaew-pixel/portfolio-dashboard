'use client'
// app/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { HOLDINGS, WATCHLIST, SCOUT } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import TabHoldings from '@/components/TabHoldings'
import TabAllocation from '@/components/TabAllocation'
import TabTrends from '@/components/TabTrends'
import TabWatchlist from '@/components/TabWatchlist'
import TabAnalysis from '@/components/TabAnalysis'
import TabScout from '@/components/TabScout'
import TabPlanner from '@/components/TabPlanner'
import TabNews from '@/components/TabNews'

export type QuoteMap = Record<string, {
  price: number; prev: number; pct: number; change: number; high: number; low: number;
}>

const TABS = ['Holdings','Allocation','Trends','Watchlist','Analysis','Scout','Buy planner','News'] as const
type Tab = typeof TABS[number]

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fp(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function pc(n: number) { return n >= 0 ? 'pos' : 'neg' }

function portCalc(quotes: QuoteMap) {
  let eV=0,sV=0,eP=0,sP=0,eM=0,sM=0
  for (const h of HOLDINGS) {
    const q = quotes[h.sym]
    if (!q) continue
    const v = q.price * h.shares
    const p = q.prev * h.shares
    if (h.type === 'etf') { eV += v; eP += p }
    else { sV += v; sP += p }
  }
  return {
    eV, sV, tot: eV + sV,
    eD: eP ? (eV - eP) / eP * 100 : 0,
    sD: sP ? (sV - sP) / sP * 100 : 0,
    eDa: eV - eP, sDa: sV - sP,
  }
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('Holdings')
  const [quotes, setQuotes] = useState<QuoteMap>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [error, setError] = useState<string>('')

  const fetchQuotes = useCallback(async () => {
    try {
      setError('')
      const res = await fetch('/api/quotes')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setQuotes(data.quotes)
      setLastUpdated(new Date(data.fetchedAt).toLocaleTimeString())
    } catch (e) {
      setError('Failed to fetch live prices. Check your API key.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuotes()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchQuotes, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchQuotes])

  const p = portCalc(quotes)
  const tDa = p.eDa + p.sDa
  const tDp = (p.tot - tDa) ? tDa / (p.tot - tDa) * 100 : 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.25rem' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20, fontWeight:500 }}>Portfolio dashboard</span>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:'#eeedfe', color:'#3c3489', fontWeight:500 }}>Long-term</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
            {loading ? 'Fetching live data…' : error ? '⚠ ' + error : `Live · Updated ${lastUpdated}`}
          </div>
        </div>
        <button
          onClick={fetchQuotes}
          disabled={loading}
          style={{ fontSize:13, padding:'6px 14px', border:'1px solid var(--border)', borderRadius:8, background:'transparent', color:'var(--text2)', display:'flex', alignItems:'center', gap:6 }}
        >
          {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:'1.25rem' }}>
        {/* ETF card */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em', color:'#185fa5', marginBottom:10 }}>ETF holdings</div>
          <div style={{ fontSize:22, fontWeight:500, marginBottom:10 }}>{loading ? '…' : fmt(p.eV)}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            {[['Daily', p.eD], ['Monthly', null], ['Yearly', null]].map(([lbl, val]) => (
              <div key={lbl as string} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'7px 8px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{lbl}</div>
                <div style={{ fontSize:13, fontWeight:500 }} className={val != null ? pc(val as number) : ''}>
                  {val != null ? fp(val as number) : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:8 }}>
            {p.tot > 0 ? (p.eV / p.tot * 100).toFixed(1) : '—'}% of portfolio · SPY, VOO, VTI
          </div>
        </div>

        {/* Stock card */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em', color:'#0f6e56', marginBottom:10 }}>Stock holdings</div>
          <div style={{ fontSize:22, fontWeight:500, marginBottom:10 }}>{loading ? '…' : fmt(p.sV)}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            {[['Daily', p.sD], ['Monthly', null], ['Yearly', null]].map(([lbl, val]) => (
              <div key={lbl as string} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'7px 8px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{lbl}</div>
                <div style={{ fontSize:13, fontWeight:500 }} className={val != null ? pc(val as number) : ''}>
                  {val != null ? fp(val as number) : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:8 }}>
            {p.tot > 0 ? (p.sV / p.tot * 100).toFixed(1) : '—'}% of portfolio · AMZN, NVDA, LIFE, TSM, GOOGL
          </div>
        </div>
      </div>

      {/* Strip metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:8, marginBottom:'1.5rem' }}>
        {[
          { lbl:'Total portfolio', val: fmt(p.tot), sub: fp(tDp) + ' today', subCls: pc(tDp) },
          { lbl:'Day gain/loss', val: (tDa >= 0 ? '+' : '') + fmt(tDa), sub:'vs yesterday', subCls: pc(tDa) },
          { lbl:'Holdings', val:'8', sub:'5 watchlist', subCls:'' },
          { lbl:'Strategy', val:'Long-term', sub:'Buy & hold', subCls:'' },
        ].map(m => (
          <div key={m.lbl} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{m.lbl}</div>
            <div style={{ fontSize:16, fontWeight:500 }} className={m.subCls}>{loading ? '…' : m.val}</div>
            <div style={{ fontSize:11, marginTop:2 }} className={m.subCls}>{loading ? '' : m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:'1.25rem', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize:13, padding:'7px 12px', background:'none',
              border:'none', borderBottom: t === tab ? '2px solid var(--text)' : '2px solid transparent',
              marginBottom:-1, color: t === tab ? 'var(--text)' : 'var(--text2)',
              fontWeight: t === tab ? 500 : 400,
            }}
          >
            {t}
            {t === 'Scout' && <span style={{ fontSize:10, background:'var(--purple)', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>8</span>}
            {t === 'Buy planner' && <span style={{ fontSize:10, background:'var(--green)', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>new</span>}
            {t === 'News' && <span style={{ fontSize:10, background:'#d85a30', color:'#fff', padding:'1px 6px', borderRadius:999, marginLeft:4 }}>live</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Holdings'    && <TabHoldings quotes={quotes} loading={loading} />}
      {tab === 'Allocation'  && <TabAllocation quotes={quotes} loading={loading} />}
      {tab === 'Trends'      && <TabTrends quotes={quotes} />}
      {tab === 'Watchlist'   && <TabWatchlist quotes={quotes} loading={loading} />}
      {tab === 'Analysis'    && <TabAnalysis quotes={quotes} loading={loading} />}
      {tab === 'Scout'       && <TabScout quotes={quotes} loading={loading} />}
      {tab === 'Buy planner' && <TabPlanner quotes={quotes} loading={loading} />}
      {tab === 'News'        && <TabNews quotes={quotes} />}
    </div>
  )
}
