'use client'
// components/TabScout.tsx
import { useState, useEffect, useRef } from 'react'
import { SCOUT } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }
function fp(n: number) { return (n>=0?'+':'') + n.toFixed(2) + '%' }

function Spark({ sym, color }: { sym: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cref = useRef<any>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/history?sym=${sym}&days=30`)
      .then(r => r.json())
      .then(async data => {
        if (cancelled || !ref.current || !data.closes?.length) return
        const d = data.closes
        const sm = d.map((_:any, i:number, a:number[]) => {
          if (i<6) return null
          const sl = a.slice(i-6,i+1)
          return sl.reduce((s:number,v:number)=>s+v,0)/sl.length
        })
        const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } = await import('chart.js')
        Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)
        if (cref.current) cref.current.destroy()
        cref.current = new Chart(ref.current, {
          type:'line',
          data:{labels:data.dates,datasets:[
            {data:d,borderColor:color,backgroundColor:color+'22',borderWidth:2,pointRadius:0,tension:0.3,fill:true},
            {data:sm,borderColor:'rgba(0,0,0,0.2)',borderWidth:1,borderDash:[3,2],pointRadius:0,fill:false}
          ]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(c:any)=>` $${Number(c.raw).toFixed(2)}`}}},scales:{x:{display:false},y:{display:false}},animation:{duration:0}}
        })
      })
    return () => { cancelled=true; if(cref.current) cref.current.destroy() }
  }, [sym])
  return <div style={{ position:'relative', height:68, margin:'8px 0' }}><canvas ref={ref} /></div>
}

export default function TabScout({ quotes, loading }: { quotes: QuoteMap; loading: boolean }) {
  const [filter, setFilter] = useState('all')
  const [histories, setHistories] = useState<Record<string,number[]>>({})

  useEffect(() => {
    SCOUT.forEach(s => {
      fetch(`/api/history?sym=${s.sym}&days=30`)
        .then(r => r.json())
        .then(data => {
          if (data.closes?.length) setHistories(prev => ({...prev, [s.sym]: data.closes}))
        })
    })
  }, [])

  const scored = SCOUT.map(s => {
    const q = quotes[s.sym]
    const h = histories[s.sym] || []
    const sc = ltScore({ price: q?.price || s.tgt*0.9, history: h, revG: s.revG, moPct: s.moPct, yrPct: s.yrPct, tgt: s.tgt })
    return { ...s, q, ...sc }
  }).sort((a,b) => b.score - a.score)

  const filtered = filter === 'all' ? scored : scored.filter(s => s.sec.toLowerCase().includes(filter))

  return (
    <div>
      <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'13px 16px', marginBottom:'1.25rem', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Stock scout — long-term candidates</strong> · 8 stocks scored for <strong style={{ color:'var(--text)' }}>buy-and-hold suitability</strong>. Prices update live on each refresh. Scores weight: 1-year momentum, revenue growth, analyst upside, RSI. Not financial advice.
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text2)' }}>Filter:</span>
        {['all','ai','fin','consumer'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize:12, padding:'4px 12px', border:'1px solid var(--border)', borderRadius:999, background: f===filter?'var(--text)':'transparent', color: f===filter?'var(--bg)':'var(--text2)' }}>
            {f==='all'?`All (${scored.length})`:f==='ai'?'AI':f==='fin'?'Financials':'Consumer'}
          </button>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:12 }}>
        {filtered.map(s => {
          const bc = s.score>=70?'#1d9e75':s.score>=50?'#e06c00':'#888'
          const vrd = s.score>=70?'Strong long-term buy':s.score>=50?'Good accumulate candidate':'Wait for pullback'
          const bBg = s.score>=70?'#e1f5ee':s.score>=50?'#faeeda':'#f4f4f4'
          const bTxt = s.score>=70?'#0f6e56':s.score>=50?'#854f0b':'#666'
          const upsPct = s.tgt && s.q ? (s.tgt - s.q.price) / s.q.price * 100 : s.upside
          return (
            <div key={s.sym} style={{ background:'var(--bg)', border: s.topPick?'1.5px solid #1d9e75':'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, position:'relative' }}>
              {s.topPick && <div style={{ position:'absolute', top:-1, right:14, background:'#1d9e75', color:'#fff', fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:'0 0 6px 6px' }}>Top pick</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:500 }}>{s.sym}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{s.name}</div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:999, fontWeight:500, marginTop:5, display:'inline-block', background:'#eeedfe', color:'#3c3489' }}>{s.sec}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:15, fontWeight:500 }}>{s.q ? fmt(s.q.price) : '—'}</div>
                  <div style={{ fontSize:12, color:(s.q?.pct??0)>=0?'#1d9e75':'#d64045' }}>{s.q ? fp(s.q.pct) : '—'} today</div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Target: {fmt(s.tgt)}</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom:10 }}>
                {[['1M',fp(s.moPct)],['1Y',fp(s.yrPct)],['Rev','+'+s.revG+'%'],['Upside',upsPct>=0?'+'+upsPct.toFixed(1)+'%':upsPct.toFixed(1)+'%']].map(([l,v])=>(
                  <div key={l} style={{ background:'var(--bg2)', borderRadius:'var(--radius-sm)', padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2, textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:12, fontWeight:500, color: l==='1M'||l==='1Y'||l==='Upside' ? (parseFloat(v)>=0?'#1d9e75':'#d64045') : '#1d9e75' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>
                RSI {s.rsi.toFixed(0)} {s.rsi>70?'— overbought (consider waiting)':s.rsi<35?'— oversold (potential entry)':'— healthy range'}
              </div>
              <Spark sym={s.sym} color={bc} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, color:'var(--text3)' }}>Long-term score</span>
                <span style={{ fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:999, background:bBg, color:bTxt }}>{vrd} · {s.score}/100</span>
              </div>
              <div style={{ height:5, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:8 }}>
                <div style={{ height:'100%', borderRadius:3, background:bc, width:s.score+'%' }} />
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.55, borderTop:'1px solid var(--border)', paddingTop:8 }} dangerouslySetInnerHTML={{ __html: s.why }} />
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:11, color:'var(--text3)', borderTop:'1px solid var(--border)', paddingTop:10, lineHeight:1.5, marginTop:'1rem' }}>
        Prices are live from Finnhub on each refresh. Analyst targets based on consensus as of May 2026. Verify before investing. Not financial advice.
      </div>
    </div>
  )
}
