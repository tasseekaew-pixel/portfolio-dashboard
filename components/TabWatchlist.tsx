'use client'
import '@/components/ChartSetup'
import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { WATCHLIST } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }

const WL_COLOR: Record<string, string> = {
  AMD:'#ba7517', NVDA:'#7f77dd', TSM:'#1d9e75', GOOGL:'#378add', LLY:'#d85a30'
}

function SparkChart({ sym, color }: { sym: string; color: string }) {
  const [chartData, setChartData] = useState<{ closes: number[]; dates: string[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(d => {
        if (d.error || !d.closes?.length) { setError(d.error || 'No data'); return }
        setChartData(d)
      })
      .catch(e => setError(e.message))
  }, [sym])

  if (error) return <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#d64045' }}>{error}</div>
  if (!chartData) return <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#999' }}>Loading…</div>

  return (
    <div style={{ height:160 }}>
      <Line
        data={{
          labels: chartData.dates,
          datasets: [{
            data: chartData.closes,
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: true,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` $${Number(c.raw).toFixed(2)}` } } },
          scales: {
            x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { font: { size: 10 }, callback: (v: any) => '$' + Number(v).toFixed(0) }, grid: { color: 'rgba(0,0,0,0.05)' } },
          },
        }}
      />
    </div>
  )
}

export default function TabWatchlist({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  return (
    <div>
      {/* Quote cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginBottom:'1.25rem' }}>
        {WATCHLIST.map(w => {
          const q = quotes[w.sym]
          return (
            <div key={w.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:500 }}>{w.sym}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{w.name}</div>
                </div>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, fontWeight:500, background:'#faeeda', color:'#854f0b' }}>Watchlist</span>
              </div>
              <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading || !q ? '—' : fmt(q.price)}</div>
              <div style={{ fontSize:12, color: (q?.pct ?? 0) >= 0 ? '#1d9e75' : '#d64045' }}>
                {q ? (q.pct >= 0 ? '▲' : '▼') + ' ' + fp(q.pct) + ' today' : '—'}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
                <span style={{ color:'var(--text2)' }}>Prev close: {q ? fmt(q.prev) : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>30-day price trends</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
        {WATCHLIST.map(w => {
          const q = quotes[w.sym]
          return (
            <div key={w.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:6 }}>
                <div style={{ fontSize:14, fontWeight:500 }}>{w.sym} — {w.name}</div>
                <span style={{ fontSize:13, fontWeight:500, color: (q?.pct ?? 0) >= 0 ? '#1d9e75' : '#d64045' }}>
                  {q ? fp(q.pct) + ' today' : '—'}
                </span>
              </div>
              <SparkChart sym={w.sym} color={WL_COLOR[w.sym] || '#888'} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
