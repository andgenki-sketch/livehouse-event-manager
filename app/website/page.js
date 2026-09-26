'use client'
import {useEffect,useMemo,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import './website.css'
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const money=n=>Number(n||0)>0?'¥'+Number(n).toLocaleString():'¥--'
const pad=n=>String(n).padStart(2,'0')
const dow=['SUN','MON','TUE','WED','THU','FRI','SAT']
export default function Website(){
 const [events,setEvents]=useState([])
 const now=new Date()
 const [cursor,setCursor]=useState({y:now.getFullYear(),m:now.getMonth()+1})
 useEffect(()=>{(async()=>{const {data}=await supabase.from('events').select('id,title,event_date,venue,open_time,start_time,advance_price,door_price,public_description,flyer_path,event_artists(sort_order,booking_status,artists(name,photo_path))').eq('website_published',true).order('event_date');setEvents(data||[])})()},[])
 const months=useMemo(()=>Array.from({length:5},(_,i)=>{const d=new Date(cursor.y,cursor.m-1+i-1,1);return {y:d.getFullYear(),m:d.getMonth()+1}}),[cursor])
 const shown=events.filter(e=>{const d=new Date(e.event_date+'T00:00:00');return d.getFullYear()===cursor.y&&d.getMonth()+1===cursor.m})
 const move=n=>{const d=new Date(cursor.y,cursor.m-1+n,1);setCursor({y:d.getFullYear(),m:d.getMonth()+1})}
 return <div className="ts-site">
  <header className="ts-head"><a className="ts-logo" href="/website">Thunder Snake <small>ATSUGI</small></a><nav><a href="/website">HOME</a><i/><a href="#schedule">SCHEDULE</a><i/><a href="#access">ACCESS</a><i/><a href="#information">INFORMATION</a><i/><a href="#studio">STUDIO</a><i/><a href="#records">RECORDS</a></nav></header>
  <main className="ts-wrap" id="schedule">
   <section className="schedule-head"><h1>{cursor.y} SCHEDULE</h1><div className="month-nav"><button onClick={()=>move(-1)} aria-label="前の月">‹</button>{months.map(x=><button key={x.y+'-'+x.m} className={x.y===cursor.y&&x.m===cursor.m?'active':''} onClick={()=>setCursor(x)}><b>{x.m}</b><span>{new Date(x.y,x.m-1,1).toLocaleString('en-US',{month:'short'}).toUpperCase()}</span></button>)}<button onClick={()=>move(1)} aria-label="次の月">›</button></div></section>
   <section className="schedule-list">{shown.length?shown.map((e,idx)=>{const d=new Date(e.event_date+'T00:00:00');const artists=(e.event_artists||[]).filter(x=>x.booking_status==='確定'||!x.booking_status).sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.artists?.name).filter(Boolean);return <article className="schedule-row" key={e.id}>
    <div className={'day '+(d.getDay()===0?'sun':d.getDay()===6?'sat':'')}><b>{d.getDate()}</b><span>{dow[d.getDay()]}</span></div>
    <div className="flyer">{e.flyer_path?<img src={supabase.storage.from('event-flyers').getPublicUrl(e.flyer_path).data.publicUrl} alt={e.title+' フライヤー'}/>:<div className="flyer-placeholder"><span>Thunder Snake</span><small>ATSUGI</small></div>}</div>
    <div className="event-info"><h2>{e.title}</h2><div className="event-meta"><span>open {e.open_time?.slice(0,5)||'--:--'}　start {e.start_time?.slice(0,5)||'--:--'}</span><span>adv. {money(e.advance_price)}　door {money(e.door_price)}</span></div>{artists.length>0&&<div className="performers">{artists.map((a,i)=><p key={i}>{a}</p>)}</div>}{e.public_description&&<p className="description">{e.public_description}</p>}</div>
   </article>}):<div className="no-events">この月の公開イベントはありません。</div>}</section>
   <section className="site-info" id="access"><h2>ACCESS</h2><p>Thunder Snake ATSUGI</p><p>神奈川県厚木市旭町1-22-20 ハラダ旭町ビル1F</p></section>
  </main><footer className="ts-footer">© Thunder Snake ATSUGI</footer>
 </div>
}