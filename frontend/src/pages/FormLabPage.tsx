import { useEffect, useState } from 'react';
import './FormLabPage.css';
import { Helmet } from 'react-helmet-async';
type League = {key:string;name:string;opposition_bands:boolean;seasons:string[];updated_at:string|null;teams:{id:number;name:string}[]};
type Metric = {group:string;label:string;n:number;count?:number;value:number|null;kind:string};
type Game = {id:number;date:string;opponent:string;opponent_rank:number|null;venue:string;gf:number;ga:number;hf:number|null;ha:number|null;xg:number|null;xga:number|null};
type Analysis = {sample:number;available:number;requested:number;unclassified:number;metrics:Metric[];matches:Game[]};
export default function FormLabPage(){
 const [catalog,setCatalog]=useState<League[]>([]),[league,setLeague]=useState('soccer_epl');
 const [a,setA]=useState(''),[b,setB]=useState(''),[window,setWindow]=useState('10'),[venue,setVenue]=useState('all'),[opposition,setOpposition]=useState('all'),[season,setSeason]=useState('all'),[handicap,setHandicap]=useState('-1.5');
 const [data,setData]=useState<Analysis[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/form-lab/catalog',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setCatalog).catch(e=>{if(e.name!=='AbortError')setError('Could not load competitions. Please reload.')});return()=>c.abort()},[]);
 const competition=catalog.find(l=>l.key===league);
 useEffect(()=>{setA(String(competition?.teams[0]?.id||''));setB(String(competition?.teams[1]?.id||''));setSeason('all');setOpposition('all');setData([])},[competition]);
 useEffect(()=>{
  const c=new AbortController();setData([]);if(!a||!b)return;setBusy(true);setError('');
  Promise.all([a,b].map((team_id,i)=>{const params=new URLSearchParams({league,team_id,window,venue:venue==='match'?(i===0?'home':'away'):venue,opposition,season,handicap});return fetch('/api/form-lab/analysis?'+params,{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()})})).then(setData).catch(e=>{if(e.name!=='AbortError')setError('Could not load this sample. Please change a filter or reload.')}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()
 },[league,a,b,window,venue,opposition,season,handicap]);
 const name=(id:string)=>competition?.teams.find(t=>String(t.id)===id)?.name||'Select team';
 const select=(label:string,value:string,change:(v:string)=>void,options:[string,string][],disabled=false)=><label>{label}<select value={value} disabled={disabled} onChange={e=>change(e.target.value)}>{options.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>;
 const teams: [string,string][]=(competition?.teams||[]).map(t=>[String(t.id),t.name]);
 const groups=[...new Set(data[0]?.metrics.map(m=>m.group)||[])];
 return <main className="form-lab"><Helmet><title>Form Lab - SteamWatch</title><meta name="description" content="Compare football form, goal patterns, handicap cover rates and home-away splits." /></Helmet>
  <header><div className="fl-eyebrow">STEAMWATCH RESEARCH <span>BETA</span></div><h1>Form Lab<span>.</span></h1><p>Find the pattern. Check the sample. Build your view.</p></header>
  <section className="fl-controls">
   <div className="fl-grid three">{select('Competition',league,setLeague,catalog.map(l=>[l.key,l.name]))}{select('Team A',a,setA,teams)}{select('Team B',b,setB,teams)}</div>
   <div className="fl-grid filters">{select('Sample',window,setWindow,['5','10','20','50'].map(n=>[n,'Last '+n]))}{select('Venue',venue,setVenue,[['all','All venues'],['home','Home only'],['away','Away only'],['match','A home / B away']])}{select('Opposition',opposition,setOpposition,[['all','All opponents'],...(competition?.opposition_bands?[['top6','Top six'],['tophalf','Top half'],['bottomhalf','Bottom half'],['bottom6','Bottom six']]:[]) ] as [string,string][])}{select('Season',season,setSeason,[['all','All available'],...(competition?.seasons||[]).map(s=>[s,s] as [string,string])])}{select('Test handicap',handicap,setHandicap,[-3.5,-3,-2.5,-2,-1.5,-1,-0.5,0,0.5,1,1.5,2,2.5,3,3.5].map(n=>[String(n),n>0?'+'+n:String(n)]))}</div>
   <p className="fl-note">Filters apply before selecting the last {window} matches. League positions use this season's latest table and previous seasons' final tables. European fixtures exclude qualifiers; domestic rank filters are unavailable there.</p>
  </section>
  {error&&<p role="alert" className="fl-warning">{error}</p>}{busy&&<p role="status" className="fl-note">Building your sample...</p>}
  {data.length===2&&<>
   <div className="fl-grid two">{data.map((d,i)=><section className={'fl-summary team-'+i} key={i}><small>TEAM {i===0?'A':'B'} · {venue==='match'?(i===0?'HOME':'AWAY'):venue.toUpperCase()}</small><h2>{name(i===0?a:b)}</h2><div className="fl-sample"><strong>{d.sample}</strong> matches <span>of {d.available} matching fixtures</span></div><div className="fl-form">{d.matches.slice(0,10).map(g=><span key={g.id} className={g.gf>g.ga?'win':g.gf===g.ga?'draw':'loss'} title={`${g.date.slice(0,10)}: ${g.opponent} ${g.gf}-${g.ga}`}>{g.gf>g.ga?'W':g.gf===g.ga?'D':'L'}</span>)}<small>Latest first</small></div>{d.sample<Number(window)&&<p className="fl-warning">Only {d.sample} matches meet these filters. Percentages use the available sample.</p>}{d.unclassified>0&&<p className="fl-note">{d.unclassified} fixtures excluded because opponent rank was unavailable.</p>}</section>)}</div>
   <div className="fl-metrics">{groups.map(group=><section key={group} className="fl-panel"><h2>{group}</h2><div className="fl-metric-head"><span>Metric</span><span>{name(a)}</span><span>{name(b)}</span></div>{data[0].metrics.filter(m=>m.group===group).map(m=><div className="fl-metric" key={m.label}><span>{m.label}</span>{data.map((d,i)=>{const x=d.metrics.find(v=>v.label===m.label&&v.group===group)!;return <div key={i} className={'team-'+i}><strong>{x.value===null?'—':x.kind==='rate'?`${x.value}%`:x.value.toFixed(2)}</strong><small>{x.kind==='rate'?`${x.count}/${x.n} matches`:`${x.n} matches · per game`}</small>{x.kind==='rate'&&x.value!==null&&<div className="fl-track"><i style={{width:x.value+'%'}}/></div>}</div>})}</div>)}</section>)}</div>
   <div className="fl-grid two">{data.map((d,i)=><section className="fl-panel" key={i}><h2>{name(i===0?a:b)} · sample matches</h2><div className="fl-table-wrap"><table><thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>FT</th><th>HT</th><th>npxG</th></tr></thead><tbody>{d.matches.map(g=><tr key={g.id}><td>{g.date.slice(0,10)}</td><td>{g.opponent}{g.opponent_rank&&<small> #{g.opponent_rank}</small>}</td><td>{g.venue}</td><td>{g.gf}–{g.ga}</td><td>{g.hf===null||g.ha===null?'—':`${g.hf}–${g.ha}`}</td><td>{g.xg===null||g.xga===null?'—':`${g.xg.toFixed(2)}–${g.xga.toFixed(2)}`}</td></tr>)}</tbody></table></div></section>)}</div>
  </>}
  <footer className="fl-note"><p>90-minute results only. Handicap rates apply the chosen line to historical scores; they are not returns at historical betting prices. Missing statistics are excluded from that metric's denominator, never counted as zero. First-goal rates include 0–0 games; comeback rates use only the relevant scoring-first/conceding-first games.</p><p>Data: Sportmonks · Scheduled daily refresh · {competition?.updated_at?'Updated '+new Date(competition.updated_at+'Z').toLocaleString():'Awaiting data'}. npxG excludes penalties. Small samples describe what happened, not the probability of the next result.</p></footer>
 </main>
}
