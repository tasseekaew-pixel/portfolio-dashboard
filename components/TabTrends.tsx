'use client'
// components/TabTrends.tsx
import { useState, useEffect, useRef } from 'react'
import { HOLDINGS } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

const SYM_COLOR: Record<string, string> = {
  SPY:'#378add', VOO:'#7f77dd', VTI:'#1d9e75',
  AMZN:'#d85a30', NVDA:'#ba7517', LIFE:'#d4537e',
  TSM:'#639922', GOOGL:'#378add', AMD:'#ba7517', LLY:'#d85a30'
}

function LineChart({ sym, days }: { sym: string; days: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/history?sym=${sym}&days=${days}`)
      .then(r => r.json())
      .then(async data => {
        if (cancelled || !canvasRef.current || !data.closes?.length) return
        const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } = await import('chart.js')
        Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)
        if (chartRef.current) chartRef.current.destroy()
        const col = SYM_COLOR[sym] || '#378add'
        chartRef.current = new Chart(canvasRef.current, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [{
              data: data.closes,
              borderColor: col, backgroundColor: col + '22',
              borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` $${Number(c.raw).toFixed(2)}` } } },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } },
              y: { ticks: { font: { size: 11 }, callback: (v: any) => '$' + Number(v).toFixed(0) }, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
          }
        })
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [sym, days])

  return (
    <div style={{ position:'relative', width:'100%', height:220 }}>
      {loading && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--text3)' }}>Loading…</div>}
      <canvas ref={canvasRef} role="img" aria-label={`${sym} price trend`} />
    </div>
  )
}

function ETFComparison({ days }: { days: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(['SPY','VOO','VTI'].map(s => fetch(`/api/history?sym=${s}&days=${days}`).then(r=>r.json())))
      .then(async ([spy, voo, vti]) => {
        if (cancelled || !canvasRef.current) return
        const normalize = (arr: number[]) => arr.map(v => arr[0] ? (v - arr[0]) / arr[0] * 100 : 0)
        const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } = await import('chart.js')
        Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)
        if (chartRef.current) chartRef.current.destroy()
        const n = Math.min(spy.closes?.length??0, voo.closes?.length??0, vti.closes?.length??0)
        if (!n) return
        chartRef.current = new Chart(canvasRef.current, {
          type: 'line',
          data: {
            labels: spy.dates.slice(-n),
            datasets: [
              { label:'SPY', data: normalize(spy.closes.slice(-n)), borderColor:'#378add', borderWidth:2, pointRadius:0, tension:0.3 },
              { label:'VOO', data: normalize(voo.closes.slice(-n)), borderColor:'#7f77dd', borderWidth:2, pointRadius:0, tension:0.3 },
              { label:'VTI', data: normalize(vti.closes.slice(-n)), borderColor:'#1d9e75', borderWidth:2, pointRadius:0, tension:0.3 },
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.raw>=0?'+':''}${Number(c.raw).toFixed(2)}%` } } },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, grid: { display: false } },
              y: { ticks: { font: { size: 11 }, callback: (v: any) => (v>=0?'+':'')+Number(v).toFixed(1)+'%' }, grid: { color:'rgba(0,0,0,0.05)' } }
            }
          }
        })
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [days])

  return (
    <div style={{ position:'relative', width:'100%', height:220 }}>
      {loading && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--text3)' }}>Loading…</div>}
      <canvas ref={canvasRef} role="img" aria-label="ETF comparison" />
    </div>
  )
}

export default function TabTrends({ quotes }: { quotes: QuoteMap }) {
  const [sym, setSym] = useState('SPY')
  const [days, setDays] = useState(60)

  return (
    <div>
      {/* Price trend */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>Price trend</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <select
              value={sym}
              onChange={e => setSym(e.target.value)}
              style={{ fontSize:12, padding:'4px 8px', border:'1px solid var(--border)', borderRadius:8, background:'var(--bg)', color:'var(--text)' }}
            >
              {HOLDINGS.map(h => <option key={h.sym} value={h.sym}>{h.sym}</option>)}
            </select>
            <div style={{ display:'flex', gap:4 }}>
              {[30,60,90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{ fontSize:11, padding:'4px 9px', border:'1px solid var(--border)', borderRadius:8, background: d===days?'var(--text)':'transparent', color: d===days?'var(--bg)':'var(--text2)' }}
                >
                  {d===30?'1M':d===60?'2M':'3M'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <LineChart key={sym+days} sym={sym} days={days} />
      </div>

      {/* ETF comparison */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>ETF comparison — SPY, VOO & VTI (normalized %)</div>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:8, fontSize:11, color:'var(--text2)' }}>
          {[['SPY','#378add'],['VOO','#7f77dd'],['VTI','#1d9e75']].map(([l,c]) => (
            <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:2, background:c, display:'inline-block' }} />{l}
            </span>
          ))}
        </div>
        <ETFComparison key={'etf'+days} days={days} />
      </div>
    </div>
  )
}
