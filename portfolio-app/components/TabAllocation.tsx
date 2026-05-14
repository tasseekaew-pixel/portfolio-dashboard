'use client'
// components/TabAllocation.tsx
import { useEffect, useRef } from 'react'
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }

export default function TabAllocation({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  let eV=0, sV=0
  for (const h of HOLDINGS) {
    const q = quotes[h.sym]
    if (!q) continue
    const v = q.price * h.shares
    if (h.type === 'etf') eV += v; else sV += v
  }
  const tot = eV + sV
  const etfPct = tot ? eV / tot * 100 : 50
  const stkPct = 100 - etfPct
  const diff = etfPct - 60

  let msg = '', mc = ''
  if (Math.abs(diff) < 2) { msg = '✓ Well balanced near 60/40 target.'; mc = '#1d9e75' }
  else if (diff < 0) { const n = (0.6*tot - eV).toFixed(0); msg = `ETF ${Math.abs(diff).toFixed(1)}% below target. Add ~$${Number(n).toLocaleString()} in ETFs.`; mc = '#d64045' }
  else { const n = (sV - 0.4*tot).toFixed(0); msg = `Stocks below target. Add ~$${Number(n).toLocaleString()} in stocks.`; mc = '#e06c00' }

  const COLORS = ['#d85a30','#378add','#7f77dd','#1d9e75','#ba7517','#d4537e','#639922','#888780']

  useEffect(() => {
    if (!canvasRef.current) return
    const labels = HOLDINGS.map(h => h.sym)
    const vals = HOLDINGS.map(h => (quotes[h.sym]?.price ?? 0) * h.shares)
    if (vals.every(v => v === 0)) return

    import('chart.js').then(({ Chart, ArcElement, Tooltip, Legend }) => {
      Chart.register(ArcElement, Tooltip, Legend)
      if (chartRef.current) chartRef.current.destroy()
      chartRef.current = new Chart(canvasRef.current!, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: vals, backgroundColor: COLORS, borderWidth: 2, borderColor: 'transparent' }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${fmt(c.raw)}` } }
          },
          cutout: '65%'
        }
      })
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [quotes])

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
      {/* Split bar */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>ETF vs stock split</div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:6 }}>
          <span>ETF</span><span>Stocks</span>
        </div>
        <div style={{ height:10, background:'var(--bg2)', borderRadius:5, overflow:'hidden', marginBottom:8 }}>
          <div style={{ height:'100%', borderRadius:5, background:'#378add', width: etfPct.toFixed(1)+'%' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:13, fontWeight:500, color:'#185fa5' }}>{etfPct.toFixed(1)}%</span>
          <span style={{ fontSize:13, fontWeight:500, color:'#0f6e56' }}>{stkPct.toFixed(1)}%</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:14 }}>
          <span>Target: 60%</span><span>Target: 40%</span>
        </div>
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Rebalance guidance</div>
          <div style={{ fontSize:13, color: mc }}>{loading ? '—' : msg}</div>
        </div>
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginTop:12 }}>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Values</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
            <span style={{ color:'var(--text2)' }}>ETF: <strong style={{ color:'var(--text)' }}>{loading?'—':fmt(eV)}</strong></span>
            <span style={{ color:'var(--text2)' }}>Stocks: <strong style={{ color:'var(--text)' }}>{loading?'—':fmt(sV)}</strong></span>
          </div>
        </div>
      </div>

      {/* Donut */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>Holdings by value</div>
        <div style={{ position:'relative', width:'100%', height:200 }}>
          <canvas ref={canvasRef} role="img" aria-label="Holdings donut chart" />
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12, fontSize:11, color:'var(--text2)' }}>
          {HOLDINGS.map((h, i) => (
            <span key={h.sym} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:2, background: COLORS[i], display:'inline-block' }} />
              {h.sym}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
