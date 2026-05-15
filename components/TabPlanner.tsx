'use client'
import { useState, useEffect } from 'react'
import { HOLDINGS } from '@/lib/data'
import { ltScore } from '@/lib/scoring'
import type { QuoteMap } from '@/app/page'

const WL_KEY       = 'portfolio_watchlist_v1'
const HOLDINGS_KEY = 'portfolio_custom_holdings_v1'

// Custom holdings layer — overrides/extends HOLDINGS from data.ts
interface CustomHolding { sym:string; name:string; shares:number; type:'stock'|'etf' }

function loadCustomHoldings(): CustomHolding[] {
  try { const s=localStorage.getItem(HOLDINGS_KEY); if(s) return JSON.parse(s) } catch {}
  return []
}
function saveCustomHoldings(h: CustomHolding[]) {
  try { localStorage.setItem(HOLDINGS_KEY, JSON.stringify(h)) } catch {}
}

const DEFAULT_WL = [
  {sym:'AMD', name:'AMD',       revG:22,moPct:80.4,yrPct:107.9,tgt:500},
  {sym:'NVDA',name:'NVIDIA',    revG:73,moPct:19.2,yrPct:21.1, tgt:250},
  {sym:'TSM', name:'TSMC',      revG:35,moPct:8.2, yrPct:31.6, tgt:450},
  {sym:'GOOGL',name:'Alphabet', revG:12,moPct:25.2,yrPct:28.5, tgt:430},
  {sym:'LLY', name:'Eli Lilly', revG:43,moPct:8.1, yrPct:-5.5, tgt:1225},
]
function loadWL() {
  try { const s=localStorage.getItem(WL_KEY); if(s) return JSON.parse(s) } catch {}
  return DEFAULT_WL
}

function fmt(n: number) {
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
}
function fp(n: number) { return (n>=0?'+':'')+n.toFixed(2)+'%' }
function pc(n: number) { return n>=0?'#1d9e75':'#d64045' }

interface Candidate {
  sym:string; name:string; source:'watchlist'|'scout'
  price:number; pct:number; score:number; sig:string
  upside:number; yrPct:number; revG:number; tgt:number
  verdict?:string; why?:string
}

