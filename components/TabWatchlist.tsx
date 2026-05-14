'use client'
// components/TabWatchlist.tsx
import { useState, useEffect, useRef } from 'react'
import { WATCHLIST } from '@/lib/data'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }

function SparkChart({ sym, color }: { sym: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cref = useRef<any>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(async data => {
        if (cancelled || !ref.current || !data.closes?.length) return
        const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } = await import('chart.js')
        Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)
        if (cref.current) cref.current.destroy()
        cref.current = new Chart(ref.current, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [{ data: data.closes, borderColor: color, backgroundColor: color+'22', borderWidth:2, pointRadius:0, tension:0.3, fill:true }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label:(c:any)=>` $${Number(c.raw).toFixed(2)}` } } },
            scales: {
              x: { ticks:{ maxTicksLimit:5, font:{size:10} }, grid:{display:false} },
              y: { ticks:{ font:{size:10}, callback:(v:any)=>'$'+Number(v).toFixed(0) }, grid:{color:'rgba(0,0,0,0.05)'} }
            }
          }
        })
      })
    return () => { cancelled=true; if(cref.current) cref.current.destroy() }
  }, [sym])
  return <div style={{ position:'relative', height:160 }}><canvas ref={ref} /></div>
}

const WL_COLOR: Record<string,string> = { AMD:'#ba7517', NVDA:'#7f77dd', TSM:'#1d9e75', GOOGL:'#378add', LLY:'#d85a30' }

export default function TabWatchlist({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  return (
    <div>
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
              <div style={{ fontSize:18, fontWeight:500, marginBottom:2 }}>{loading||!q ? '—' : fmt(q.price)}</div>
              <div style={{ fontSize:12, color: q&&q.pct>=0?'#1d9e75':'#d64045' }}>
                {q ? (q.pct>=0?'▲':'▼') + ' ' + fp(q.pct) + ' today' : '—'}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10 }}>
                <span style={{ color:'var(--text2)' }}>Prev: {q ? fmt(q.prev) : '—'}</span>
                <span style={{ color:'var(--text2)' }}>Buy &amp; hold</span>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:13, fontWeight:500, color:'var(--text2)', marginBottom:12 }}>30-day price trends</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
        {WATCHLIST.map(w => {
          const q = quotes[w.sym]
          return (
            <div key={w.sym} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:6 }}>
                <div style={{ fontSize:14, fontWeight:500 }}>{w.sym} — 30 days</div>
                <span style={{ fontSize:13, fontWeight:500, color: q&&q.pct>=0?'#1d9e75':'#d64045' }}>{q ? fp(q.pct) : '—'} today</span>
              </div>
              <SparkChart sym={w.sym} color={WL_COLOR[w.sym]||'#888'} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
