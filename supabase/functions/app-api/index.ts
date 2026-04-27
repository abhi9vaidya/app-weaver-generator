import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import { z } from "https://esm.sh/zod@3.25.76";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.104.1/cors";

const JsonRecord = z.record(z.unknown());
const SaveConfigSchema = z.object({ config: JsonRecord });
const RecordSchema = z.object({ appId: z.string().uuid(), entity: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_\-]+$/), data: JsonRecord });

function normalizeSlug(value: unknown) {
  return String(value || "generated-app").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "generated_app";
}

function normalizeConfig(input: Record<string, unknown>) {
  const app = (input.app && typeof input.app === "object" ? input.app : {}) as Record<string, unknown>;
  const database = (input.database && typeof input.database === "object" ? input.database : {}) as Record<string, unknown>;
  const rawEntities = Array.isArray(database.entities) ? database.entities : [];
  const entities = rawEntities.length ? rawEntities : [{ name: "items", fields: [{ key: "title", label: "Title", type: "text", required: true }] }];
  return {
    ...input,
    app: { name: String(app.name || "Generated App"), slug: normalizeSlug(app.slug || app.name), description: String(app.description || "Runtime-generated app") },
    database: {
      entities: entities.map((entity, index) => {
        const source = entity && typeof entity === "object" ? entity as Record<string, unknown> : {};
        const fields = Array.isArray(source.fields) && source.fields.length ? source.fields : [{ key: "title", label: "Title", type: "text", required: true }];
        return {
          name: normalizeSlug(source.name || `entity_${index + 1}`),
          label: String(source.label || source.name || `Entity ${index + 1}`),
          fields: fields.map((field, fieldIndex) => {
            const f = field && typeof field === "object" ? field as Record<string, unknown> : {};
            return { key: normalizeSlug(f.key || `field_${fieldIndex + 1}`), label: String(f.label || f.key || `Field ${fieldIndex + 1}`), type: String(f.type || "text"), required: Boolean(f.required), options: Array.isArray(f.options) ? f.options.map(String) : undefined };
          }),
        };
      }),
    },
  };
}

async function getUser(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const user = await getUser(req, supabase);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });

    const url = new URL(req.url);
    const route = url.pathname.split("/").filter(Boolean).pop();

    if (req.method === "GET" && route === "app-api") {
      const { data, error } = await supabase.from("generated_apps").select("*, app_records(count)").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      return Response.json({ apps: data }, { headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));

    if (req.method === "POST" && route === "generate") {
      const parsed = SaveConfigSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
      const normalized = normalizeConfig(parsed.data.config);
      const { data, error } = await supabase.from("generated_apps").upsert({ user_id: user.id, name: normalized.app.name, slug: normalized.app.slug, description: normalized.app.description, config: parsed.data.config, normalized_config: normalized, status: "generated", default_locale: "en" }, { onConflict: "user_id,slug" }).select("*").single();
      if (error) throw error;
      return Response.json({ app: data }, { headers: corsHeaders });
    }

    if (req.method === "POST" && route === "records") {
      const parsed = RecordSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
      const { data, error } = await supabase.from("app_records").insert({ user_id: user.id, app_id: parsed.data.appId, entity: parsed.data.entity, data: parsed.data.data, validation_errors: [] }).select("*").single();
      if (error) throw error;
      return Response.json({ record: data }, { headers: corsHeaders });
    }

    return Response.json({ error: "Route not found" }, { status: 404, headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500, headers: corsHeaders });
  }
});
