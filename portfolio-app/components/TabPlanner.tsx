'use client'
// components/TabPlanner.tsx
import { useState, useEffect } from 'react'
import { WATCHLIST, SCOUT } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }

export default function TabPlanner({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [amount, setAmount] = useState(1000)
  const [filter, setFilter] = useState<'all'|'watchlist'|'scout'>('all')
  const [histories, setHistories] = useState<Record<string,number[]>>({})

  // Preload history for all candidates
  useEffect(() => {
    const allSyms = [...new Set([...WATCHLIST.map(w=>w.sym), ...SCOUT.map(s=>s.sym)])]
    allSyms.forEach(sym => {
      fetch(`/api/history?sym=${sym}&days=30`)
        .then(r => r.json())
        .then(data => {
          if (data.closes?.length) setHistories(prev => ({...prev, [sym]: data.closes}))
        })
    })
  }, [])

  const allCandidates = [
    ...WATCHLIST.map(w => ({ sym:w.sym, name:w.name, type:'watchlist' as const, revG:w.revG, moPct:w.moPct, yrPct:w.yrPct, tgt:w.tgt, why:w.why })),
    ...SCOUT.map(s =>    ({ sym:s.sym, name:s.name, type:'scout' as const,     revG:s.revG, moPct:s.moPct, yrPct:s.yrPct, tgt:s.tgt, why:s.why })),
  ]

  const filtered = filter === 'all' ? allCandidates : allCandidates.filter(c => c.type === filter)

  const scored = filtered.map(c => {
    const q = quotes[c.sym]
    const h = histories[c.sym] || []
    const price = q?.price || 1
    const sc = ltScore({ price, history: h, revG: c.revG, moPct: c.moPct, yrPct: c.yrPct, tgt: c.tgt })
    return { ...c, price, q, ...sc }
  }).sort((a,b) => b.score - a.score).slice(0, 6)

  const totalScore = scored.reduce((s,c) => s + Math.max(c.score,1), 0)
  const allocations = scored.map(c => ({
    dollars: Math.round(amount * Math.max(c.score,1) / totalScore),
    pct: Math.max(c.score,1) / totalScore * 100,
  }))
  const totalAlloc = allocations.reduce((s,a) => s + a.dollars, 0)

  return (
    <div>
      {/* Input card */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:18, marginBottom:'1.25rem' }}>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>How much do you want to invest?</div>
        <div style={{ fontSize:28, fontWeight:500, marginBottom:10 }}>{fmt(amount)}</div>
        <input
          type="range" min={100} max={10000} step={100} value={amount}
          onChange={e => setAmount(Number(e.target.value))}
          style={{ width:'100%', marginBottom:12 }}
        />
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {[250,500,1000,2500,5000,10000].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)', borderRadius:999, background: v===amount?'#7f77dd':'transparent', color: v===amount?'#fff':'var(--text2)' }}>
              ${v >= 1000 ? v/1000+'k' : v}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', paddingTop:12, borderTop:'1px solid var(--border)' }}>
          <span style={{ fontSize:12, color:'var(--text2)' }}>Show:</span>
          {(['all','watchlist','scout'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)', borderRadius:999, background: f===filter?'var(--text)':'transparent', color: f===filter?'var(--bg)':'var(--text2)' }}>
              {f==='all'?'All candidates':f==='watchlist'?'Watchlist only':'Scout only'}
            </button>
          ))}
        </div>
      </div>

      {/* Total row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg2)', borderRadius:'var(--radius-sm)', marginBottom:'1rem', fontSize:13 }}>
        <div><strong>${amount.toLocaleString()}</strong> across {scored.length} picks</div>
        {amount - totalAlloc > 0 && <div style={{ color:'var(--text2)', fontSize:12 }}>${amount-totalAlloc} unallocated (rounding)</div>}
      </div>

      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        Allocation is <strong style={{ color:'var(--text)' }}>weighted by long-term score</strong> — stronger setups receive a larger share. For volatile picks, consider splitting across 2–3 months (DCA).
      </div>

      {/* Allocation cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))', gap:12 }}>
        {scored.map((c,i) => {
          const al = allocations[i]
          const shares = c.price > 0 ? al.dollars / c.price : 0
          const bc = c.score>=70?'#1d9e75':c.score>=50?'#e06c00':'#7f77dd'
          const upsPct = c.tgt && c.price ? (c.tgt - c.price) / c.price * 100 : c.upside
          const why2 = c.sig==='buy'
            ? `Strong long-term setup — ${fp(c.yrPct)} past year, RSI ${c.rsi.toFixed(0)}, momentum positive.`
            : c.sig==='watch'
            ? `Consider DCA — split $${al.dollars.toLocaleString()} across 2–3 months. Trend building.`
            : `Trend below ideal. Smaller allocation assigned. Watch for price to reclaim 30-day average.`

          return (
            <div key={c.sym} style={{ background:'var(--bg)', border: i===0?'1.5px solid #1d9e75':'1px solid var(--border)', borderRadius:'var(--radius)', padding:14, position:'relative' }}>
              <div style={{ position:'absolute', top:12, right:12, width:22, height:22, borderRadius:'50%', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, color:'var(--text2)' }}>
                {i+1}
              </div>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:500 }}>{c.sym}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                    {c.name}{' '}
                    <span style={{ fontSize:11, padding:'1px 7px', borderRadius:999, fontWeight:500, background: c.type==='watchlist'?'#faeeda':'#eeedfe', color: c.type==='watchlist'?'#854f0b':'#3c3489' }}>
                      {c.type==='watchlist'?'Watchlist':'Scout'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:20, fontWeight:500 }}>${al.dollars.toLocaleString()}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>{al.pct.toFixed(1)}% of budget</div>
                </div>
              </div>
              <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', margin:'6px 0 8px' }}>
                <div style={{ height:'100%', borderRadius:3, background:bc, width:al.pct.toFixed(1)+'%' }} />
              </div>
              {[
                ['Price per share', c.q ? fmt(c.q.price) : '—'],
                ['Shares to buy', shares >= 1 ? shares.toFixed(3) : shares.toFixed(5)],
                ['1Y return', fp(c.yrPct)],
                ['Analyst upside', upsPct>=0?'+'+upsPct.toFixed(1)+'%':upsPct.toFixed(1)+'%'],
              ].map(([lbl,val])=>(
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginTop:4 }}>
                  <span style={{ color:'var(--text2)' }}>{lbl}</span>
                  <strong style={{ color: lbl==='1Y return'?((c.yrPct>=0)?'#1d9e75':'#d64045'):'var(--text)' }}>{val}</strong>
                </div>
              ))}
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)', lineHeight:1.5 }}>
                <strong style={{ color:'var(--text)' }}>Why:</strong> {why2}
                {c.revG > 15 && ` Revenue growing ${c.revG}% — fundamentals support long-term hold.`}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5, marginTop:'1rem' }}>
        Allocations based on long-term score: trend, momentum, RSI, yearly return, revenue growth, analyst upside. DCA (fixed monthly investment) reduces timing risk. Verify all prices before trading. Not financial advice.
      </div>
    </div>
  )
}