// ── Record purchase modal ──────────────────────────────────────────────────
function RecordPurchaseModal({
  quotes, prefillSym, onSave, onClose,
}: {
  quotes:    QuoteMap
  prefillSym?: string
  onSave:    (h: CustomHolding) => void
  onClose:   () => void
}) {
  const [sym,    setSym   ] = useState(prefillSym || '')
  const [name,   setName  ] = useState('')
  const [shares, setShares] = useState('')
  const [type,   setType  ] = useState<'stock'|'etf'>('stock')
  const [looking,setLooking] = useState(false)
  const [err,    setErr   ] = useState('')

  // Auto-populate name from profile API or quotes
  const lookup = async (ticker: string) => {
    if (!ticker) return
    setLooking(true)
    try {
      const r = await fetch(`/api/profile?sym=${ticker.toUpperCase()}`)
      const d = await r.json()
      if (d.name) setName(d.name)
    } catch {}
    setLooking(false)
  }

  useEffect(() => { if (prefillSym) lookup(prefillSym) }, [prefillSym])

  // Show live price hint
  const livePrice = quotes[sym.toUpperCase()]?.price
  const sharesNum = parseFloat(shares)

  const handleSave = () => {
    const t = sym.trim().toUpperCase()
    if (!t)            { setErr('Ticker required');       return }
    if (!sharesNum || sharesNum <= 0) { setErr('Enter a valid share count'); return }
    onSave({ sym:t, name: name.trim()||t, shares: sharesNum, type })
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:24,
        width:'100%',maxWidth:440,boxShadow:'0 12px 40px rgba(0,0,0,0.25)'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:600}}>Record a purchase</div>
          <button onClick={onClose} style={{fontSize:18,background:'none',border:'none',
            color:'var(--text2)',cursor:'pointer'}}>✕</button>
        </div>

        {/* Ticker */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:4}}>
            Ticker symbol *
          </label>
          <div style={{display:'flex',gap:8}}>
            <input value={sym}
              onChange={e=>{setSym(e.target.value.toUpperCase());setErr('')}}
              onBlur={e=>lookup(e.target.value)}
              placeholder="e.g. AAPL"
              style={{flex:1,padding:'8px 12px',border:'1px solid var(--border)',
                borderRadius:8,fontSize:14,background:'var(--bg)',color:'var(--text)'}} />
            <button onClick={()=>lookup(sym)} disabled={looking}
              style={{padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,
                background:'var(--bg2)',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>
              {looking?'…':'Lookup'}
            </button>
          </div>
          {livePrice && (
            <div style={{fontSize:11,color:'#1d9e75',marginTop:4}}>
              Live price: {fmt(livePrice)}
              {sharesNum > 0 && ` · Total cost: ${fmt(livePrice * sharesNum)}`}
            </div>
          )}
        </div>

        {/* Company name */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:4}}>Company name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Auto-filled on lookup"
            style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',
              borderRadius:8,fontSize:13,background:'var(--bg)',color:'var(--text)',boxSizing:'border-box'}} />
        </div>

        {/* Shares + Type */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div>
            <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:4}}>
              Shares purchased *
            </label>
            <input value={shares} onChange={e=>setShares(e.target.value)} type="number"
              placeholder="e.g. 2.5" min="0" step="any"
              style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',
                borderRadius:8,fontSize:13,background:'var(--bg)',color:'var(--text)',boxSizing:'border-box'}} />
          </div>
          <div>
            <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:4}}>Type</label>
            <div style={{display:'flex',gap:6}}>
              {(['stock','etf'] as const).map(t => (
                <button key={t} onClick={()=>setType(t)}
                  style={{flex:1,padding:'8px',border:'1px solid var(--border)',borderRadius:8,
                    fontSize:12,fontWeight:500,cursor:'pointer',
                    background:t===type?'#111':'transparent',
                    color:t===type?'#fff':'var(--text2)'}}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{background:'#e6f1fb',borderRadius:8,padding:'10px 12px',marginBottom:16,
          fontSize:12,color:'#185fa5',lineHeight:1.5}}>
          ℹ This records your purchase and updates the <strong>Holdings tab</strong> immediately.
          Your share count will be added on top of any existing position.
        </div>

        {err && <div style={{fontSize:12,color:'#d64045',marginBottom:12}}>⚠ {err}</div>}

        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose}
            style={{padding:'8px 16px',border:'1px solid var(--border)',borderRadius:8,
              background:'transparent',color:'var(--text2)',fontSize:13,cursor:'pointer'}}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{padding:'8px 20px',border:'none',borderRadius:8,
              background:'#1d9e75',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
            Save to holdings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main planner ──────────────────────────────────────────────────────────────
export default function TabPlanner({ quotes, loading }: { quotes:QuoteMap; loading:boolean }) {
  const [amount,       setAmount      ] = useState(1000)
  const [filter,       setFilter      ] = useState<'all'|'watchlist'|'scout'>('all')
  const [candidates,   setCandidates  ] = useState<Candidate[]>([])
  const [scoutLoading, setScoutLoading] = useState(true)
  const [histories,    setHistories   ] = useState<Record<string,number[]>>({})
  const [showPurchase, setShowPurchase] = useState(false)
  const [prefillSym,   setPrefillSym  ] = useState<string|undefined>()
  const [customHoldings, setCustomHoldings] = useState<CustomHolding[]>([])
  const [saved,        setSaved       ] = useState<string|null>(null)

  // Load custom holdings from localStorage
  useEffect(() => { setCustomHoldings(loadCustomHoldings()) }, [])

  const [wlCands, setWlCands] = useState<Candidate[]>([])
  useEffect(() => {
    const wl = loadWL()
    setWlCands(wl.map((w:any) => ({
      sym:w.sym, name:w.name, source:'watchlist' as const,
      price:0, pct:0, score:0, sig:'wait', upside:0,
      yrPct:w.yrPct, revG:w.revG, tgt:w.tgt,
    })))
  }, [])

  const [scoutCands, setScoutCands] = useState<Candidate[]>([])
  useEffect(() => {
    setScoutLoading(true)
    fetch('/api/scout')
      .then(r=>r.json())
      .then(data => {
        if(data.stocks) setScoutCands(data.stocks.slice(0,8).map((s:any) => ({
          sym:s.sym, name:s.name, source:'scout' as const,
          price:s.price||0, pct:s.pct||0,
          score:s.ltScore||50, sig:s.ltScore>=70?'buy':s.ltScore>=50?'watch':'wait',
          upside:s.analystTarget&&s.price?(s.analystTarget-s.price)/s.price*100:0,
          yrPct:s.yrPct||0, revG:s.revGrowth||0, tgt:s.analystTarget||0,
          verdict:s.verdict, why:s.why,
        })))
      })
      .catch(()=>{})
      .finally(()=>setScoutLoading(false))
  }, [])

  // Fetch history for scoring watchlist
  useEffect(() => {
    wlCands.forEach(c => {
      if(histories[c.sym]) return
      fetch(`/api/history?sym=${c.sym}&days=30`)
        .then(r=>r.json())
        .then(d=>{ if(d.closes?.length) setHistories(prev=>({...prev,[c.sym]:d.closes})) })
        .catch(()=>{})
    })
  }, [wlCands])

  // Merge all candidates
  useEffect(() => {
    const scoredWL = wlCands.map(c => {
      const q  = quotes[c.sym]
      const h  = histories[c.sym]||[]
      const sc = ltScore({price:q?.price||0,history:h,revG:c.revG,moPct:0,yrPct:c.yrPct,tgt:c.tgt})
      return {...c, price:q?.price||0, pct:q?.pct||0, score:sc.score, sig:sc.sig, upside:sc.upside}
    })
    const scoredSC = scoutCands.map(c => {
      const q = quotes[c.sym]
      return {...c, price:q?.price||c.price, pct:q?.pct||c.pct}
    })
    const seen = new Set<string>()
    const merged: Candidate[] = []
    for (const c of [...scoredWL,...scoredSC]) {
      if(!seen.has(c.sym) && c.price>0) { seen.add(c.sym); merged.push(c) }
    }
    setCandidates(merged.sort((a,b)=>b.score-a.score))
  }, [wlCands,scoutCands,quotes,histories])

  const filtered = filter==='all' ? candidates : candidates.filter(c=>c.source===filter)
  const top      = filtered.slice(0,8)
  const total    = top.reduce((s,c)=>s+Math.max(c.score,1),0)
  const alloc    = top.map(c=>({
    dollars: Math.round(amount*Math.max(c.score,1)/total),
    pct:     Math.max(c.score,1)/total*100,
  }))
  const totalAlloc = alloc.reduce((s,a)=>s+a.dollars,0)

  const handleSavePurchase = (h: CustomHolding) => {
    const existing = customHoldings.find(e => e.sym === h.sym)
    let updated: CustomHolding[]
    if (existing) {
      // Add to existing shares
      updated = customHoldings.map(e =>
        e.sym === h.sym ? {...e, shares: parseFloat((e.shares + h.shares).toFixed(6))} : e
      )
    } else {
      updated = [...customHoldings, h]
    }
    setCustomHoldings(updated)
    saveCustomHoldings(updated)
    setSaved(`${h.shares} shares of ${h.sym} added to holdings`)
    setTimeout(() => setSaved(null), 4000)
  }

  const openPurchase = (sym?: string) => {
    setPrefillSym(sym)
    setShowPurchase(true)
  }

  const isLoading = loading || scoutLoading

  return (
    <div>
      {/* Purchase success toast */}
      {saved && (
        <div style={{position:'fixed',bottom:24,right:24,zIndex:999,
          background:'#1d9e75',color:'#fff',padding:'10px 18px',
          borderRadius:10,fontSize:13,fontWeight:500,
          boxShadow:'0 4px 16px rgba(0,0,0,0.2)'}}>
          ✓ {saved}
        </div>
      )}

      {/* Custom holdings summary */}
      {customHoldings.length > 0 && (
        <div style={{background:'var(--bg)',border:'1px solid var(--border)',
          borderRadius:'var(--radius)',padding:14,marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:600}}>Recently recorded purchases</div>
            <button onClick={()=>openPurchase()}
              style={{fontSize:12,padding:'5px 12px',border:'1px solid #1d9e75',
                borderRadius:8,background:'transparent',color:'#1d9e75',cursor:'pointer',fontWeight:500}}>
              + Record new purchase
            </button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {customHoldings.map(h => {
              const q = quotes[h.sym]
              const val = q ? q.price * h.shares : null
              return (
                <div key={h.sym} style={{display:'flex',alignItems:'center',gap:8,
                  padding:'6px 12px',background:'var(--bg2)',borderRadius:8,fontSize:12}}>
                  <span style={{fontWeight:600}}>{h.sym}</span>
                  <span style={{color:'var(--text2)'}}>{h.shares} shares</span>
                  {val && <span style={{color:'#1d9e75',fontWeight:500}}>{fmt(val)}</span>}
                  <button onClick={()=>{
                    const updated = customHoldings.filter(x=>x.sym!==h.sym)
                    setCustomHoldings(updated); saveCustomHoldings(updated)
                  }} style={{fontSize:11,background:'none',border:'none',color:'var(--text3)',cursor:'pointer'}}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Investment input */}
      <div style={{background:'var(--bg)',border:'1px solid var(--border)',
        borderRadius:'var(--radius)',padding:18,marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600}}>How much do you want to invest?</div>
          <button onClick={()=>openPurchase()}
            style={{fontSize:12,padding:'6px 14px',border:'none',borderRadius:8,
              background:'#1d9e75',color:'#fff',cursor:'pointer',fontWeight:500}}>
            + Record a purchase
          </button>
        </div>
        <div style={{fontSize:28,fontWeight:600,marginBottom:10}}>{fmt(amount)}</div>
        <input type="range" min={100} max={10000} step={100} value={amount}
          onChange={e=>setAmount(Number(e.target.value))} style={{width:'100%',marginBottom:12}} />
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {[250,500,1000,2500,5000,10000].map(v=>(
            <button key={v} onClick={()=>setAmount(v)}
              style={{fontSize:12,padding:'4px 12px',border:'1px solid var(--border)',
                borderRadius:999,cursor:'pointer',
                background:v===amount?'#7f77dd':'transparent',
                color:v===amount?'#fff':'var(--text2)'}}>
              ${v>=1000?v/1000+'k':v}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',
          paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <span style={{fontSize:12,color:'var(--text2)'}}>Candidates from:</span>
          {(['all','watchlist','scout'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{fontSize:12,padding:'4px 12px',border:'1px solid var(--border)',
                borderRadius:999,cursor:'pointer',
                background:f===filter?'#111':'transparent',
                color:f===filter?'#fff':'var(--text2)'}}>
              {f==='all'?`All (${candidates.length})`:f==='watchlist'?`My watchlist (${wlCands.length})`:`Scout picks (${scoutCands.length})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{textAlign:'center',padding:'2rem',color:'var(--text3)',fontSize:13}}>
          Loading candidates from watchlist and scout…
        </div>
      ) : top.length === 0 ? (
        <div style={{textAlign:'center',padding:'2rem',color:'var(--text3)',fontSize:13}}>
          No candidates found. Add stocks to your watchlist or wait for scout to load.
        </div>
      ) : (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'10px 14px',background:'var(--bg2)',borderRadius:8,
            marginBottom:'1rem',fontSize:13,flexWrap:'wrap',gap:8}}>
            <div>
              Deploying <strong>${amount.toLocaleString()}</strong> across{' '}
              <strong>{top.length} picks</strong>
              {' '}({top.filter(c=>c.source==='watchlist').length} watchlist,{' '}
              {top.filter(c=>c.source==='scout').length} scout)
            </div>
            {amount-totalAlloc > 0 && (
              <div style={{fontSize:11,color:'var(--text3)'}}>${amount-totalAlloc} unallocated (rounding)</div>
            )}
          </div>

          <div style={{background:'var(--bg2)',borderRadius:'var(--radius)',padding:'12px 16px',
            marginBottom:'1.25rem',fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
            Weighted by long-term score. Click <strong style={{color:'var(--text)'}}>Record purchase</strong> on
            any card to log shares you bought — they'll appear in your Holdings tab.
            Consider <strong style={{color:'var(--text)'}}>DCA</strong> for volatile picks.
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:12}}>
            {top.map((c,i) => {
              const al     = alloc[i]
              const shares = c.price>0 ? al.dollars/c.price : 0
              const bc     = c.score>=70?'#1d9e75':c.score>=50?'#e06c00':'#7f77dd'
              const srcStyle = c.source==='watchlist'
                ? {bg:'#faeeda',color:'#854f0b',label:'Watchlist'}
                : {bg:'#eeedfe',color:'#3c3489',label:'Scout'}
              const why2 = c.sig==='buy'
                ? `Strong long-term setup — ${fp(c.yrPct)} past year, momentum positive.`
                : c.sig==='watch'
                ? `Consider DCA — split $${al.dollars.toLocaleString()} across 2-3 months.`
                : `Smaller allocation — trend not yet confirmed.`

              return (
                <div key={c.sym} style={{background:'var(--bg)',position:'relative',
                  border:i===0?'1.5px solid #1d9e75':'1px solid var(--border)',
                  borderRadius:'var(--radius)',padding:14}}>

                  <div style={{position:'absolute',top:12,right:12,width:22,height:22,
                    borderRadius:'50%',background:'var(--bg2)',display:'flex',
                    alignItems:'center',justifyContent:'center',fontSize:11,
                    fontWeight:600,color:'var(--text3)'}}>{i+1}</div>

                  <div style={{display:'flex',justifyContent:'space-between',
                    alignItems:'flex-start',marginBottom:4}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:600}}>{c.sym}</div>
                      <div style={{fontSize:11,color:'var(--text3)',marginTop:1}}>
                        {c.name}{' '}
                        <span style={{fontSize:10,padding:'1px 7px',borderRadius:999,
                          fontWeight:500,background:srcStyle.bg,color:srcStyle.color}}>
                          {srcStyle.label}
                        </span>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:20,fontWeight:600}}>${al.dollars.toLocaleString()}</div>
                      <div style={{fontSize:12,color:'var(--text2)'}}>{al.pct.toFixed(1)}% of budget</div>
                    </div>
                  </div>

                  <div style={{height:5,background:'var(--bg2)',borderRadius:3,overflow:'hidden',margin:'8px 0'}}>
                    <div style={{height:'100%',borderRadius:3,background:bc,
                      width:al.pct.toFixed(1)+'%',transition:'width .4s ease'}} />
                  </div>

                  {[
                    ['Price',         c.price>0?fmt(c.price):'—'],
                    ['Suggested shares', shares>=1?shares.toFixed(3):shares.toFixed(5)],
                    ['1Y return',     fp(c.yrPct)],
                    ['Analyst upside',c.upside?(c.upside>=0?'+':'')+c.upside.toFixed(1)+'%':'—'],
                    ['Score',         `${c.score}/100`],
                  ].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginTop:4}}>
                      <span style={{color:'var(--text2)'}}>{l}</span>
                      <strong style={{color:l==='1Y return'?pc(c.yrPct):'var(--text)'}}>{v}</strong>
                    </div>
                  ))}

                  <div style={{fontSize:12,color:'var(--text2)',marginTop:8,paddingTop:8,
                    borderTop:'1px solid var(--border)',lineHeight:1.5,marginBottom:10}}>
                    <strong style={{color:'var(--text)'}}>Why:</strong>{' '}
                    {c.why?c.why.replace(/<[^>]+>/g,'').slice(0,120)+'…':why2}
                  </div>

                  {/* Record purchase button on each card */}
                  <button onClick={()=>openPurchase(c.sym)}
                    style={{width:'100%',padding:'7px',border:'1px solid #1d9e75',borderRadius:8,
                      background:'transparent',color:'#1d9e75',fontSize:12,fontWeight:500,
                      cursor:'pointer',marginTop:2}}>
                    + Record purchase of {c.sym}
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{fontSize:11,color:'var(--text3)',borderTop:'1px solid var(--border)',
            paddingTop:10,lineHeight:1.5,marginTop:'1rem'}}>
            Purchases are saved locally in your browser and reflected in the Holdings tab.
            DCA = investing a fixed amount monthly to reduce timing risk. Not financial advice.
          </div>
        </>
      )}

      {showPurchase && (
        <RecordPurchaseModal
          quotes={quotes}
          prefillSym={prefillSym}
          onSave={handleSavePurchase}
          onClose={()=>{ setShowPurchase(false); setPrefillSym(undefined) }}
        />
      )}
    </div>
  )
}
