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

    if(section==="interaction_checks" && ["POST","PATCH"].includes(method))return send({error:"Read-only report"},405);
    if (method === "GET" && !id) {
      const { data: rows } = await supabase.from("records").select("id,created_at,payload").eq("owner", user.id).eq("section", section).order("created_at", { ascending: false }).throwOnError();
      return send((rows ?? []).map((r: any) => ({ ...r.payload, ...(section==="interaction_checks"?{report:checkInputs(r.payload.inputs)}:{}), id: r.id, created_at: r.created_at })));
    }

    if (method === "POST" && !id) {
      const payload = await req.json().catch(() => ({}));
      const { data: row, error } = await supabase.from("records").insert({ owner: user.id, section, payload }).select("id,created_at,payload").single();
      if (error) return send({ error: error.message }, 400);
      return send({ ...row.payload, id: row.id, created_at: row.created_at }, 201);
    }

    if (method === "PATCH" && id) {
      const payload = await req.json().catch(() => ({}));
      const { data: row, error } = await supabase.from("records").update({ payload }).eq("id", id).eq("owner", user.id).eq("section", section).select("id,created_at,payload").single();
      if (error || !row) return send({ error: "Record unavailable." }, 404);
      return send({ ...row.payload, id: row.id, created_at: row.created_at });
    }

    if (method === "DELETE" && id) {
      await supabase.from("records").delete().eq("id", id).eq("owner", user.id).eq("section", section).throwOnError();
      return send({});
    }

    if (section === "reminders" && id && action === "dose" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      await supabase.from("records").insert({ owner: user.id, section: "reminder_logs", payload: { reminder_id: id, outcome: body.outcome, scheduled_at: body.scheduled_at } }).throwOnError();
      return send({});
    }

    return send({ error: "Not found." }, 404);
  } catch (err) {
    return send({ error: (err as Error).message || "The request could not be completed." }, 500);
  }
});
