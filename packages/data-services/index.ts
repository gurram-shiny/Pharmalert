import { disclaimer, type RecordRow } from '@pharmalert/shared';
import { clinicalReleaseVersion,type Analysis,type Substance } from '@pharmalert/interaction-engine';

export type User = { id:string; name:string; email:string };
export type Session = { token:string; user:User };
export const CLOUD_API_BASE = 'https://qkbbeckqyegvaeqgzvbk.supabase.co/functions/v1/pharmalert-api';
const DEFAULT_API_BASE = CLOUD_API_BASE;
let cloudReady: Promise<void> | undefined;
function checkCloudBackend() {
  cloudReady ??= fetch(CLOUD_API_BASE + '/api/status', {cache:'no-store'})
    .then(async response => {
      if (!response.ok || (await response.json()).auth_provider !== 'supabase-auth-v1')
        throw new Error('Cloud sign-in is awaiting the PharmAlert backend update.');
    })
    .catch(error => { cloudReady = undefined; throw error; });
  return cloudReady;
}
function currentReport(report:Analysis|undefined){
  return report?.dataset?.version===clinicalReleaseVersion && Array.isArray(report.pairs) &&
    report.pairs.every(pair=>Array.isArray(pair.matches)&&pair.matches.every(rule=>rule.verification_status==='VERIFIED'&&
      Boolean(rule.evidence_passage)&&rule.management===rule.evidence_passage));
}
export function service(base = DEFAULT_API_BASE, token?: string) {
  const apiBase = (base || DEFAULT_API_BASE).replace(/\/$/,'');
  const request = async (path:string, method = 'GET', body?:unknown) => {
    if (apiBase === CLOUD_API_BASE) await checkCloudBackend();
    const response = await fetch(apiBase + '/api/' + path, {
      method, headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...(token ? {Authorization:'Bearer '+token} : {}) },
      body:body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(()=>null);
      throw new Error(data?.error ?? 'The request could not be completed.');
    }
    return response;
  };
  const json = async <T>(path:string, method?:string, body?:unknown):Promise<T> => (await request(path,method,body)).json();
  return {
    list: async (table:string) => {
      const rows=await json<RecordRow[]>(table);
      if(table!=='interaction_checks')return rows;
      return rows.map(row=>{
        if(currentReport(row.report as Analysis))return row;
        return {...row,report:{dataset:{name:'Archived report · check these inputs again',version:'Prior evidence release',license:'',source_url:''},
          duplicates:[],pairs:[],highest:'unknown',matchCount:0} satisfies Analysis};
      });
    },
    save: (table:string, values:Record<string,unknown>, id?:string) => json<RecordRow>(table+(id?'/'+id:''),id?'PATCH':'POST',values),
    remove: (table:string, id:string) => json(table+'/'+id,'DELETE'),
    check: async (substances:Substance[]) => {
      const result=await json<Analysis>('check','POST',{substances});
      if(!currentReport(result))throw new Error('The server returned an unaudited evidence release. No findings can be displayed.');
      return result;
    },
    dose: (row:RecordRow, outcome:string) => json('reminders/'+row.id+'/dose','POST',{outcome,scheduled_at:row.scheduled_at}),
    file: (id:string) => request('prescriptions/'+id+'/file'),
    signIn: (mode:'login'|'register', email:string, password:string, name:string) => json<Session>('auth/'+mode,'POST',{email,password,name}),
    current: () => json<User>('auth/session'),
    profile: (name:string) => json<User>('auth/profile','PATCH',{name}),
    logout: () => json('auth/logout','POST'),
  };
}
export function toCsv(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => !['user_id','storage_path'].includes(key));
  const escape = (value: unknown) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return '"' + (/^\s*[=+@-]|^[\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"','""') + '"';
  };
  return [keys.map(escape).join(','), ...rows.map(row=>keys.map(key=>escape(row[key])).join(',')), '', escape(disclaimer)].join('\r\n');
}
export function reportHtml(title: string, rows: Record<string,unknown>[]) {
  const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const content = rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key])=>!['user_id','storage_path'].includes(key))), null, 2));
  return '<!doctype html><meta charset="utf-8"><title>'+escape(title)+'</title><style>body{font:15px system-ui;margin:2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>'+escape(title)+'</h1><p>'+escape(disclaimer)+'</p>'+content.map(row=>'<pre>'+escape(row)+'</pre>').join('');
}
export function recordValues(values: Record<string,string>, dateFields: string[]) {
  return Object.fromEntries(Object.entries(values).map(([key,value])=>[key, value.trim() ? (dateFields.includes(key) ? new Date(value).toISOString() : value.trim()) : null]));
}
