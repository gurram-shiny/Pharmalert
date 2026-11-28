import { clean, RecordValidationError } from '../../../packages/shared/record-validation.ts';
import { sections, fileTypes, maxFileSize, type Section } from '../../../packages/shared/index.ts';

function prescriptionBytes(file: unknown, mime: unknown) {
  if (typeof file !== 'string' || file.length > 4*Math.ceil(maxFileSize/3) || !fileTypes.includes(String(mime)))
    throw new RecordValidationError('Choose a PDF, PNG or JPEG up to 10 MB.');
  let raw: string;
  try {raw = atob(file);} catch {throw new RecordValidationError('Invalid file encoding.');}
  const signature = mime === 'application/pdf' ? '%PDF-' : mime === 'image/png' ? '\x89PNG\r\n\x1a\n' : '\xff\xd8\xff';
  if (!raw.startsWith(signature) || raw.length > maxFileSize) throw new RecordValidationError('Invalid file or file exceeds 10 MB.');
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

import {checkInputs,dataset,rules,validateRelease} from '../../../datasets/release.ts';
validateRelease();
function send(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: token ? { Authorization: "Bearer " + token } : {} },
    },
  );
  const profile = (user: {id: string; email?: string; user_metadata: Record<string, unknown>}) => ({
    id: user.id, email: user.email, name: String(user.user_metadata.name ?? user.email ?? ""),
  });

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const apiIdx = parts.indexOf("api");
    const [section, id, action] = apiIdx >= 0 ? parts.slice(apiIdx + 1) : parts.slice(1);
    const method = req.method;

    if (section === "status" && method === "GET") return send({ dataset, records: rules.length, auth_provider: "supabase-auth-v1" });

    if (section === "auth" && method === "POST" && (id === "register" || id === "login")) {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email || typeof body.password !== "string" || !body.password)
        return send({error: "Enter your email and password."}, 400);
      const credentials = {email, password: body.password};
      const {data, error} = id === "register"
        ? await supabase.auth.signUp({...credentials, options: {data: {name: String(body.name ?? "").trim()}}})
        : await supabase.auth.signInWithPassword(credentials);
      if (error) return send({error: error.message}, error.status ?? 400);
      if (!data.session || !data.user)
        return send({error: "Check your email to confirm your account, then sign in."}, 403);
      return send({token: data.session.access_token, user: profile(data.user)});
    }

    if (!token) return send({error: "Sign in to continue."}, 401);
    const {data: identity, error: authError} = await supabase.auth.getUser(token);
    if (authError || !identity.user) return send({error: "Your session has expired."}, 401);
    const user = profile(identity.user);
    if (section === "auth" && id === "session" && method === "GET") return send(user);
    if (section === "auth" && id === "logout" && method === "POST") {
      const result = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/logout?scope=local", {
        method: "POST", headers: {Authorization: "Bearer " + token, apikey: Deno.env.get("SUPABASE_ANON_KEY")!},
      });
      return result.ok ? send({}) : send({error: "Sign-out failed."}, result.status);
    }
    if (section === "auth" && id === "profile" && method === "PATCH") {
      const body = await req.json();
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return send({error: "Enter a name."}, 400);
      const response = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", {
        method: "PUT", headers: {Authorization: "Bearer " + token, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json"},
        body: JSON.stringify({data: {name}}),
      });
      return response.ok ? send({...user, name}) : send({error: "Profile update failed."}, response.status);
    }

    if (section === "check" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const input=body.substances;
      let report;
      try {report=checkInputs(input);} catch(error){return send({error:String(error)},400);}
      await supabase.from("records").insert({ owner: user.id, section: "interaction_checks", payload: { inputs: input, report } }).throwOnError();
      return send(report);
    }

    const editable = Object.hasOwn(sections,section);
    if (!editable && !['interaction_checks','reminder_logs','notifications'].includes(section)) return send({error:'Unknown section.'},404);
    if (method === "GET" && !id) {
      const { data: rows } = await supabase.from("records").select("id,created_at,payload").eq("owner", user.id).eq("section", section).order("created_at", { ascending: false }).throwOnError();
      return send((rows ?? []).map((r: any) => ({ ...r.payload, ...(section==="interaction_checks"?{report:checkInputs(r.payload.inputs)}:{}), id: r.id, created_at: r.created_at })));
    }

    const unavailable = () => send({error:'Record unavailable.'},404);
    const owned = () => supabase.from('records').select('payload,revision').eq('owner',user.id).eq('section',section).eq('id',id).maybeSingle().throwOnError();
    if (section === 'reminders' && action === 'dose' && method === 'POST') {
      const body = await req.json();
      if (!['taken','skipped'].includes(body?.outcome) || typeof body.scheduled_at !== 'string') return send({error:'Invalid dose.'},400);
      const {data:status} = await supabase.rpc('pharmalert_record_dose',{reminder:id,scheduled:body.scheduled_at,outcome:body.outcome}).throwOnError();
      if (status === 404) return unavailable();
      return status === 200 ? send({}) : send({error:status === 409 ? 'This dose was already updated.' : 'Invalid reminder.'},status);
    }
    if (section === 'prescriptions' && action === 'file' && method === 'GET') {
      const {data} = await supabase.from('records').select('file_base64,mime').eq('id',id).eq('owner',user.id).eq('section',section).maybeSingle().throwOnError();
      if (!data?.file_base64) return unavailable();
      return new Response(prescriptionBytes(data.file_base64,data.mime),{headers:{...corsHeaders,'Content-Type':data.mime,'Content-Disposition':'attachment','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
    }
    if (action) return unavailable();
    if (method === 'DELETE' && id) {
      const {data} = await supabase.from('records').delete().eq('id',id).eq('owner',user.id).eq('section',section).select('id').maybeSingle().throwOnError();
      return data ? send({}) : unavailable();
    }
    if (editable && ((method === 'POST' && !id) || (method === 'PATCH' && id))) {
      const body = await req.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send({error:'Invalid request.'},400);
      const existing = id ? (await owned()).data : null;
      if (id && !existing) return unavailable();
      const payload = clean(section as Section,{...existing?.payload,...body});
      if (section === 'reminders') {
        const {data:medicine} = await supabase.from('records').select('id').eq('id',payload.medicine_id).eq('owner',user.id).eq('section','medicines').maybeSingle().throwOnError();
        if (!medicine) return send({error:'Select one of your medicines.'},400);
      }
      const attachment: {file_base64?:string; mime?:string} = {};
      if (!id && section === 'prescriptions') {
        prescriptionBytes(body.file,body.mime);
        attachment.file_base64 = body.file;
        attachment.mime = body.mime;
      }
      const table = supabase.from('records');
      const write = existing ? table.update({payload}).eq('owner',user.id).eq('id',id).eq('revision',existing.revision)
        : table.insert({owner:user.id,section,payload,...attachment});
      const {data} = await write.select('id,created_at').maybeSingle().throwOnError();
      return data ? send({...payload,...data},id ? 200 : 201) : send({error:'Record changed. Reload and retry.'},409);
    }
    if (!editable) return send({error:'Read-only record.'},405);
    return send({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof RecordValidationError || err instanceof SyntaxError) return send({error:err.message},400);
    return send({error:'The request could not be completed.'},500);
  }
});
