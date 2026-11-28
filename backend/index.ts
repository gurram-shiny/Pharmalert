import {clean, RecordValidationError} from '../packages/shared/record-validation.ts';
import { createServer, type IncomingMessage } from 'node:http';
import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyze, parseSubstances, resolveSubstances } from '../packages/interaction-engine/index.ts';
import { sections, fileTypes, maxFileSize } from '../packages/shared/index.ts';
import { dataset, identifiers, rules, heldPairs, checkInputs, validateRelease } from '../datasets/release.ts';

validateRelease();
mkdirSync('data',{recursive:true});
const db = new DatabaseSync(process.env.PHARMALERT_DB ?? 'data/pharmalert.sqlite');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
create table if not exists accounts(id text primary key, email text unique not null, password text not null, name text not null);
create table if not exists sessions(hash text primary key, owner text not null references accounts on delete cascade, expires integer not null);
create table if not exists records(id text primary key, owner text not null references accounts on delete cascade,
  section text not null, created_at text not null, payload text not null, file blob, mime text);
create index if not exists owner_section on records(owner,section,created_at desc);`);

const derive = promisify(scrypt);
const execFileAsync = promisify(execFile);
const allowed = new Set([...Object.keys(sections),'interaction_checks','reminder_logs','notifications']);
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const webBuild = new URL('../apps/web-frontend/dist/',import.meta.url);
const contentTypes: Record<string,string> = {js:'text/javascript',css:'text/css',png:'image/png',svg:'image/svg+xml',woff2:'font/woff2'};
class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function reject(status: number, message: string): never { throw new RequestError(status,message); }
async function body(req: IncomingMessage, limit = 32_000) {
  const parts: Buffer[] = [];
  let length = 0;
  for await (const part of req) {
    length += part.length;
    if (length > limit) reject(413,'Request is too large.');
    parts.push(part);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400,'Invalid request.');
    return value;
  } catch { reject(400,'Invalid request.'); }
}
type Stored = { id:string; created_at:string; payload:string; file?:Uint8Array; mime?:string };
const unpack = (row: Stored) => ({ ...JSON.parse(row.payload), id:row.id, created_at:row.created_at });
const lookup = (id:string, owner:string, section:string, withFile = false) =>
  db.prepare('select id,created_at,payload'+(withFile?',file,mime':'')+' from records where id=? and owner=? and section=?').get(id,owner,section) as Stored | undefined;
function insert(owner:string, section:string, payload:unknown, file?:Buffer, mime?:string) {
  const row = {id:randomUUID(),created_at:now(),payload:JSON.stringify(payload)};
  db.prepare('insert into records values(?,?,?,?,?,?,?)').run(row.id,owner,section,row.created_at,row.payload,file ?? null,mime ?? null);
  return unpack(row);
}
function checkFile(bytes:Buffer,mime:string) {
  return mime === 'application/pdf' ? bytes.subarray(0,5).toString() === '%PDF-' :
    mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) :
    mime === 'image/jpeg' && bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
}
const limits = new Map<string,{count:number; until:number}>();
function rate(key:string,max:number) {
  const time = Date.now();
  if (limits.size >= 5000) for (const [id,entry] of limits) if (entry.until <= time) limits.delete(id);
  const entry = limits.get(key);
  if (entry && entry.until > time) {
    if (entry.count >= max) reject(429,'Too many requests. Try again in a minute.');
    entry.count++;
  } else {
    if (limits.size >= 10000) reject(503,'Service busy.');
    limits.set(key,{count:1,until:time+60000});
  }
}
const server = createServer(async (req,res) => {
  const send = (value:unknown,status=200) => {
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(value));
  };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const [,api,section,id,action] = url.pathname.split('/');
    const method = req.method;
    if (api !== 'api') {
      if (method !== 'GET' && method !== 'HEAD') reject(405,'Method not allowed.');
      const asset = url.pathname.match(/^\/assets\/([A-Za-z0-9._-]+\.([a-z0-9]+))$/);
      const assetType = asset && contentTypes[asset[2]];
      if (url.pathname.startsWith('/assets/') && !assetType) reject(404,'Asset unavailable.');
      const filename = asset && assetType ? 'assets/'+asset[1] : 'index.html';
      const file = await readFile(fileURLToPath(new URL(filename,webBuild).href)).catch(()=>null);
      if (!file) reject(404,'Web content unavailable.');
      res.writeHead(200,{'Content-Type':assetType || 'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'sha256-oNvlAFZRT+y0AFT3rzWuc3WC7cZgg3Su0bIS78xTpS4='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",'Cache-Control':assetType?'public, max-age=31536000, immutable':'no-cache'});
      res.end(method==='HEAD'?undefined:file);
      return;
    }
    if (section === 'status' && method === 'GET') return send({dataset, records:rules.length});
    if (section === 'auth' && method === 'POST' && (id === 'register' || id === 'login')) {
      rate('auth:'+req.socket.remoteAddress,15);
      const { email, password, name } = await body(req);
      const accountEmail = (typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : '');
      const rawPassword = typeof password === 'string' ? password : '';
      let account = db.prepare('select * from accounts where email=?').get(accountEmail) as { id:string; email:string; name:string; password:string } | undefined;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail) || !rawPassword || rawPassword.length>1024) reject(400,'Enter a valid email and password.');
      if (id === 'login') {
        const [salt,stored] = account?.password.split(':') ?? ['', ''];
        const computed = await derive(rawPassword,salt,64) as Buffer;
        const expected = Buffer.from(stored,'hex');
        if (!account || computed.length !== expected.length || !timingSafeEqual(computed,expected)) reject(401,'Invalid login credentials.');
      } else if (account) {
        reject(409,'Account already registered.');
      }
      if (!account) {
        const salt = randomBytes(16).toString('hex');
        const key = await derive(rawPassword,salt,64) as Buffer;
        const displayName = typeof name === 'string' && name.trim() ? name.trim() : accountEmail.split('@')[0] || 'User';
        account = { id:randomUUID(), email:accountEmail, name:displayName, password:salt+':'+key.toString('hex') };
        db.prepare('insert into accounts values(?,?,?,?)').run(account.id,account.email,account.password,account.name);
      }
      const token = randomBytes(32).toString('base64url');
      db.prepare('delete from sessions where expires<=?').run(Date.now());
      db.prepare('insert into sessions values(?,?,?)').run(tokenHash(token),account.id,Date.now()+7*86400000);
      return send({token,user:{id:account.id,email:account.email,name:account.name}});
    }
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) reject(401,'Sign in to continue.');
    const hash = tokenHash(token);
    const user = db.prepare('select accounts.id,email,name from sessions join accounts on owner=accounts.id where hash=? and expires>?').get(hash,Date.now()) as {id:string; email:string; name:string} | undefined;
    if (!user) reject(401,'Your session has expired.');
    if (section === 'auth' && id === 'session' && method === 'GET') return send(user);
    if (section === 'auth' && id === 'logout' && method === 'POST') {
      db.prepare('delete from sessions where hash=?').run(hash);
      return send({});
    }
    if (section === 'auth' && id === 'profile' && method === 'PATCH') {
      const {name} = await body(req);
      if (typeof name !== 'string' || !name.trim() || name.length > 120) reject(400,'Enter a valid name.');
      db.prepare('update accounts set name=? where id=?').run(name.trim(),user.id);
      return send({...user,name:name.trim()});
    }
    if (section === 'research' && id === 'screen' && method === 'POST') {
      rate('research:'+user.id,15);
      const { text, drug1, drug2 } = await body(req);
      if (typeof text !== 'string' || !text.trim() || typeof drug1 !== 'string' || !drug1.trim() || typeof drug2 !== 'string' || !drug2.trim()) {
        reject(400,'Provide passage text, drug1, and drug2.');
      }
      const { stdout } = await execFileAsync('python', ['ml-research/review.py', text, drug1, drug2], { timeout: 15000 });
      const result = JSON.parse(stdout);
      return send({ ...result, research_only: true, note: 'Offline ML screening for research review only; does not replace verified FDA label rules.' });
    }
    if (section === 'check' && method === 'POST') {
      rate('check:'+user.id,15);
      const input = await body(req);
      let parsed, resolved;
      try { parsed = parseSubstances(input.substances); resolved = resolveSubstances(parsed,identifiers); }
      catch (error) { return send({error:(error as Error).message},400); }
      const report = analyze(resolved,rules,dataset,heldPairs);
      insert(user.id,'interaction_checks',{inputs:parsed,report});
      return send(report);
    }
    if (!allowed.has(section)) reject(404,'Record unavailable.');
    if (method === 'GET' && !id) {
      const rows = db.prepare('select id,created_at,payload from records where owner=? and section=? order by created_at desc').all(user.id,section);
      return send((rows as Stored[]).map(unpack).map(r=>section==='interaction_checks'?{...r,report:checkInputs(r.inputs)}:r));
    }
    const row = id ? lookup(id,user.id,section,section === 'prescriptions' && action === 'file') : undefined;
    if (id && !row) reject(404,'Record unavailable.');
    if (section === 'prescriptions' && action === 'file' && row?.file && method === 'GET') {
      res.writeHead(200,{'Content-Type':row.mime ?? 'application/octet-stream','Content-Disposition':'attachment','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(row.file);
      return;
    }
    if (section === 'reminders' && action === 'dose' && row && method === 'POST') {
      const {outcome, scheduled_at} = await body(req);
      if (!['taken','skipped'].includes(outcome)) reject(400,'Invalid dose outcome.');
      const current = lookup(row.id,user.id,section);
      if (!current) reject(404,'Record unavailable.');
      const data = unpack(current);
      if (scheduled_at !== data.scheduled_at) reject(409,'This dose was already updated.');
      db.exec('begin');
      try {
        insert(user.id,'reminder_logs',{reminder_id:row.id, dosage:data.dosage, scheduled_at, outcome});
        if (data.repeat === 'once') db.prepare('delete from records where id=? and owner=?').run(row.id,user.id);
        else {
          data.scheduled_at = new Date(Date.parse(data.scheduled_at)+(data.repeat === 'daily'?1:7)*86400000).toISOString();
          db.prepare('update records set payload=? where id=? and owner=?').run(JSON.stringify(data),row.id,user.id);
        }
        db.exec('commit');
      } catch (error) { db.exec('rollback'); throw error; }
      return send({});
    }
    if (method === 'DELETE' && row) {
      if (section === 'medicines') {
        const dependent = db.prepare("select 1 from records where owner=? and section='reminders' and json_extract(payload,'$.medicine_id')=?").get(user.id,row.id);
        if (dependent) reject(409,'Remove this medicine’s reminders before deleting it.');
      }
      db.prepare('delete from records where id=? and owner=?').run(row.id,user.id);
      return send({});
    }
    if (!(section in sections) || action || (method !== 'POST' && method !== 'PATCH') || (method==='PATCH' && !row) || (method==='POST' && id)) reject(405,'Method not allowed.');
    const input = await body(req,section === 'prescriptions' ? Math.ceil(maxFileSize * 4/3)+16000 : 32000);
    const values = clean(section as keyof typeof sections,row ? {...JSON.parse(row.payload),...input} : input);
    if (section === 'reminders' && !lookup(String(values.medicine_id),user.id,'medicines')) reject(400,'Select one of your medicines.');
    if (row) {
      const updated = db.prepare('update records set payload=? where id=? and owner=?').run(JSON.stringify(values),row.id,user.id);
      if (!updated.changes) reject(404,'Record unavailable.');
      return send({...values,id:row.id,created_at:row.created_at});
    }
    if (section === 'prescriptions') {
      const { file,mime } = input;
      if (typeof file !== 'string' || !fileTypes.includes(mime)) reject(400,'Choose a PDF, PNG or JPEG.');
      const bytes = Buffer.from(file,'base64');
      if (bytes.length > maxFileSize || !checkFile(bytes,mime)) reject(400,'Invalid file or file exceeds 10 MB.');
      return send(insert(user.id,section,values,bytes,mime),201);
    }
    return send(insert(user.id,section,values),201);
  } catch (error) {
    if (error instanceof RecordValidationError) return send({error:error.message},400);
    if (error instanceof RequestError) return send({error:error.message},error.status);
    return send({error:'The request could not be completed.'},500);
  }
});
server.listen(Number(process.env.PORT ?? 8787),process.env.PHARMALERT_HOST ?? '0.0.0.0',()=>console.log('PharmAlert backend listening.'));
