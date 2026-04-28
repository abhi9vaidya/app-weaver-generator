import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Bell, Code2, Database, Download, FileUp, Globe2, Loader2, LogOut, Play, Plus, RefreshCw, TriangleAlert, CheckCircle2, ChevronRight, LayoutDashboard, Settings2, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AppConfig, entityFor, normalizeConfig, starterConfig, translate, validateRecord } from "./config";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

type GeneratedApp = { id: string; name: string; slug: string; config: AppConfig; normalized_config: AppConfig; default_locale: string };
type AppRecord = { id: string; entity: string; data: Record<string, unknown>; validation_errors: unknown[]; created_at: string };
type Notice = { id: string; title: string; body: string | null; event_type: string; read_at: string | null; created_at: string };

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/dyn";

function safeJsonParse(value: string) {
  try { return { value: JSON.parse(value), error: "" }; } catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" }; }
}

function toCsv(rows: AppRecord[]) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row.data || {}))));
  return [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row.data?.[key] ?? "")).join(","))].join("\n");
}

function parseCsvHeaders(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return (lines.shift() || "").split(",").map((h) => h.trim());
}

function parseCsvRows(text: string, mapping: Record<string, string>) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = (lines.shift() || "").split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split(",").map(c => c.trim());
    const row: Record<string, any> = {};
    Object.entries(mapping).forEach(([entityKey, csvHeader]) => {
      const index = headers.indexOf(csvHeader);
      if (index !== -1) row[entityKey] = cells[index];
    });
    return row;
  });
}

