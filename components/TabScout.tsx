'use client'
import '@/components/ChartSetup'
import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import { SCOUT } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }

function Spark({ sym, color }: { sym: string; color: string }) {
  const [cd, setCd] = useState<{ closes: number[]; dates: string[] } | null>(null)

  useEffect(() => {
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(d => { if (d.closes?.length) setCd(d) })
      .catch(() => {})
  }, [sym])

  if (!cd) return <div style={{ height:68, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#999' }}>Loading…</div>

  const sma = cd.closes.map((_, i, a) => {
    if (i < 6) return null
    const sl = a.slice(i - 6, i + 1)
    return sl.reduce((s, v) => s + v, 0) / sl.length
  })

  return (
    <div style={{ height:68, margin:'8px 0' }}>
      <Line
        data={{
          labels: cd.dates,
          datasets: [
            { data: cd.closes, borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true },
            { data: sma, borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderDash: [3, 2], pointRadius: 0, fill: false },
          ],
        }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` $${Number(c.raw).toFixed(2)}` } } },
          scales: { x: { display: false }, y: { display: false } },
        }}
      />
    </div>
  )
}

export default function TabScout({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [filter, setFilter] = useState('all')
  const [histories, setHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    SCOUT.forEach(s => {
      fetch(`/api/history?sym=${s.sym}&days=30`)
        .then(r => r.json())
        .then(d => { if (d.closes?.length) setHistories(prev => ({ ...prev, [s.sym]: d.closes })) })
        .catch(() => {})
    })
  }, [])

  const scored = SCOUT.map(s => {
    const q = quotes[s.sym]
    const h = histories[s.sym] || []
    const price = q?.price || s.tgt * 0.9
    const sc = ltScore({ price, history: h, revG: s.revG, moPct: s.moPct, yrPct: s.yrPct, tgt: s.tgt })
    return { ...s, q, price, ...sc }
  }).sort((a, b) => b.score - a.score)

  const filtered = filter === 'all' ? scored : scored.filter(s => s.sec.toLowerCase().includes(filter))

  return (
    <div>
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Stock scout — long-term candidates</strong> · 8 stocks scored for <strong style={{ color:'var(--text)' }}>buy-and-hold suitability</strong>. Live prices on each refresh. Not financial advice.
      </div>

      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text2)' }}>Filter:</span>
        {[['all', `All (${scored.length})`], ['ai', 'AI'], ['fin', 'Financials'], ['con', 'Consumer']].map(([f, lbl]) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)', borderRadius:999,
              background: f === filter ? '#111' : 'transparent',
              color: f === filter ? '#fff' : 'var(--text2)' }}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:12 }}>
        {filtered.map(s => {
          const bc = s.score >= 70 ? '#1d9e75' : s.score >= 50 ? '#e06c00' : '#888'
          const vrd = s.score >= 70 ? 'Strong long-term buy' : s.score >= 50 ? 'Good accumulate candidate' : 'Wait for pullback'
          const badgeStyle = s.score >= 70 ? { background:'#e1f5ee', color:'#0f6e56' }
            : s.score >= 50 ? { background:'#faeeda', color:'#854f0b' }
            : { background:'#f4f4f4', color:'#666' }
          const upsPct = s.tgt && s.price ? (s.tgt - s.price) / s.price * 100 : s.upside

          return (
            <div key={s.sym} style={{ background:'var(--bg)', border: s.topPick ? '1.5px solid #1d9e75' : '1px solid var(--border)', borderRadius:'var(--radius)', padding:16, position:'relative' }}>
              {s.topPick && (
                <div style={{ position:'absolute', top:-1, right:14, background:'#1d9e75', color:'#fff', fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:'0 0 6px 6px' }}>
                  Top pick
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:500 }}>{s.sym}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{s.name}</div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, fontWeight:500, marginTop:5, display:'inline-block', background:'#eeedfe', color:'#3c3489' }}>{s.sec}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:15, fontWeight:500 }}>{s.q ? fmt(s.q.price) : '—'}</div>
                  <div style={{ fontSize:12, color: (s.q?.pct ?? 0) >= 0 ? '#1d9e75' : '#d64045' }}>{s.q ? fp(s.q.pct) : '—'} today</div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Target: {fmt(s.tgt)}</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom:10 }}>
                {[['1M', fp(s.moPct)], ['1Y', fp(s.yrPct)], ['Rev', '+' + s.revG + '%'], ['Upside', (upsPct >= 0 ? '+' : '') + upsPct.toFixed(1) + '%']].map(([l, v]) => (
                  <div key={l} style={{ background:'var(--bg2)', borderRadius:8, padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2, textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:12, fontWeight:500, color: (l === 'Rev') ? '#1d9e75' : (parseFloat(v) >= 0 ? '#1d9e75' : '#d64045') }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>
                RSI {s.rsi.toFixed(0)} {s.rsi > 70 ? '— overbought (consider waiting)' : s.rsi < 35 ? '— oversold (potential entry)' : '— healthy range'}
              </div>

              <Spark sym={s.sym} color={bc} />

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, color:'var(--text3)' }}>Long-term score</span>
                <span style={{ fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:999, ...badgeStyle }}>{vrd} · {s.score}/100</span>
              </div>
              <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:8 }}>
                <div style={{ height:'100%', borderRadius:3, background: bc, width: s.score + '%', transition:'width .4s ease' }} />
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.55, borderTop:'1px solid var(--border)', paddingTop:8 }} dangerouslySetInnerHTML={{ __html: s.why }} />
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5, marginTop:'1rem' }}>
        Prices live from Finnhub. Analyst targets based on consensus May 2026. Verify before investing. Not financial advice.
      </div>
    </div>
  )
}
