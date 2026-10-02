'use client'
import {useEffect,useMemo,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import './website.css'
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const money=n=>Number(n||0)>0?'¥'+Number(n).toLocaleString():'¥--'
const dow=['SUN','MON','TUE','WED','THU','FRI','SAT']
export default function Website(){
 const [events,setEvents]=useState([])
 const now=new Date()
 const [cursor,setCursor]=useState({y:now.getFullYear(),m:now.getMonth()+1})
 useEffect(()=>{(async()=>{const {data}=await supabase.from('events').select('id,title,event_date,venue,open_time,start_time,advance_price,door_price,public_description,flyer_path,event_artists(sort_order,booking_status,artists(name,photo_path))').eq('website_published',true).order('event_date');setEvents(data||[])})()},[])
 const upcoming=useMemo(()=>events.filter(e=>e.event_date>=now.toISOString().slice(0,10)).slice(0,4),[events])
 const shown=events.filter(e=>{const d=new Date(e.event_date+'T00:00:00');return d.getFullYear()===cursor.y&&d.getMonth()+1===cursor.m})
 const move=n=>{const d=new Date(cursor.y,cursor.m-1+n,1);setCursor({y:d.getFullYear(),m:d.getMonth()+1})}
 const flyer=e=>e.flyer_path?supabase.storage.from('event-flyers').getPublicUrl(e.flyer_path).data.publicUrl:null
 return <div className="ts-site">
  <header className="ts-head"><a className="ts-logo" href="#top">THUNDER SNAKE <small>ATSUGI</small></a><nav><a href="#pickup">PICK UP</a><a href="#schedule">SCHEDULE</a><a href="#information">INFO</a><a href="#access">ACCESS</a></nav></header>
  <main>
   <section className="hero" id="top"><div className="hero-kicker">LIVE HOUSE / ATSUGI, KANAGAWA</div><h1><span>THUNDER</span><span>SNAKE</span></h1><div className="hero-bottom"><p>音楽と、人が交わる場所。</p><span>ATSUGI · JAPAN</span></div></section>
   <section className="pickup" id="pickup"><div className="section-title"><span>01</span><h2>PICK UP</h2><p>UPCOMING EVENTS</p></div><div className="pickup-grid">{upcoming.length?upcoming.map((e,i)=>{const d=new Date(e.event_date+'T00:00:00');return <article className="pickup-card" key={e.id}><div className="pickup-image">{flyer(e)?<img src={flyer(e)} alt={e.title}/>:<div className="poster-type">THUNDER<br/>SNAKE</div>}<span className="pickup-no">0{i+1}</span></div><div className="pickup-copy"><time>{e.event_date.replaceAll('-','.')} / {dow[d.getDay()]}</time><h3>{e.title}</h3><p>OPEN {e.open_time?.slice(0,5)||'--:--'} / START {e.start_time?.slice(0,5)||'--:--'}</p></div></article>}):<p className="empty">公開予定のイベントはありません。</p>}</div></section>
   <section className="schedule" id="schedule"><div className="section-title"><span>02</span><h2>SCHEDULE</h2><p>LIVE CALENDAR</p></div><div className="month-switch"><button onClick={()=>move(-1)}>←</button><strong>{cursor.y}.{String(cursor.m).padStart(2,'0')}</strong><button onClick={()=>move(1)}>→</button></div><div className="schedule-list">{shown.length?shown.map(e=>{const d=new Date(e.event_date+'T00:00:00');const artists=(e.event_artists||[]).filter(x=>x.booking_status==='確定'||!x.booking_status).sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.artists?.name).filter(Boolean);return <article className="schedule-row" key={e.id}><div className="date"><b>{String(d.getDate()).padStart(2,'0')}</b><span>{dow[d.getDay()]}</span></div><div className="thumb">{flyer(e)?<img src={flyer(e)} alt=""/>:<span>TS</span>}</div><div className="event-info"><h3>{e.title}</h3>{artists.length>0&&<p className="artists">{artists.join(' / ')}</p>}<p>OPEN {e.open_time?.slice(0,5)||'--:--'}　START {e.start_time?.slice(0,5)||'--:--'}</p><p>ADV {money(e.advance_price)}　DOOR {money(e.door_price)}</p></div><span className="arrow">↗</span></article>}):<div className="empty">この月の公開イベントはありません。</div>}</div></section>
   <section className="information" id="information"><div className="section-title"><span>03</span><h2>INFORMATION</h2><p>ABOUT THE VENUE</p></div><div className="info-statement">LIVE MUSIC.<br/>NEW ENCOUNTERS.<br/>IN ATSUGI.</div></section>
   <section className="access" id="access"><div className="section-title"><span>04</span><h2>ACCESS</h2><p>COME SEE US</p></div><div className="access-grid"><div><h3>THUNDER SNAKE ATSUGI</h3><p>神奈川県厚木市旭町1-22-20<br/>ハラダ旭町ビル1F</p><p className="access-note">本厚木駅から徒歩圏内</p></div><div className="access-mark">ATSUGI<br/><span>35.44° N</span></div></div></section>
  </main>
  <footer><div>THUNDER SNAKE <small>ATSUGI</small></div><p>© THUNDER SNAKE ATSUGI</p></footer>
 </div>
}