export function RuntimeWorkspace({ user }: { user: User }) {
  const [rawConfig, setRawConfig] = useState(JSON.stringify(starterConfig, null, 2));
  const [apps, setApps] = useState<GeneratedApp[]>([]);
  const [activeApp, setActiveApp] = useState<GeneratedApp | null>(null);
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activeEntity, setActiveEntity] = useState("leads");
  const [locale, setLocale] = useState("en");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  
  // CSV Import State
  const [importingFile, setImportingFile] = useState<{ name: string; content: string; headers: string[] } | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const parsed = useMemo(() => safeJsonParse(rawConfig), [rawConfig]);
  const normalized = useMemo(() => normalizeConfig(parsed.value || starterConfig), [parsed.value]);
  const runtimeConfig = activeApp?.normalized_config || normalized;
  const entity = entityFor(runtimeConfig, activeEntity);
  const visibleRecords = records.filter((record) => record.entity === entity?.name);
  const locales = Object.keys(runtimeConfig.localization?.locales || { en: {} });

  async function load() {
    setBusy(true);
    const [{ data: appRows, error: appError }, { data: noticeRows }] = await Promise.all([
      supabase.from("generated_apps").select("*").order("updated_at", { ascending: false }),
      supabase.from("app_notifications").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    if (appError) toast.error(appError.message);
    const loadedApps = (appRows || []) as GeneratedApp[];
    setApps(loadedApps);
    setNotices((noticeRows || []) as Notice[]);
    if (loadedApps[0] && !activeApp) {
      setActiveApp(loadedApps[0]);
      setRawConfig(JSON.stringify(loadedApps[0].config, null, 2));
      setLocale(loadedApps[0].default_locale || "en");
      setActiveEntity(loadedApps[0].normalized_config?.database?.entities?.[0]?.name || "leads");
      await loadRecords(loadedApps[0].id, loadedApps[0].normalized_config?.database?.entities?.[0]?.name || "leads");
    }
    setBusy(false);
  }

  async function loadRecords(appId = activeApp?.id, entityName = activeEntity) {
    if (!appId) return;
    try {
      const res = await fetch(`${API_BASE}/${appId}/${entityName}`, {
        headers: { 'x-user-id': user.id }
      });
      const data = await res.json();
      if (res.ok) setRecords(data);
      else toast.error("Failed to load records from backend engine");
    } catch (e) {
      // Fallback to direct supabase if backend is down for demo
      const { data } = await supabase.from("app_records").select("*").eq("app_id", appId).eq("entity", entityName).order("created_at", { ascending: false });
      setRecords((data || []) as AppRecord[]);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeApp) loadRecords(activeApp.id, activeEntity); }, [activeEntity, activeApp]);

  async function runConfig() {
    if (parsed.error) { toast.error(`JSON error: ${parsed.error}`); return; }
    setBusy(true);
    const next = normalizeConfig(parsed.value);
    const { data, error } = await supabase.from("generated_apps").upsert({
      user_id: user.id,
      name: next.app?.name,
      slug: next.app?.slug,
      description: next.app?.description,
      config: parsed.value,
      normalized_config: next,
      status: "generated",
      default_locale: next.localization?.defaultLocale || "en",
    }, { onConflict: "user_id,slug" }).select("*").single();
    
    if (error) toast.error(error.message);
    else {
      setActiveApp(data as GeneratedApp);
      toast.success("Runtime regenerated from JSON config.");
      await load();
    }
    setBusy(false);
  }

  async function saveRecord() {
    if (!activeApp || !entity) return;
    const validation = validateRecord(entity, formData);
    setErrors(validation);
    if (Object.keys(validation).length) {
      toast.error("Please fix validation errors");
      return;
    }
    setBusy(true);
    
    try {
      const res = await fetch(`${API_BASE}/${activeApp.id}/${entity.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        toast.success("Record saved through backend engine");
        setFormData({});
        await loadRecords();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save record");
      }
    } catch (e) {
      toast.error("Backend engine unreachable. Make sure 'npm run server' is running.");
    }
    setBusy(false);
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const headers = parseCsvHeaders(content);
      setImportingFile({ name: file.name, content, headers });
      // Auto-mapping suggestion
      const mapping: Record<string, string> = {};
      entity?.fields?.forEach(f => {
        const match = headers.find(h => h.toLowerCase() === f.label?.toLowerCase() || h.toLowerCase() === f.key.toLowerCase());
        if (match) mapping[f.key] = match;
      });
      setCsvMapping(mapping);
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!importingFile || !activeApp || !entity) return;
    setBusy(true);
    const rows = parseCsvRows(importingFile.content, csvMapping);
    
    // Send to backend in a loop or batch (batch preferred)
    let successCount = 0;
    for (const row of rows) {
      try {
        const res = await fetch(`${API_BASE}/${activeApp.id}/${entity.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
          body: JSON.stringify(row)
        });
        if (res.ok) successCount++;
      } catch (e) {}
    }
    
    toast.success(`Successfully imported ${successCount} records.`);
    setImportingFile(null);
    await loadRecords();
    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-hero runtime-grid pb-10">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] w-full items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-command shadow-crisp">
              <Code2 className="text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">App Weaver v2.0</p>
              <h1 className="font-display text-xl font-black">Generator Runtime</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="soft" size="sm" onClick={() => load()} className="rounded-full">
                <RefreshCw className={busy ? "animate-spin" : ""} /> Sync
              </Button>
              <Button variant="ink" size="sm" onClick={() => supabase.auth.signOut()} className="rounded-full">
                <LogOut className="size-4" /> Exit
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              {showMobileMenu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl animate-in fade-in slide-in-from-top duration-300 md:hidden">
          <div className="flex flex-col gap-6 p-10 pt-24">
            <h2 className="font-display text-3xl font-black">Menu</h2>
            <div className="flex flex-col gap-4">
              <Button variant="soft" className="justify-start text-lg" onClick={() => { load(); setShowMobileMenu(false); }}>
                <RefreshCw className="mr-2" /> Sync Engine
              </Button>
              <Button variant="ink" className="justify-start text-lg" onClick={() => supabase.auth.signOut()}>
                <LogOut className="mr-2" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1600px] w-full gap-6 px-4 py-6 md:px-6 lg:grid-cols-[440px_1fr]">
        {/* Left Column: Config & Meta */}
        <aside className="space-y-6">
          <section className="group overflow-hidden rounded-2xl border bg-panel shadow-soft transition-all hover:shadow-crisp">
            <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <Settings2 className="size-5 text-primary" />
                <h2 className="font-display font-black tracking-tight">JSON Configuration</h2>
              </div>
              <Button variant="command" size="sm" onClick={runConfig} disabled={busy} className="rounded-full shadow-lg">
                {busy ? <Loader2 className="animate-spin" /> : <Play className="size-4 fill-current" />} Run
              </Button>
            </div>
            <div className="p-1">
              <textarea 
                className="h-[500px] w-full resize-none rounded-xl border-none bg-code p-5 font-mono text-[13px] leading-relaxed text-code-foreground focus:ring-0" 
                value={rawConfig} 
                onChange={(e) => setRawConfig(e.target.value)} 
                spellCheck={false}
              />
            </div>
            {parsed.error && (
              <div className="m-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive animate-in zoom-in-95">
                <TriangleAlert className="size-5 shrink-0" />
                <p className="font-semibold">{parsed.error}</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h3 className="mb-4 flex items-center gap-2 font-display font-black italic">
              <Bell className="size-4 text-secondary" /> SYSTEM EVENTS
            </h3>
            <div className="space-y-3">
              {notices.length ? notices.map((n) => (
                <div key={n.id} className="group relative rounded-xl border bg-surface/50 p-4 transition-all hover:bg-surface">
                  <div className="absolute -left-1 top-4 h-8 w-1 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  <p className="text-sm font-black text-primary">{n.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  No events yet.
                </div>
              )}
            </div>
          </section>
        </aside>

        {/* Right Column: Runtime App */}
        <section className="space-y-6">
          {/* App Header Card */}
          <div className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-soft md:p-8">
            <div className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-[10px] font-black uppercase text-accent-foreground">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Generated Application
                </div>
                <h2 className="font-display text-4xl font-black tracking-tight md:text-5xl">{runtimeConfig.app?.name}</h2>
                <p className="max-w-xl text-muted-foreground">{runtimeConfig.app?.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <select 
                  className="h-11 rounded-xl border bg-background px-4 font-bold shadow-sm transition-all hover:border-primary/50 focus:ring-2 focus:ring-primary/20" 
                  value={locale} 
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {locales.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
                <Button variant="soft" className="h-11 rounded-xl px-5" onClick={() => toast.info("Exporting CSV...")}>
                  <Download className="mr-2 size-4" /> Export
                </Button>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat icon={<Database className="text-primary" />} label="Entities" value={runtimeConfig.database?.entities?.length || 0} />
              <Stat icon={<FileUp className="text-secondary" />} label="Records" value={records.length} />
              <Stat icon={<Globe2 className="text-accent" />} label="Locales" value={locales.length} />
              <Stat icon={<LayoutDashboard className="text-indigo-500" />} label="Views" value={runtimeConfig.ui?.views?.length || 0} />
            </div>
          </div>

          {/* Entity Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {runtimeConfig.database?.entities?.map((e) => (
              <button
                key={e.name}
                onClick={() => setActiveEntity(e.name)}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black transition-all ${
                  activeEntity === e.name 
                    ? "bg-foreground text-background shadow-crisp" 
                    : "bg-card border hover:bg-muted/50"
                }`}
              >
                {e.label} {activeEntity === e.name && <CheckCircle2 className="size-4" />}
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            {/* Form Section */}
            <div className="space-y-6">
              <section className="rounded-2xl border bg-panel p-6 shadow-soft">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="font-display text-2xl font-black">
                    {translate(runtimeConfig, locale, "newRecord")}
                  </h3>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-accent-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <FileUp className="size-4" /> {translate(runtimeConfig, locale, "import")}
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
                  </label>
                </div>
                
                <div className="space-y-4">
                  {entity?.fields?.map((f) => (
                    <DynamicField 
                      key={f.key} 
                      field={f} 
                      value={formData[f.key]} 
                      error={errors[f.key]} 
                      onChange={(v) => setFormData(prev => ({ ...prev, [f.key]: v }))} 
                    />
                  ))}
                </div>
                
                <Button 
                  variant="command" 
                  className="mt-8 h-12 w-full rounded-xl text-base font-black shadow-lg" 
                  onClick={saveRecord} 
                  disabled={busy || !activeApp}
                >
                  {busy ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2" />} 
                  {translate(runtimeConfig, locale, "save")}
                </Button>
              </section>
            </div>

            {/* Table Section */}
            <section className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
              <div className="border-b bg-muted/10 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-2xl font-black">{entity?.label} Records</h3>
                    <p className="text-sm text-muted-foreground">Dynamic dataset retrieved via generator engine API.</p>
                  </div>
                  <div className="h-2 w-2 animate-ping rounded-full bg-primary" />
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      {entity?.fields?.map((f) => (
                        <th key={f.key} className="whitespace-nowrap px-6 py-4 font-black tracking-tight">{f.label}</th>
                      ))}
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRecords.length ? visibleRecords.map((r) => (
                      <tr key={r.id} className="group transition-colors hover:bg-muted/20">
                        {entity?.fields?.map((f) => (
                          <td key={f.key} className="whitespace-nowrap px-6 py-4 font-medium">
                            {f.type === "checkbox" 
                              ? (r.data?.[f.key] ? "✅" : "❌") 
                              : String(r.data?.[f.key] ?? "—")}
                          </td>
                        ))}
                        <td className="px-6 py-4 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="size-4" /></Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={10} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <Database className="size-10 opacity-20" />
                            <p className="font-medium">{translate(runtimeConfig, locale, "empty")}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Views Preview */}
          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="mb-4 font-display text-2xl font-black tracking-tight">Component Registry</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {runtimeConfig.ui?.views?.map((v) => (
                <div key={v.id} className="group relative overflow-hidden rounded-xl border bg-surface/30 p-5 transition-all hover:bg-surface hover:shadow-soft">
                  <div className="absolute right-0 top-0 p-3 opacity-10 transition-opacity group-hover:opacity-30">
                    {v.type === 'dashboard' ? <LayoutDashboard /> : <Database />}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">{v.type || "view"}</p>
                  <h4 className="mt-1 font-display font-black">{v.title || v.id}</h4>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Bound to {v.entity || "system"} • Dynamic rendering enabled
                  </p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>

      {/* CSV Import Modal (Overlay) */}
      {importingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl border bg-card p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="font-display text-3xl font-black">Map CSV Headers</h2>
            <p className="mt-2 text-muted-foreground">File: <span className="font-bold text-foreground">{importingFile.name}</span></p>
            
            <div className="mt-8 space-y-6">
              <div className="max-h-[340px] space-y-4 overflow-y-auto pr-2">
                {entity?.fields?.map(f => (
                  <div key={f.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border bg-muted/20 p-4">
                    <div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground">Target Field</p>
                      <p className="font-bold">{f.label || f.key}</p>
                    </div>
                    <ChevronRight className="text-muted-foreground" />
                    <select 
                      className="rounded-lg border bg-background p-2 text-sm font-bold shadow-sm"
                      value={csvMapping[f.key] || ""}
                      onChange={(e) => setCsvMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <option value="">Skip field</option>
                      {importingFile.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button variant="ink" className="flex-1 rounded-xl" onClick={confirmImport} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : "Import Records"}
                </Button>
                <Button variant="soft" className="flex-1 rounded-xl" onClick={() => setImportingFile(null)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border bg-surface/40 p-4 transition-all hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function DynamicField({ field, value, error, onChange }: { field: any; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const common = "h-11 w-full rounded-xl border bg-background px-4 font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/40";
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold tracking-tight">
        {field.label} {field.required && <span className="text-secondary">*</span>}
      </label>
      
      {field.type === "textarea" ? (
        <textarea className={`${common} h-28 py-3`} value={String(value || "")} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <select className={common} value={String(value || "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select option...</option>
          {(field.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "checkbox" ? (
        <div 
          className={`flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border px-4 transition-all ${value ? "bg-primary/5 border-primary/50" : "bg-background"}`}
          onClick={() => onChange(!value)}
        >
          <span className="text-sm font-bold">{value ? "Enabled" : "Disabled"}</span>
          <div className={`h-5 w-5 rounded-md border-2 transition-all flex items-center justify-center ${value ? "bg-primary border-primary" : "bg-transparent border-muted-foreground/30"}`}>
            {value && <CheckCircle2 className="size-4 text-white" />}
          </div>
        </div>
      ) : (
        <input 
          className={common} 
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} 
          value={String(value || "")} 
          onChange={(e) => onChange(e.target.value)} 
        />
      )}
      
      {error && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-destructive animate-in slide-in-from-left-2">
          <TriangleAlert className="size-3" /> {error}
        </p>
      )}
    </div>
  );
}
