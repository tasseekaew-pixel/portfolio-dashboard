'use client'
import React from 'react'
import '@/components/ChartSetup'
import { Doughnut } from 'react-chartjs-2'
import { HOLDINGS } from '@/lib/data'
import { TARGET_ETF_PCT, TARGET_STOCK_PCT } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number)  { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function pc(n: number)  { return n >= 0 ? '#1d9e75' : '#d64045' }

const DONUT_COLORS = ['#d85a30','#378add','#7f77dd','#1d9e75','#ba7517','#d4537e','#639922','#888780','#c97a2a','#5b6abf']

export default function TabHoldings({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {

  // ── Custom purchases from Buy Planner ──────────────────────────────────────
  const [customH, setCustomH] = React.useState<{sym:string;name:string;shares:number;type:string}[]>([])
  React.useEffect(() => {
    try {
      const s = localStorage.getItem('portfolio_custom_holdings_v1')
      if (s) setCustomH(JSON.parse(s))
    } catch {}
  }, [])

  // Merge static + custom
  const merged = [...HOLDINGS].map(h => ({ ...h })) // shallow copy to avoid mutation
  customH.forEach(ch => {
    const idx = merged.findIndex(h => h.sym === ch.sym)
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], shares: parseFloat((merged[idx].shares + ch.shares).toFixed(6)) }
    } else {
      merged.push({ sym: ch.sym, shares: ch.shares, type: ch.type as 'stock'|'etf', name: ch.name })
    }
  })

  const stocks     = merged.filter(h => h.type === 'stock')
  const etfs       = merged.filter(h => h.type === 'etf')
  const stockTotal = stocks.reduce((s,h) => s + (quotes[h.sym]?.price ?? 0) * h.shares, 0)
  const etfTotal   = etfs.reduce((s,h)   => s + (quotes[h.sym]?.price ?? 0) * h.shares, 0)
  const grandTotal = stockTotal + etfTotal

  const etfPct = grandTotal > 0 ? etfTotal / grandTotal * 100 : 0
  const stkPct = 100 - etfPct
  const diff   = etfPct - TARGET_ETF_PCT

  let rebalMsg = '', rebalColor = ''
  if (grandTotal === 0) {
    rebalMsg = 'Loading…'; rebalColor = 'var(--text3)'
  } else if (Math.abs(diff) < 2) {
    rebalMsg = `✓ Well balanced near ${TARGET_ETF_PCT}/${TARGET_STOCK_PCT} target.`
    rebalColor = '#1d9e75'
  } else if (diff < 0) {
    const need = (TARGET_ETF_PCT/100 * grandTotal - etfTotal).toFixed(0)
    rebalMsg = `ETF ${Math.abs(diff).toFixed(1)}% below target. Add ~$${Number(need).toLocaleString()} in ETFs.`
    rebalColor = '#d64045'
  } else {
    const need = (stockTotal - TARGET_STOCK_PCT/100 * grandTotal).toFixed(0)
    rebalMsg = `Stocks below target. Add ~$${Number(need).toLocaleString()} in stocks.`
    rebalColor = '#e06c00'
  }

  // Donut data — all holdings by value
  const donutLabels = merged.map(h => h.sym)
  const donutVals   = merged.map(h => (quotes[h.sym]?.price ?? 0) * h.shares)

  // ── Stock card ─────────────────────────────────────────────────────────────
  function StockCard({ h }: { h: typeof merged[0] }) {
    const q   = quotes[h.sym]
    const val = (q?.price ?? 0) * h.shares
    const pct = stockTotal > 0 ? val / stockTotal * 100 : 0
    return (
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:500 }}>{h.sym}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{h.name}</div>
          </div>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, fontWeight:500,
            background:'#e1f5ee', color:'#0f6e56' }}>Stock</span>
        </div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading ? '—' : fmt(q?.price ?? 0)}</div>
        <div style={{ fontSize:12, color: q ? pc(q.pct) : 'var(--text3)' }}>
          {q ? (q.pct >= 0 ? '▲' : '▼') + ' ' + fp(q.pct) + ' today' : '—'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
          borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
          <span style={{ color:'var(--text2)' }}>{h.shares.toFixed(5)} sh</span>
          <strong>{loading ? '—' : fmt(val)}</strong>
        </div>
        <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginTop:8 }}>
          <div style={{ height:'100%', borderRadius:3, background:'#1d9e75', width: pct.toFixed(1)+'%' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11 }}>
          <span style={{ color:'var(--text3)' }}>% of stocks</span>
          <span style={{ fontWeight:500, color:'#0f6e56' }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
    )
  }

  // ── ETF card ───────────────────────────────────────────────────────────────
  function EtfCard({ h }: { h: typeof merged[0] }) {
    const q   = quotes[h.sym]
    const val = (q?.price ?? 0) * h.shares
    return (
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:500 }}>{h.sym}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{h.name}</div>
          </div>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, fontWeight:500,
            background:'#e6f1fb', color:'#185fa5' }}>ETF</span>
        </div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading ? '—' : fmt(q?.price ?? 0)}</div>
        <div style={{ fontSize:12, color: q ? pc(q.pct) : 'var(--text3)' }}>
          {q ? (q.pct >= 0 ? '▲' : '▼') + ' ' + fp(q.pct) + ' today' : '—'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
          borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
          <span style={{ color:'var(--text2)' }}>{h.shares.toFixed(5)} sh</span>
          <strong>{loading ? '—' : fmt(val)}</strong>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Allocation section ─────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:'1.75rem' }}>

        {/* Left: ETF/Stock split + rebalance */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)',
            textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>
            Portfolio allocation
          </div>

          {/* Split bar */}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
            color:'var(--text2)', marginBottom:6 }}>
            <span>ETF</span><span>Stocks</span>
          </div>
          <div style={{ height:10, background:'var(--bg2)', borderRadius:5,
            overflow:'hidden', marginBottom:8 }}>
            <div style={{ height:'100%', borderRadius:5, background:'#378add',
              width: etfPct.toFixed(1)+'%', transition:'width .5s ease' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:15, fontWeight:600, color:'#185fa5' }}>{etfPct.toFixed(1)}%</span>
            <span style={{ fontSize:15, fontWeight:600, color:'#0f6e56' }}>{stkPct.toFixed(1)}%</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11,
            color:'var(--text3)', marginBottom:16 }}>
            <span>Target {TARGET_ETF_PCT}%</span><span>Target {TARGET_STOCK_PCT}%</span>
          </div>

          {/* Value breakdown */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
            {[['ETF', etfTotal, '#185fa5'], ['Stocks', stockTotal, '#0f6e56']].map(([lbl,val,col]) => (
              <div key={lbl as string} style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase',
                  letterSpacing:'.05em', marginBottom:4 }}>{lbl}</div>
                <div style={{ fontSize:15, fontWeight:600, color: col as string }}>
                  {loading ? '—' : fmt(val as number)}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                  {grandTotal > 0 ? ((val as number)/grandTotal*100).toFixed(1)+'%' : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Rebalance guidance */}
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:5 }}>Rebalance guidance</div>
            <div style={{ fontSize:13, color: rebalColor, lineHeight:1.5 }}>{rebalMsg}</div>
          </div>
        </div>

        {/* Right: Donut chart */}
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)',
            textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>
            Holdings by value
          </div>
          {grandTotal > 0 ? (
            <>
              <div style={{ position:'relative', height:190 }}>
                <Doughnut
                  data={{
                    labels: donutLabels,
                    datasets: [{ data: donutVals, backgroundColor: DONUT_COLORS,
                      borderWidth: 2, borderColor: 'transparent' }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, cutout: '65%',
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${fmt(c.raw)}` } },
                    },
                  }}
                />
                {/* Center total */}
                <div style={{ position:'absolute', inset:0, display:'flex',
                  flexDirection:'column', alignItems:'center', justifyContent:'center',
                  pointerEvents:'none' }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Total</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{fmt(grandTotal)}</div>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:12 }}>
                {donutLabels.map((l, i) => (
                  <span key={l} style={{ display:'flex', alignItems:'center', gap:4,
                    fontSize:11, color:'var(--text2)' }}>
                    <span style={{ width:8, height:8, borderRadius:2, flexShrink:0,
                      background: DONUT_COLORS[i % DONUT_COLORS.length], display:'inline-block' }} />
                    {l}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height:190, display:'flex', alignItems:'center',
              justifyContent:'center', color:'var(--text3)', fontSize:13 }}>
              Loading…
            </div>
          )}
        </div>
      </div>

      {/* ── Holdings cards ─────────────────────────────────────────────────── */}
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)',
        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        Stocks{' '}
        <span style={{ fontWeight:400, textTransform:'none' }}>
          — {loading ? '…' : fmt(stockTotal)} total · bars show % of stock holdings
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',
        gap:10, marginBottom:'1.5rem' }}>
        {stocks.map(h => <StockCard key={h.sym} h={h} />)}
      </div>

      <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)',
        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        ETFs{' '}
        <span style={{ fontWeight:400, textTransform:'none' }}>
          — {loading ? '…' : fmt(etfTotal)} total
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10 }}>
        {etfs.map(h => <EtfCard key={h.sym} h={h} />)}
      </div>
    </div>
  )
}
