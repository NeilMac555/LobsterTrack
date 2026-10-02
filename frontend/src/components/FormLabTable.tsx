import {Fragment,useEffect,useState} from 'react';
import {useAuth} from '../contexts/AuthContext';
type Row={xg_games:number;xgf:number|null;xga:number|null;xgd:number|null;xgf_avg:number|null;xga_avg:number|null;xgd_avg:number|null;id:number;rank:number;name:string;promoted:boolean;played:number;wins:number;draws:number;losses:number;gf:number;ga:number;points:number;ppg:number|null;clean:number;clean_pct:number|null;margins:number[];cover_pct:number|null};
export default function FormLabTable({league,home,away,domestic}:{league:string;home:string;away:string;domestic:boolean}){
 const {token}=useAuth();
 const [view,setView]=useState('form'),[venue,setVenue]=useState('all'),[window,setWindow]=useState('10'),[rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{setView('form')},[league]);
 const [xgMode,setXgMode]=useState<'average'|'total'>('average');
 const [retry,setRetry]=useState(0);
 const [sort,setSort]=useState<{column:string;ascending:boolean}>({column:'Rank',ascending:true});
 useEffect(()=>{setSort({column:'Rank',ascending:true})},[view]);
 const value=(r:Row,column:string):number|string|null=>{
  const margins:Record<string,number>={'W1':0,'W2':1,'W3+':2,'L1':3,'L2':4,'L3+':5};
  if(column in margins)return r.margins[margins[column]];
  const fields:Record<string,number|string|null>={'xG games':r.xg_games,'npxG':r.xgf,'npxGA':r.xga,'npxGD':r.xgd,'npxG/game':r.xgf_avg,'npxGA/game':r.xga_avg,'npxGD/game':r.xgd_avg,Rank:r.rank,Team:r.name,P:r.played,W:r.wins,D:r.draws,L:r.losses,GF:r.gf,GA:r.ga,Pts:r.points,PPG:r.ppg,'Clean sheets':r.clean,'CS %':r.clean_pct,'−1.5 cover %':r.cover_pct};
  return fields[column]??null;
 };
 const sorted=[...rows].sort((a,b)=>{
  const sample=Number((view==='xg'?a.xg_games:a.played)<Number(window))-Number((view==='xg'?b.xg_games:b.played)<Number(window));if(sample)return sample;
  const av=value(a,sort.column),bv=value(b,sort.column);
  if(av===null||bv===null)return av===bv?a.rank-b.rank:av===null?1:-1;
  const delta=typeof av==='string'&&typeof bv==='string'?av.localeCompare(bv):Number(av)-Number(bv);
  return (sort.ascending?delta:-delta)||a.rank-b.rank;
 });

 useEffect(()=>{const c=new AbortController();setRows([]);setBusy(true);setError(false);if(!domestic&&['top6','tophalf','bottomhalf','bottom6'].includes(view)){setView('form');return()=>c.abort()}
 fetch('/api/form-lab/table?'+new URLSearchParams({league,view,venue,window}),{signal:c.signal,headers:token?{Authorization:`Bearer ${token}`}:{}}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>setRows(d.teams)).catch(e=>{if(e.name!=='AbortError')setError(true)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[league,view,venue,window,domestic,token,retry]);

 const views:Record<string,string>={form:'League form',top6:'vs Top 6',tophalf:'vs Top Half',bottomhalf:'vs Bottom Half',bottom6:'vs Bottom 6',handicap:'Handicap margins',clean:'Clean sheets',xg:'Expected goals'};
 const columns=['Rank','Team','P',...(view==='xg'?['xG games',...(xgMode==='average'?['npxG/game','npxGA/game','npxGD/game']:['npxG','npxGA','npxGD'])]:view==='handicap'?['W1','W2','W3+','D','L1','L2','L3+','−1.5 cover %']:view==='clean'?['Clean sheets','CS %','GF','GA']:['W','D','L','GF','GA','Pts','PPG'])];
 const labels:Record<string,string>={Rank:'Base rank',P:'Played','xG games':'xG coverage','npxG/game':'For','npxGA/game':'Against','npxGD/game':'Difference',npxG:'For',npxGA:'Against',npxGD:'Difference'};
 const descriptions:Record<string,string>={Rank:'Original ranking for this table view; does not change when another column is sorted.',P:'Matches played in the selected sample','xG games':'Matches with xG data / matches played','npxG/game':'Non-penalty expected goals for per covered game','npxGA/game':'Non-penalty expected goals against per covered game','npxGD/game':'Non-penalty expected goal difference per covered game',npxG:'Total non-penalty expected goals for',npxGA:'Total non-penalty expected goals against',npxGD:'Total non-penalty expected goal difference',PPG:'Points per game',GF:'Goals for',GA:'Goals against',Pts:'Points',W:'Wins',D:'Draws',L:'Losses'};
 const incomplete=(r:Row)=>(view==='xg'?r.xg_games:r.played)<Number(window);
 const firstIncomplete=sorted.findIndex(incomplete);
 const display=(r:Row,c:string)=>{
  if(c==='xG games')return `${r.xg_games}/${r.played}`;
  const v=value(r,c);if(v===null)return '—';
  if(typeof v==='string')return v;
  if(c.includes('%'))return `${v.toFixed(0)}%`;
  if(c.startsWith('npx')||c==='PPG')return `${c.includes('GD')&&v>0?'+':''}${v.toFixed(2)}`;
  return v;
 };
 const changeXgMode=(mode:'average'|'total')=>{
  setXgMode(mode);
  setSort(s=>({...s,column:s.column.startsWith('npx')?(mode==='average'?s.column.replace('/game','')+'/game':s.column.replace('/game','')):s.column}));
 };
 return <section className="fl-panel fl-league-table" aria-labelledby="fl-table-title">
  <div className="fl-table-heading"><div><h2 id="fl-table-title">League form table</h2><p>{views[view]} · Last {window} matches · {venue==='all'?'All venues':venue==='home'?'Home only':'Away only'}</p></div>
   <div className="fl-selection-legend" aria-label="Selected fixture">{[[home,'Home'],[away,'Away']].map(([id,label])=>{const team=rows.find(r=>String(r.id)===id);return team?<span key={label} className={label==='Home'?'fl-legend-home':'fl-legend-away'}>{team.name}<small>{label}</small></span>:null})}</div>
  </div>
  <div className="fl-table-controls">
   <label className="fl-view-control">Table view<select value={view} onChange={e=>setView(e.target.value)}>{Object.entries(views).filter(([key])=>domestic||!['top6','tophalf','bottomhalf','bottom6'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <fieldset><legend>Matches</legend><div className="fl-segmented">{[5,10,20].map(n=><button key={n} aria-pressed={window===String(n)} onClick={()=>setWindow(String(n))}>{n}</button>)}</div></fieldset>
   <fieldset><legend>Venue</legend><div className="fl-segmented">{['all','home','away'].map(v=><button key={v} aria-pressed={venue===v} onClick={()=>setVenue(v)}>{v==='all'?'All':v==='home'?'Home':'Away'}</button>)}</div></fieldset>
   {view==='xg'&&<fieldset className="fl-xg-mode"><legend>xG values</legend><div className="fl-segmented">{(['average','total'] as const).map(mode=><button key={mode} aria-pressed={xgMode===mode} onClick={()=>changeXgMode(mode)}>{mode==='average'?'Per game':'Totals'}</button>)}</div></fieldset>}
  </div>
  <div className="fl-table-context"><p>{view==='xg'?`Non-penalty xG · ${xgMode==='average'?'per covered game':'sample totals'}`:'Click any column to sort'}<span>Smaller samples stay at the bottom</span></p>
   <details className="fl-table-help"><summary>Table guide</summary><p>Each club’s last {window} matching games across available seasons. Base rank is the original {view==='xg'?'non-penalty xG difference per game':view==='handicap'?'−1.5 cover rate':view==='clean'?'clean-sheet percentage':'points-per-game'} ranking and remains unchanged when sorting. Click a column again to reverse direction. Promoted teams use this season only. Missing xG is excluded, never counted as zero.</p></details>
  </div>
  {error?<div role="alert" className="fl-table-state">Could not load the table. <button onClick={()=>setRetry(r=>r+1)}>Try again</button></div>:busy?<div role="status" className="fl-table-state">Loading {views[view].toLowerCase()}…</div>:!rows.length?<div className="fl-table-state">No matches available for these filters. Try another view or venue.</div>:
   <div className="fl-table-wrap fl-data-scroll" role="region" aria-label="League form standings; scroll horizontally for more columns" tabIndex={0}><table className="fl-data-table"><caption className="sr-only">{views[view]}, last {window} matches, {venue} venues. Smaller samples follow complete samples.</caption><thead><tr>{columns.map(c=><th key={c} scope="col" title={descriptions[c]} aria-sort={sort.column===c?(sort.ascending?'ascending':'descending'):'none'}><button className="fl-sort" onClick={()=>setSort(s=>({column:c,ascending:s.column===c?!s.ascending:c==='Team'||c==='Rank'}))}>{labels[c]||c}<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">{sort.column===c?<path d={sort.ascending?'M8 13V3M4 7l4-4 4 4':'M8 3v10m-4-4 4 4 4-4'}/>:<path d="m5 2-3 3h6M5 2v12m6 0 3-3H8m3 3V2"/>}</svg></button></th>)}</tr></thead><tbody>{sorted.map((r,index)=><Fragment key={r.id}>
    {index===firstIncomplete&&<tr className="fl-sample-divider"><td colSpan={columns.length}>Smaller samples <span>Fewer than {window} {view==='xg'?'games with xG data':'matching games'}</span></td></tr>}
    <tr className={String(r.id)===home?'fl-home-row':String(r.id)===away?'fl-away-row':''}>{columns.map(c=>c==='Team'?<th key={c} scope="row" className="fl-team-cell"><span>{r.name}</span>{r.promoted&&<small>* (promoted)</small>}</th>:<td key={c} className={[sort.column===c?'fl-sorted-cell':'',c.includes('GD')?(Number(value(r,c))>0?'fl-positive':Number(value(r,c))<0?'fl-negative':''):''].join(' ')}>{display(r,c)}</td>)}</tr>
   </Fragment>)}</tbody></table></div>}
  <div className="fl-table-footnote">{view==='xg'?'Source: Sportmonks · Only matches with both xG values are included.':view==='handicap'?'W1 / W2 / W3+: wins by 1, 2 or 3+ goals. L columns show losing margins. These are score-based outcomes, not betting returns.':'Base rank stays fixed when you sort another column.'}</div>
 </section>;
}
