'use client'
// components/TabHoldings.tsx
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }
function pc(n: number) { return n>=0 ? '#1d9e75' : '#d64045' }

export default function TabHoldings({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const stocks = HOLDINGS.filter(h => h.type === 'stock')
  const etfs   = HOLDINGS.filter(h => h.type === 'etf')
  const stockTotal = stocks.reduce((s,h) => s + (quotes[h.sym]?.price ?? 0) * h.shares, 0)

  function StockCard({ h }: { h: typeof HOLDINGS[0] }) {
    const q = quotes[h.sym]
    const val = (q?.price ?? 0) * h.shares
    const pctOfStocks = stockTotal > 0 ? val / stockTotal * 100 : 0
    return (
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:500 }}>{h.sym}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{h.name}</div>
          </div>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, fontWeight:500, background:'#e1f5ee', color:'#0f6e56' }}>Stock</span>
        </div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading ? '—' : fmt(q?.price ?? 0)}</div>
        <div style={{ fontSize:12, color: q ? pc(q.pct) : 'var(--text3)' }}>
          {q ? (q.pct >= 0 ? '▲' : '▼') + ' ' + fp(q.pct) + ' today' : '—'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
          <span style={{ color:'var(--text2)' }}>{h.shares.toFixed(5)} shares</span>
          <strong>{loading ? '—' : fmt(val)}</strong>
        </div>
        <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginTop:8 }}>
          <div style={{ height:'100%', borderRadius:3, background:'#1d9e75', width: pctOfStocks.toFixed(1) + '%' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11 }}>
          <span style={{ color:'var(--text3)' }}>% of stocks</span>
          <span style={{ fontWeight:500, color:'#0f6e56' }}>{pctOfStocks.toFixed(1)}%</span>
        </div>
      </div>
    )
  }

  function EtfCard({ h }: { h: typeof HOLDINGS[0] }) {
    const q = quotes[h.sym]
    const val = (q?.price ?? 0) * h.shares
    return (
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:500 }}>{h.sym}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{h.name}</div>
          </div>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, fontWeight:500, background:'#e6f1fb', color:'#185fa5' }}>ETF</span>
        </div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading ? '—' : fmt(q?.price ?? 0)}</div>
        <div style={{ fontSize:12, color: q ? pc(q.pct) : 'var(--text3)' }}>
          {q ? (q.pct >= 0 ? '▲' : '▼') + ' ' + fp(q.pct) + ' today' : '—'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
          <span style={{ color:'var(--text2)' }}>{h.shares.toFixed(5)} shares</span>
          <strong>{loading ? '—' : fmt(val)}</strong>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        Stocks <span style={{ fontWeight:400 }}>— {fmt(stockTotal)} total · bars show % of stock holdings</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:'1.5rem' }}>
        {stocks.map(h => <StockCard key={h.sym} h={h} />)}
      </div>
      <div style={{ fontSize:11, fontWeight:500, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>ETFs</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
        {etfs.map(h => <EtfCard key={h.sym} h={h} />)}
      </div>
    </div>
  )
}
