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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const apiIdx = parts.indexOf("api");
    const [section, id, action] = apiIdx >= 0 ? parts.slice(apiIdx + 1) : parts.slice(1);
    const method = req.method;

    if (section === "status" && method === "GET") return send({ dataset, records: rules.length });

    if (section === "auth" && method === "POST" && (id === "register" || id === "login")) {
      const body = await req.json().catch(() => ({}));
      const accountEmail = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : "guest@local";
      const displayName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : accountEmail.split("@")[0] || "User";

      let { data: account } = await supabase.from("app_accounts").select("id,email,name").eq("email", accountEmail).maybeSingle();
      if (!account) {
        const { data: created, error } = await supabase.from("app_accounts").insert({ email: accountEmail, name: displayName }).select("id,email,name").single();
        if (error) return send({ error: error.message }, 500);
        account = created;
      }

      const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const expires = new Date(Date.now() + 30 * 86400000).toISOString();
      await supabase.from("app_sessions").insert({ token, owner: account.id, expires });
      return send({ token, user: account });
    }

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return send({ error: "Sign in to continue." }, 401);

    const { data: sessionRow } = await supabase.from("app_sessions").select("owner, expires").eq("token", token).maybeSingle();
    if (!sessionRow || Date.parse(sessionRow.expires) <= Date.now()) return send({ error: "Your session has expired." }, 401);

    const { data: user } = await supabase.from("app_accounts").select("id,email,name").eq("id", sessionRow.owner).single();
    if (!user) return send({ error: "Your session has expired." }, 401);

    if (section === "auth" && id === "session" && method === "GET") return send(user);
    if (section === "auth" && id === "logout" && method === "POST") {
      await supabase.from("app_sessions").delete().eq("token", token);
      return send({});
    }
    if (section === "auth" && id === "profile" && method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : user.name;
      await supabase.from("app_accounts").update({ name }).eq("id", user.id);
      return send({ ...user, name });
    }

    if (section === "check" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const input=body.substances;
      let report;
      try {report=checkInputs(input);} catch(error){return send({error:String(error)},400);}
      await supabase.from("app_records").insert({ owner: user.id, section: "interaction_checks", payload: { inputs: input, report } });
      return send(report);
    }

    if(section==="interaction_checks" && ["POST","PATCH"].includes(method))return send({error:"Read-only report"},405);
    if (method === "GET" && !id) {
      const { data: rows } = await supabase.from("app_records").select("id,created_at,payload").eq("owner", user.id).eq("section", section).order("created_at", { ascending: false });
      return send((rows ?? []).map((r: any) => ({ ...r.payload, ...(section==="interaction_checks"?{report:checkInputs(r.payload.inputs)}:{}), id: r.id, created_at: r.created_at })));
    }

    if (method === "POST" && !id) {
      const payload = await req.json().catch(() => ({}));
      const { data: row, error } = await supabase.from("app_records").insert({ owner: user.id, section, payload }).select("id,created_at,payload").single();
      if (error) return send({ error: error.message }, 400);
      return send({ ...row.payload, id: row.id, created_at: row.created_at }, 201);
    }

    if (method === "PATCH" && id) {
      const payload = await req.json().catch(() => ({}));
      const { data: row, error } = await supabase.from("app_records").update({ payload }).eq("id", id).eq("owner", user.id).eq("section", section).select("id,created_at,payload").single();
      if (error || !row) return send({ error: "Record unavailable." }, 404);
      return send({ ...row.payload, id: row.id, created_at: row.created_at });
    }

    if (method === "DELETE" && id) {
      await supabase.from("app_records").delete().eq("id", id).eq("owner", user.id).eq("section", section);
      return send({});
    }

    if (section === "reminders" && id && action === "dose" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      await supabase.from("app_records").insert({ owner: user.id, section: "reminder_logs", payload: { reminder_id: id, outcome: body.outcome, scheduled_at: body.scheduled_at } });
      return send({});
    }

    return send({ error: "Not found." }, 404);
  } catch (err) {
    return send({ error: (err as Error).message || "The request could not be completed." }, 500);
  }
});
