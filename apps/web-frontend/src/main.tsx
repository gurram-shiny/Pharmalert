import {signOutOnDevice} from '../../../packages/data-services/sign-out';
import {CatalogInput} from './catalog-input';
import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { Activity, ArrowDownToLine, ArrowRight, Bell, CalendarDays, ChevronDown, ChevronRight, ClipboardList, FileText, FlaskConical, HeartPulse, LayoutDashboard, LogOut, Menu, Pill, Plus, Search, Settings, Shield, ShieldCheck, Wine, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { recordValues, reportHtml, service, toCsv, type Session } from '@pharmalert/data-services';
import { disclaimer, formatDate, sections, type RecordRow, type Section } from '@pharmalert/shared';
import { evidenceMessages, type Analysis, type Kind, type Substance } from '@pharmalert/interaction-engine';
import { HealthTrends } from './health-trends';
import './styles.css';

const nav = [
  ['/', 'Overview', LayoutDashboard], ['/checker','Interaction checker',ShieldCheck], ['/medicines','My medicines',Pill],
  ['/supplements','Supplements',FlaskConical], ['/alcohol_entries','Alcohol log',Wine], ['/reminders','Reminders',Bell],
  ['/prescriptions','Prescriptions',FileText], ['/health_records','Health records',HeartPulse],
  ['/history','Check history',ClipboardList], ['/settings','Settings',Settings],
] as const;
const tables = [...Object.keys(sections),'interaction_checks','reminder_logs','notifications'];
type Data = Record<string,RecordRow[]>;
const store = 'pharmalert-session';
const readSession = ():Session|null => { try { return JSON.parse(localStorage.getItem(store) ?? 'null'); } catch { return null; } };
const message = (error:unknown) => error instanceof Error ? error.message : 'Something went wrong.';
const label = (value:unknown) => String(value ?? '—');
type Api = ReturnType<typeof service>;
function download(content:Blob, name:string) {
  const href = URL.createObjectURL(content);
  const link = document.createElement('a'); link.href = href; link.download = name; link.click();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
}
function Exports({title,rows}:{title:string;rows:Record<string,unknown>[]}) {
  return <div className="actions"><button className="secondary" onClick={()=>download(new Blob([toCsv(rows)],{type:'text/csv'}),title+'.csv')}><ArrowDownToLine size={15}/> CSV</button><button className="secondary" onClick={()=>{
    const url=URL.createObjectURL(new Blob([reportHtml(title,rows).replace('</style>','</style><script>window.addEventListener("load",()=>window.print())</script>')],{type:'text/html'}));
    window.open(url,'_blank','noopener'); setTimeout(()=>URL.revokeObjectURL(url),60000);
  }}>Print / PDF</button></div>;
}
function Brand() { return <div className="brand"><span><ShieldCheck size={24}/></span><div>PharmAlert <b>AI</b><small>MEDICATION SAFETY</small></div></div>; }
function App() {
  const [session,setSession] = useState(readSession);
  const [data,setData] = useState<Data>({});
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  const [menu,setMenu] = useState(false);
  const [panel,setPanel] = useState('');
  const [query,setQuery] = useState('');
  const [ready,setReady] = useState(false);
  const activeToken = useRef(session?.token);
  const api = useMemo(()=>service(import.meta.env.VITE_BACKEND_URL,session?.token),[session?.token]);
  function remember(next:Session|null) {
    activeToken.current = next?.token;
    if (next) localStorage.setItem(store,JSON.stringify(next)); else localStorage.removeItem(store);
    setSession(next);
  }
  async function refresh() {
    if (!session) return;
    const rows = await Promise.all(tables.map(async table=>[table,await api.list(table)] as const));
    if (activeToken.current !== session.token) return;
    setData(Object.fromEntries(rows));
    setLoaded(true);
  }
  useEffect(()=>{
    let live = true;
    setData({}); setLoaded(false); setError('');
    if (!session) { setReady(true); return; }
    setReady(false);
    api.current().then(()=>{ if(live){ setReady(true); return refresh(); } }).catch(error=>{
      if(live){
        if(message(error)==='Your session has expired.') remember(null);
        setReady(true);setError(message(error));
      }
    });
    return ()=>{live=false;};
  },[api]);
  const active = !!session && ready;
  const results = nav.filter(([,name])=>name.toLowerCase().includes(query.toLowerCase()));
  return <div className="shell">
    <aside className={menu?'sidebar open':'sidebar'}><Brand/><div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(([path,name,Icon],i)=><div key={path}>{i===6&&<div className="nav-label group">RECORDS</div>}<NavLink to={path} end onClick={()=>setMenu(false)}><Icon size={18}/>{name}{path==='/'&&<ChevronRight className="nav-arrow" size={14}/>}</NavLink></div>)}</nav>
      <div className="sidebar-bottom"><Shield size={17}/><div><strong>Private workspace</strong><small>Account-protected records</small></div></div>
    </aside>
    <div className="workspace"><header className="top"><div className="crumb"><button className="icon menu-button" aria-label="Menu" onClick={()=>setMenu(!menu)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>PharmAlert AI</strong></div>
      <div className="top-actions"><button className="search secondary" onClick={()=>setPanel(panel==='search'?'':'search')}><Search size={16}/> Find a page</button><button className="icon" aria-label="Notifications" onClick={()=>setPanel(panel==='notifications'?'':'notifications')}><Bell size={19}/></button><button className="profile" aria-label="Account" onClick={()=>setPanel(panel==='account'?'':'account')}><span className="avatar">{session?.user.name.slice(0,1).toUpperCase() ?? 'PA'}</span><span>{session?.user.name ?? 'Guest'}</span><ChevronDown size={14}/></button></div>
      {panel&&<div className="popover">{panel==='search'?<><input aria-label="Search pages" placeholder="Search pages" value={query} onChange={event=>setQuery(event.target.value)}/>{results.map(([path,name])=><Link key={path} to={path} onClick={()=>setPanel('')}>{name}</Link>)}</>:panel==='notifications'?<><strong>Notifications</strong>{data.notifications?.length?data.notifications.map(row=><p key={row.id}>{label(row.message)}</p>):<p>No notifications to display.</p>}</>:session?<button className="secondary" onClick={async()=>{await signOutOnDevice(api.logout,()=>{remember(null);setPanel('');});}}><LogOut size={16}/> Sign out</button>:<Link to="/account" onClick={()=>setPanel('')}>Sign in or create an account</Link>}</div>}
    </header>
    <main>{error&&<p className="error" role="alert">{error}</p>}
    <Routes>
      <Route path="/" element={<Dashboard data={data} user={session?.user.name} loaded={loaded}/>}/>
      <Route path="/account" element={<Auth onSession={remember} session={session}/>}/>
      {Object.keys(sections).map(key=><Route key={key} path={'/'+key} element={active?<Records key={key} section={key as Section} data={data} api={api} refresh={refresh}/>:<Auth onSession={remember} session={session}/>}/>)}
      <Route path="/checker" element={active?<Checker api={api} data={data} refresh={refresh}/>:<Auth onSession={remember} session={session}/>}/>
      <Route path="/history" element={active?<History api={api} rows={data.interaction_checks ?? []} refresh={refresh}/>:<Auth onSession={remember} session={session}/>}/>
      <Route path="/settings" element={active?<Profile api={api} session={session!} remember={remember}/>:<Auth onSession={remember} session={session}/>}/>
      <Route path="*" element={<div className="card"><h1>Page unavailable</h1><Link to="/">Back to overview</Link></div>}/>
    </Routes>
    <footer><span><ShieldCheck size={15}/> PharmAlert AI</span><span>Medication safety workspace</span></footer></main></div>
  </div>;
}
function Dashboard({data,user,loaded}:{data:Data;user?:string;loaded:boolean}) {
  const checks = data.interaction_checks ?? [];
  const reports = checks.map(row=>row.report as Analysis);
  const issues = reports.reduce((count,report)=>count+report.matchCount,0);
  const counts = ['contraindicated','other','unknown'].map(level=>reports.reduce((count,report)=>count+report.pairs.reduce((total,pair)=>total+(level==='unknown'?Number(pair.status!=='matched'):pair.matches.filter(rule=>rule.display===level).length),0),0));
  const doses = [...(data.reminders ?? [])].sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const trend = Array.from({length:7},(_,i)=>{
    const day = new Date(); day.setDate(day.getDate()+i-6);
    return {day:day.toLocaleDateString(undefined,{weekday:'short'}), checks:checks.filter(row=>new Date(row.created_at).toDateString()===day.toDateString()).length};
  });
  const metrics = [
    ['Total medicines',data.medicines?.length,Pill,'mint'],['Active reminders',doses.length,Bell,'blue'],
    ['Interaction checks',checks.length,Activity,'purple'],['Potential interactions',issues,Shield,'amber'],
    ['Prescriptions',data.prescriptions?.length,FileText,'pink'],
  ] as const;
  return <>
    <div className="page-head"><div><div className="today"><CalendarDays size={16}/>{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div><h1>{user?'Welcome, '+user.split(' ')[0]:'Health overview'}</h1><p>Manage medicines, review interactions, and keep track of your health.</p></div><Link className="primary" to="/medicines"><Plus size={18}/> Add medicine</Link></div>
    <section className="hero"><div className="hero-content"><span className="hero-kicker"><ShieldCheck size={15}/> MEDICATION SAFETY</span><h2>Check for medication<br/>interactions.</h2><p>Look up combinations of medicines, supplements, and more against sourced interaction evidence.</p><Link className="hero-button" to="/checker">Check interactions <ArrowRight size={17}/></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/><div className="hero-shield"><ShieldCheck size={120} strokeWidth={1.25}/></div><span className="spark one">+</span><span className="spark two">+</span><span className="spark three">+</span></div>
    </section>
    <div className="section-heading"><h2>At a glance</h2></div>
    <div className="metrics">{metrics.map(([name,value,Icon,color])=><div className="card metric" key={name}><span className={'tile-icon '+color}><Icon size={20}/></span><strong>{loaded?value ?? 0:'—'}</strong><span>{name}</span></div>)}</div>
    <div className="grid">
      <section className="card"><div className="section-heading"><div><h2>Interaction activity</h2><p>Checks over the last seven days</p></div><span className="tag">Last 7 days</span></div>
      {loaded?<div className="chart"><ResponsiveContainer width="100%" height={175}><AreaChart data={trend}><CartesianGrid vertical={false} stroke="#e9eef2" strokeDasharray="4 4"/><XAxis dataKey="day" tickLine={false} axisLine={false}/><YAxis allowDecimals={false} width={22} tickLine={false} axisLine={false}/><Tooltip/><Area type="monotone" dataKey="checks" stroke="#0b956f" fill="#d9f5eb" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>:<div className="empty"><Activity size={27}/><strong>{user?'Loading activity':'Your activity will appear here'}</strong>{!user&&<Link to="/account">Sign in to view your checks <ArrowRight size={14}/></Link>}</div>}</section>
      <section className="card"><div className="section-heading"><div><h2>Safety overview</h2><p>Findings from your interaction checks</p></div><Shield className="muted" size={21}/></div><div className="risk-list">{['Contraindicated','Other label findings','Unresolved or no match'].map((name,i)=><div key={name}><span className={'dot dot'+i}/>{name}<strong>{loaded?counts[i]:'—'}</strong></div>)}</div></section>
    </div>
    <div className="grid"><section className="card"><div className="section-heading"><h2>Medication overview</h2><Link to="/medicines">View medicines <ArrowRight size={14}/></Link></div>
      {data.medicines?.length?<table><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Next dose</th><th>Status</th></tr></thead><tbody>{data.medicines.slice(0,5).map(row=><tr key={row.id}>{['name','dosage','frequency'].map(key=><td key={key}>{label(row[key])}</td>)}<td>{formatDate(doses.find(dose=>dose.medicine_id===row.id)?.scheduled_at)}</td><td>{label(row.status)}</td></tr>)}</tbody></table>:<p className="muted">No medicines to display.</p>}</section>
      <section className="card"><div className="section-heading"><h2>Upcoming reminders</h2><Link to="/reminders">View reminders <ArrowRight size={14}/></Link></div>{doses.length?doses.slice(0,4).map(row=><p key={row.id}>{label(data.medicines?.find(item=>item.id===row.medicine_id)?.name)} · {label(row.dosage)} · {formatDate(row.scheduled_at)}</p>):<p className="muted">No upcoming doses to display.</p>}</section></div>
    <section className="card"><div className="section-heading"><h2>Recent activity</h2><Link to="/history">Check history <ArrowRight size={14}/></Link></div>{[...checks.map(row=>({row,title:'Interaction check'})),...(data.medicines??[]).map(row=>({row,title:'Medicine added · '+label(row.name)})),...(data.prescriptions??[]).map(row=>({row,title:'Prescription uploaded'}))].sort((a,b)=>b.row.created_at.localeCompare(a.row.created_at)).slice(0,5).map(({row,title})=><p key={row.id}>{title} · {formatDate(row.created_at)}</p>)}{!loaded&&<p className="muted">Sign in to view your recent activity.</p>}</section>
  </>;
}
function Auth({onSession,session}:{onSession:(value:Session)=>void;session:Session|null}) {
  const [register,setRegister]=useState(false), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values=new FormData(event.currentTarget); setBusy(true); setError('');
    try {onSession(await service(import.meta.env.VITE_BACKEND_URL).signIn(register?'register':'login',String(values.get('email')),String(values.get('password')),String(values.get('name')??'')));}
    catch(error){setError(message(error));}finally{setBusy(false);}
  }
  return <section className="card auth"><span className="tile-icon mint"><ShieldCheck size={21}/></span><h1>{session?'Your account':register?'Create an account':'Sign in'}</h1>
    {session?<Link className="primary" to="/">Back to overview <ArrowRight size={16}/></Link>:<><p>Access your medication records and saved checks.</p><form onSubmit={submit}>
      {register&&<label>Name<input name="name" autoComplete="name" maxLength={120} required/></label>}<label>Email<input name="email" type="text" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'}/></label>
      {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button></form><button className="text-button" onClick={()=>setRegister(!register)}>{register?'Already have an account? Sign in':'Create an account'}</button></>}
  </section>;
}
function Records({section,data,api,refresh}:{section:Section;data:Data;api:Api;refresh:()=>Promise<void>}) {
  const [edit,setEdit]=useState<RecordRow|null>(null), [show,setShow]=useState(false), [filter,setFilter]=useState(''), [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const definition=sections[section], rows=data[section]??[];
  async function run(operation:()=>Promise<unknown>) {
    setBusy(true);setError('');
    try { await operation(); await refresh(); }catch(error){setError(message(error));}finally{setBusy(false);}
  }
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); const form=new FormData(event.currentTarget);
    void run(async()=>{
      const values=recordValues(Object.fromEntries(definition.fields.map(([key])=>[key,String(form.get(key)??'')])),definition.fields.filter(field=>field[2]==='datetime-local').map(([key])=>key));
      if (section==='prescriptions'&&!edit) {
        const file=form.get('file');
        if (!(file instanceof File)||!file.size||file.size>10485760) throw new Error('Choose a PDF, PNG or JPEG up to 10 MB.');
        const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
        Object.assign(values,{file:encoded,mime:file.type});
      }
      await api.save(section,values,edit?.id);setShow(false);setEdit(null);
    });
  };
  const shown=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()));
  return <><div className="page-head"><div><h1>{definition.title}</h1><p>Manage your {definition.title.toLowerCase()} in one place.</p></div><button className="primary" onClick={()=>{setEdit(null);setShow(true);}}><Plus size={17}/> Add record</button></div>
    {error&&<p className="error" role="alert">{error}</p>}{show&&<section className="card"><div className="section-heading"><h2>{edit?'Edit record':'New record'}</h2><button className="icon" aria-label="Close" onClick={()=>setShow(false)}><X size={18}/></button></div><form onSubmit={submit} key={edit?.id??'new'} className="record-form">{definition.fields.map(field=>{
      const [key,title,type]=field as readonly [string,string,string?]; let value=String(edit?.[key]??(section==='alcohol_entries'&&key==='name'?'Alcohol':''));
      if(value&&type==='datetime-local'){const date=new Date(value);value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
      const opts=type==='medicine'?(data.medicines??[]).map(row=>[row.id,label(row.name)]):type?.startsWith('choice:')?type.slice(7).split(',').map(option=>[option,option]):null;
      return <label key={key}>{title}{opts?<select name={key} defaultValue={value||opts[0]?.[0]}>{opts.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>:key==='name'&&(section==='medicines'||section==='supplements')?<CatalogInput kind={section==='medicines'?'medicine':'supplement'} name={key} initial={value}/>:<input name={key} type={type??'text'} defaultValue={value}/>}</label>;
    })}{section==='prescriptions'&&!edit&&<label>Prescription file<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required/></label>}<button className="primary" disabled={busy}>Save record</button></form></section>}
    <section className="card"><div className="section-heading"><input aria-label="Filter records" placeholder="Search records" value={filter} onChange={event=>setFilter(event.target.value)}/><Exports title={definition.title} rows={rows}/></div>
      {!shown.length?<p className="muted">No matching records.</p>:<div className="table-wrap"><table><thead><tr>{definition.fields.map(([key,title])=><th key={key}>{title}</th>)}<th>Actions</th></tr></thead><tbody>{shown.map(row=><tr key={row.id}>{definition.fields.map(field=><td key={field[0]}>{field[2]==='datetime-local'?formatDate(row[field[0]]):field[2]==='medicine'?label(data.medicines?.find(item=>item.id===row.medicine_id)?.name):label(row[field[0]])}</td>)}<td><div className="actions">
      <button className="text-button" onClick={()=>{setEdit(row);setShow(true);}}>Edit</button><button className="text-button danger" disabled={busy} onClick={()=>{if(window.confirm('Delete this record?'))void run(()=>api.remove(section,row.id));}}>Delete</button>
      {section==='prescriptions'&&<button className="text-button" onClick={()=>void run(async()=>{const res=await api.file(row.id);download(await res.blob(),'prescription.'+({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[res.headers.get('Content-Type')??'']??'bin'));})}>Download</button>}
      {section==='reminders'&&['taken','skipped'].map(outcome=><button className="text-button" key={outcome} disabled={busy} onClick={()=>void run(()=>api.dose(row,outcome))}>{outcome}</button>)}</div></td></tr>)}</tbody></table></div>}</section>
    {section==='reminders'&&<><BrowserAlerts rows={rows}/><section className="card"><div className="section-heading"><h2>Dose history</h2><Exports title="Dose history" rows={data.reminder_logs??[]}/></div>{data.reminder_logs?.map(row=><p key={row.id}>{label(row.outcome)} · {formatDate(row.scheduled_at)}</p>)}</section></>}
    {section==='health_records'&&<HealthTrends rows={rows}/>}
  </>;
}
function BrowserAlerts({rows}:{rows:RecordRow[]}) {
  const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('');
  const fired=useRef(new Set<string>());
  useEffect(()=>{
    if(!enabled)return;
    const tick=()=>{
      const end=Date.now();
      for(const row of rows) {
        const key=row.id+':'+String(row.scheduled_at);
        const time=Date.parse(String(row.scheduled_at));
        if(end<time||end-time>60000||fired.current.has(key))continue;
        try {
          new Notification('Medication reminder',{body:'Open PharmAlert to review your scheduled dose.'});
          fired.current.add(key);
        } catch {setEnabled(false);setStatus('This browser could not display an alert.');break;}
      }
    };
    tick();
    const interval=window.setInterval(tick,10000);
    return ()=>window.clearInterval(interval);
  },[rows,enabled]);
  return <section className="card"><div className="section-heading"><div><h2>Browser alerts</h2><p>Alerts run while this Reminders page is open.</p></div>
    <button className="secondary" onClick={async()=>{
      if(enabled){setEnabled(false);setStatus('Browser alerts paused.');return;}
      if(!('Notification' in window)){setStatus('Browser notifications are unavailable.');return;}
      try {const allowed=await Notification.requestPermission()==='granted';setEnabled(allowed);setStatus(allowed?'Browser alerts enabled.':'Notification permission is off.');}
      catch {setStatus('Browser notifications are unavailable.');}
    }}>{enabled?'Pause alerts':'Enable alerts'}</button></div>{status&&<p role="status">{status}</p>}</section>;
}
const kinds:Kind[]=['medicine','supplement','alcohol','food'];
function Checker({api,data,refresh}:{api:Api;data:Data;refresh:()=>Promise<void>}) {
  const [items,setItems]=useState<Substance[]>([{name:'',kind:'medicine'},{name:'',kind:'medicine'}]);
  const [result,setResult]=useState<Analysis|null>(null), [error,setError]=useState(''),[busy,setBusy]=useState(false);
  function change(index:number, values:Partial<Substance>){setResult(null);setItems(items.map((item,i)=>i===index?{...item,...values}:item));}
  return <><div className="page-head"><div><h1>Interaction checker</h1><p>Look up a combination in the available source records.</p></div></div><section className="card"><h2>Substances to check</h2><p className="muted">{disclaimer}</p>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');setResult(null);try{setResult(await api.check(items));await refresh();}catch(error){setError(message(error));}finally{setBusy(false);}}}>
      <datalist id="saved-names">{[...(data.medicines??[]),...(data.supplements??[])].map(row=><option key={row.id} value={String(row.name)}/>)}</datalist>
      {items.map((item,i)=><div className="checker-row" key={i}><label>Category<select disabled={busy} value={item.kind} onChange={event=>change(i,{kind:event.target.value as Kind,name:event.target.value==='alcohol'?'Alcohol':''})}>{kinds.map(kind=><option key={kind}>{kind}</option>)}</select></label>{item.kind!=='alcohol'&&<label>Substance {i+1}<CatalogInput kind={item.kind} value={item.name} disabled={busy} required saved={item.kind==='food'?[]:(data[item.kind==='medicine'?'medicines':'supplements']??[]).map(r=>String(r.name))} onChange={name=>change(i,{name})}/></label>}{items.length>2&&<button className="icon" disabled={busy} type="button" aria-label={'Remove substance '+(i+1)} onClick={()=>{setItems(items.filter((_,index)=>index!==i));setResult(null);}}><X size={17}/></button>}</div>)}
      <div className="actions"><button className="secondary" type="button" disabled={busy||items.length===20} onClick={()=>{setItems([...items,{name:'',kind:'medicine'}]);setResult(null);}}><Plus size={17}/> Add substance</button><button className="primary" disabled={busy}><ShieldCheck size={17}/>{busy?'Checking…':'Check interactions'}</button></div>
    </form>{error&&<p className="error" role="alert">{error}</p>}</section>{result&&<Report report={result}/>}</>;
}
function Report({report}:{report:Analysis}) {
  return <section className="card"><div className="section-heading"><h2>Interaction report</h2><Exports title="Interaction report" rows={[report]}/></div>
    <p className="muted">{report.dataset.name} · {report.dataset.version} · {report.dataset.license}</p>
    {report.duplicates.length>0&&<p>Duplicate entries merged: {report.duplicates.join(', ')}.</p>}
    {report.pairs.map((pair,i)=><article className="pair" key={i}><h3>{pair.left} + {pair.right}</h3>
      {pair.status==='matched'?pair.matches.map(rule=><div key={rule.rule_id}><span className={rule.display==='contraindicated'?'badge severe':'badge'}>{rule.classification}</span><p>{rule.description}</p><p>{rule.management}</p><a href={rule.evidence} target="_blank" rel="noreferrer">Source label · {rule.updated_on}</a></div>):<p>{evidenceMessages[pair.status as keyof typeof evidenceMessages]}</p>}</article>)}
    <p className="muted">{disclaimer}</p></section>;
}
function History({api,rows,refresh}:{api:Api;rows:RecordRow[];refresh:()=>Promise<void>}) {
  const [query,setQuery]=useState(''),[level,setLevel]=useState(''),[selected,setSelected]=useState<Analysis|null>(null),[error,setError]=useState('');
  return <><div className="page-head"><div><h1>Check history</h1><p>Review saved interaction reports and their source versions.</p></div><Exports title="Check history" rows={rows}/></div><section className="card"><div className="actions"><input aria-label="Search history" placeholder="Search combinations" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Filter risk" value={level} onChange={event=>setLevel(event.target.value)}><option value="">All findings</option>{['contraindicated','other','unknown'].map(value=><option key={value}>{value}</option>)}</select></div>
    {error&&<p className="error">{error}</p>}{!rows.length&&<p className="muted">No checks saved yet.</p>}
    {rows.filter(row=>JSON.stringify(row.inputs).toLowerCase().includes(query.toLowerCase())&&(!level||(row.report as Analysis).highest===level)).map(row=>{const report=row.report as Analysis;return <div className="pair" key={row.id}><div className="section-heading"><div><strong>{(row.inputs as Substance[]).map(item=>item.name).join(' + ')}</strong><p>{formatDate(row.created_at)} · {report.matchCount} matched · {report.highest}</p></div><div className="actions"><button className="secondary" onClick={()=>setSelected(report)}>View report</button><button className="text-button danger" onClick={async()=>{if(window.confirm('Delete this check?'))try{await api.remove('interaction_checks',row.id);setSelected(null);await refresh();}catch(error){setError(message(error));}}}>Delete</button></div></div></div>;})}
    </section>{selected&&<Report report={selected}/>}</>;
}
function Profile({api,session,remember}:{api:Api;session:Session;remember:(value:Session)=>void}) {
  const [status,setStatus]=useState('');
  return <section className="card auth"><h1>Settings</h1><p>{session.user.email}</p><form onSubmit={async event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('name'));try{remember({...session,user:await api.profile(name)});setStatus('Profile saved.');}catch(error){setStatus(message(error));}}}><label>Display name<input name="name" defaultValue={session.user.name} required maxLength={120}/></label><button className="primary">Save profile</button><p role="status">{status}</p></form></section>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>);
