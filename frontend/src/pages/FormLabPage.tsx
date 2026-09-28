import { useEffect, useState } from 'react';
import './FormLabPage.css';
import FormLabTable from '../components/FormLabTable';
import { Helmet } from 'react-helmet-async';
type Fixture = {id:number;date:string;home_id:number;away_id:number;home:string;away:string};
type League = {upcoming:Fixture[];key:string;name:string;opposition_bands:boolean;seasons:string[];updated_at:string|null;teams:{id:number;name:string}[]};
export default function FormLabPage(){
 const [catalog,setCatalog]=useState<League[]>([]),[league,setLeague]=useState('soccer_epl');
 const [a,setA]=useState(''),[b,setB]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/form-lab/catalog',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setCatalog).catch(e=>{if(e.name!=='AbortError')setError('Could not load competitions. Please reload.')});return()=>c.abort()},[]);
 const competition=catalog.find(l=>l.key===league);
 useEffect(()=>{setA(String(competition?.upcoming?.[0]?.home_id||competition?.teams[0]?.id||''));setB(String(competition?.upcoming?.[0]?.away_id||competition?.teams[1]?.id||''));},[competition]);
 const select=(label:string,value:string,change:(v:string)=>void,options:[string,string][],disabled=false)=><label>{label}<select value={value} disabled={disabled} onChange={e=>change(e.target.value)}>{options.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>;
 const teams: [string,string][]=(competition?.teams||[]).map(t=>[String(t.id),t.name]);
 return <main className="form-lab"><Helmet><title>Form Lab - SteamWatch</title><meta name="description" content="Compare football form, goal patterns, handicap cover rates and home-away splits." /></Helmet>
  <header><div className="fl-eyebrow">STEAMWATCH RESEARCH <span>BETA</span></div><h1>Form Lab<span>.</span></h1><p>Find the pattern. Check the sample. Build your view.</p></header>
  <section className="fl-controls">
   <div className="fl-grid two">{select('Competition',league,setLeague,catalog.map(l=>[l.key,l.name]))}{select('Match · next round',String(competition?.upcoming?.find(f=>String(f.home_id)===a&&String(f.away_id)===b)?.id||''),id=>{const f=competition?.upcoming?.find(f=>String(f.id)===id);if(!f){document.querySelector<HTMLDetailsElement>('.fl-options')?.setAttribute('open','')}if(f){setA(String(f.home_id));setB(String(f.away_id))}},[['','Choose manually'],...(competition?.upcoming||[]).map(f=>[String(f.id),`${new Date(f.date.replace(' ','T')+'Z').toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${f.home} v ${f.away}`] as [string,string])])}{competition&&!competition.upcoming?.length&&<p className="fl-note">No upcoming fixtures available in the latest refresh. Select teams under More options.</p>}</div>
   <details className="fl-options"><summary>Choose teams manually</summary>
   <div className="fl-grid two">{select('Home team',a,setA,teams)}{select('Away team',b,setB,teams)}</div>
</details>
  </section>
  {competition&&<FormLabTable league={league} home={a} away={b} domestic={competition.opposition_bands} />}
  {error&&<p role="alert" className="fl-warning">{error}</p>}
 </main>
}
