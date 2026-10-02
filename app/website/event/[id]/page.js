'use client'
import {useEffect,useState} from 'react'
import {useParams} from 'next/navigation'
import Link from 'next/link'
import {createClient} from '@supabase/supabase-js'
import '../../website.css'
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const money=n=>Number(n||0)>0?'¥'+Number(n).toLocaleString():'¥--'
const dow=['SUN','MON','TUE','WED','THU','FRI','SAT']
export default function EventDetail(){
 const {id}=useParams(); const [event,setEvent]=useState(null); const [loading,setLoading]=useState(true)
 useEffect(()=>{if(!id)return;(async()=>{const {data}=await supabase.from('events').select('id,title,event_date,venue,open_time,start_time,advance_price,door_price,public_description,flyer_path,event_artists(sort_order,booking_status,artists(name,photo_path))').eq('id',id).eq('website_published',true).maybeSingle();setEvent(data||null);setLoading(false)})()},[id])
 if(loading)return <div className="event-detail-state">LOADING...</div>
 if(!event)return <div className="event-detail-state"><p>EVENT NOT FOUND</p><Link href="/website">← BACK TO HOME</Link></div>
 const d=new Date(event.event_date+'T00:00:00')
 const artists=(event.event_artists||[]).filter(x=>x.booking_status==='確定'||!x.booking_status).sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.artists?.name).filter(Boolean)
 const flyer=event.flyer_path?supabase.storage.from('event-flyers').getPublicUrl(event.flyer_path).data.publicUrl:null
 return <div className="ts-site event-page"><header className="ts-head"><Link className="ts-logo" href="/website">THUNDER SNAKE <small>ATSUGI</small></Link><Link className="event-back" href="/website">← BACK</Link></header><main className="event-detail"><div className="event-detail-kicker"><span>EVENT / {event.event_date.replaceAll('-','.')} / {dow[d.getDay()]}</span><span>THUNDER SNAKE ATSUGI</span></div><div className="event-detail-grid"><div className="event-detail-poster">{flyer?<img src={flyer} alt={event.title}/>:<div className="poster-type">THUNDER<br/>SNAKE</div>}</div><div className="event-detail-info"><div className="event-detail-date"><b>{String(d.getDate()).padStart(2,'0')}</b><span>{d.getFullYear()}.{String(d.getMonth()+1).padStart(2,'0')}<br/>{dow[d.getDay()]}</span></div><h1>{event.title}</h1>{artists.length>0&&<div className="event-detail-artists"><span>ARTISTS</span><p>{artists.join(' / ')}</p></div>}<div className="event-detail-meta"><div><span>OPEN / START</span><strong>{event.open_time?.slice(0,5)||'--:--'} / {event.start_time?.slice(0,5)||'--:--'}</strong></div><div><span>ADV / DOOR</span><strong>{money(event.advance_price)} / {money(event.door_price)}</strong></div><div><span>VENUE</span><strong>{event.venue||'THUNDER SNAKE ATSUGI'}</strong></div></div>{event.public_description&&<div className="event-description"><span>INFORMATION</span><p>{event.public_description}</p></div>}<button className="ticket-button" type="button">TICKET / RESERVATION <b>↗</b></button></div></div></main><footer><div>THUNDER SNAKE <small>ATSUGI</small></div><p>© THUNDER SNAKE ATSUGI</p></footer></div>
}