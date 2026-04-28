import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bell, Code2, Database, Download, FileUp, Globe2, Loader2, LogOut,
  Play, Plus, RefreshCw, TriangleAlert, CheckCircle2, ChevronRight,
  LayoutDashboard, Settings2, Menu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    const row: Record<string, unknown> = {};
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
        headers: { "x-user-id": user.id },
      });
      const data = await res.json();
      if (res.ok) setRecords(data);
      else toast.error("Failed to load records from backend engine");
    } catch {
      const { data } = await supabase
        .from("app_records")
        .select("*")
        .eq("app_id", appId)
        .eq("entity", entityName)
        .order("created_at", { ascending: false });
      setRecords((data || []) as AppRecord[]);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeApp) loadRecords(activeApp.id, activeEntity); }, [activeEntity, activeApp]);

  async function runConfig() {
    if (parsed.error) { toast.error(`JSON error: ${parsed.error}`); return; }
    setBusy(true);
    const next = normalizeConfig(parsed.value);
    const { data, error } = await supabase
      .from("generated_apps")
      .upsert({
        user_id: user.id,
        name: next.app?.name,
        slug: next.app?.slug,
        description: next.app?.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: parsed.value as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        normalized_config: next as any,
        status: "generated",
        default_locale: next.localization?.defaultLocale || "en",
      }, { onConflict: "user_id,slug" })
      .select("*")
      .single();

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
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("Record saved through backend engine");
        setFormData({});
        await loadRecords();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save record");
      }
    } catch {
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
    let successCount = 0;
    for (const row of rows) {
      try {
        const res = await fetch(`${API_BASE}/${activeApp.id}/${entity.name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": user.id },
          body: JSON.stringify(row),
        });
        if (res.ok) successCount++;
      } catch { /* noop */ }
    }
    toast.success(`Successfully imported ${successCount} records.`);
    setImportingFile(null);
    await loadRecords();
    setBusy(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-hero runtime-grid pb-10">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] w-full items-center justify-between px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-command shadow-crisp">
              <Code2 className="text-white" size={20} />
            </div>
            <div>
              <p className="hidden text-[10px] font-black uppercase tracking-widest text-primary/70 sm:block">
                App Weaver v2.0
              </p>
              <h1 className="font-display text-base font-black sm:text-xl">Generator Runtime</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="soft" size="sm" onClick={() => load()} className="rounded-full">
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sync
              </Button>
              <Button variant="ink" size="sm" onClick={() => supabase.auth.signOut()} className="rounded-full">
                <LogOut size={14} /> Exit
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setShowMobileMenu(v => !v)}
              aria-label="Toggle menu"
            >
              {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      {showMobileMenu && (
        <div
          className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 md:hidden"
          onClick={() => setShowMobileMenu(false)}
        >
          <div className="flex flex-col gap-6 p-8 pt-20" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl font-black">Menu</h2>
            <div className="flex flex-col gap-3">
              <Button
                variant="soft"
                className="justify-start text-base"
                onClick={() => { load(); setShowMobileMenu(false); }}
              >
                <RefreshCw size={16} className="mr-2" /> Sync Engine
              </Button>
              <Button
                variant="ink"
                className="justify-start text-base"
                onClick={() => supabase.auth.signOut()}
              >
                <LogOut size={16} className="mr-2" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="mx-auto grid max-w-[1600px] w-full gap-6 px-4 py-6 md:px-6 lg:grid-cols-[420px_1fr]">
        {/* Left Column */}
        <aside className="space-y-6 animate-fade-in">
          {/* JSON Config */}
          <section className="group overflow-hidden rounded-2xl border bg-panel shadow-soft transition-all hover:shadow-crisp">
            <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <Settings2 className="size-5 text-primary" />
                <h2 className="font-display font-black tracking-tight">JSON Configuration</h2>
              </div>
              <Button variant="command" size="sm" onClick={runConfig} disabled={busy} className="rounded-full shadow-lg">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />} Run
              </Button>
            </div>
            <div className="p-1">
              <textarea
                className="h-[260px] w-full resize-none rounded-xl border-none bg-code p-5 font-mono text-[13px] leading-relaxed text-code-foreground outline-none focus:ring-0 md:h-[460px]"
                value={rawConfig}
                onChange={(e) => setRawConfig(e.target.value)}
                spellCheck={false}
                aria-label="JSON Configuration"
              />
            </div>
            {parsed.error && (
              <div className="m-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive animate-in zoom-in-95">
                <TriangleAlert className="size-5 shrink-0" />
                <p className="font-semibold">{parsed.error}</p>
              </div>
            )}
          </section>

          {/* System Events */}
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

        {/* Right Column */}
        <section className="min-w-0 space-y-6 animate-fade-in" style={{ animationDelay: "80ms" }}>
          {/* App Header Card */}
          <div className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-soft sm:p-6 md:p-8">
            <div className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-[10px] font-black uppercase text-accent-foreground">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Generated Application
                </div>
                <h2 className="font-display text-3xl font-black tracking-tight line-clamp-2 sm:text-4xl md:text-5xl">
                  {runtimeConfig.app?.name}
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground line-clamp-2 md:text-base">
                  {runtimeConfig.app?.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Select value={locale} onValueChange={setLocale}>
                  <SelectTrigger className="h-10 w-[90px] rounded-xl border bg-background font-bold shadow-sm hover:border-primary/50 focus:ring-2 focus:ring-primary/20 sm:h-11 sm:w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((l) => (
                      <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="soft"
                  className="h-10 rounded-xl px-3 sm:h-11 sm:px-5"
                  onClick={() => toast.info("Exporting CSV...")}
                >
                  <Download className="size-4" />
                  <span className="ml-1 hidden sm:inline">Export</span>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-4 sm:gap-4">
              <Stat icon={<Database className="text-primary" />} label="Entities" value={runtimeConfig.database?.entities?.length || 0} />
              <Stat icon={<FileUp className="text-secondary" />} label="Records" value={records.length} />
              <Stat icon={<Globe2 className="text-accent" />} label="Locales" value={locales.length} />
              <Stat icon={<LayoutDashboard className="text-indigo-500" />} label="Views" value={runtimeConfig.ui?.views?.length || 0} />
            </div>
          </div>

          {/* Entity Selector Tabs */}
          <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1">
            {runtimeConfig.database?.entities?.map((e) => (
              <button
                key={e.name}
                onClick={() => setActiveEntity(e.name)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition-all sm:px-5 sm:py-2.5 ${
                  activeEntity === e.name
                    ? "bg-foreground text-background shadow-crisp"
                    : "border bg-card hover:bg-muted/50"
                }`}
              >
                {e.label}
                {activeEntity === e.name && <CheckCircle2 className="size-3.5" />}
              </button>
            ))}
          </div>

          {/* Form + Table */}
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            {/* Form */}
            <div className="space-y-6">
              <section className="rounded-2xl border bg-panel p-5 shadow-soft sm:p-6">
                <div className="mb-5 flex items-center justify-between sm:mb-6">
                  <h3 className="font-display text-xl font-black sm:text-2xl">
                    {translate(runtimeConfig, locale, "newRecord")}
                  </h3>
                  <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-black text-accent-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:h-10 sm:gap-2 sm:px-4">
                    <FileUp className="size-3.5 sm:size-4" />
                    <span className="hidden sm:inline">{translate(runtimeConfig, locale, "import")}</span>
                    <span className="sm:hidden">CSV</span>
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
                  className="mt-6 h-11 w-full rounded-xl text-base font-black shadow-lg sm:mt-8 sm:h-12"
                  onClick={saveRecord}
                  disabled={busy || !activeApp}
                >
                  {busy ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2" />}
                  {translate(runtimeConfig, locale, "save")}
                </Button>
              </section>
            </div>

            {/* Table */}
            <section className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
              <div className="border-b bg-muted/10 px-5 py-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-black sm:text-2xl truncate">{entity?.label} Records</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">Dynamic dataset retrieved via generator engine API.</p>
                  </div>
                  <div className="ml-3 h-2 w-2 shrink-0 animate-ping rounded-full bg-primary" />
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted/30">
                    <tr>
                      {entity?.fields?.map((f) => (
                        <th key={f.key} className="whitespace-nowrap px-4 py-3 font-black tracking-tight sm:px-6 sm:py-4">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 sm:px-6 sm:py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRecords.length ? visibleRecords.map((r) => (
                      <tr key={r.id} className="group transition-colors hover:bg-muted/20">
                        {entity?.fields?.map((f) => (
                          <td key={f.key} className="whitespace-nowrap px-4 py-3 font-medium sm:px-6 sm:py-4">
                            {f.type === "checkbox"
                              ? (r.data?.[f.key] ? "✅" : "❌")
                              : String(r.data?.[f.key] ?? "—")}
                          </td>
                        ))}
                        <td className="px-4 py-3 opacity-0 transition-opacity group-hover:opacity-100 sm:px-6 sm:py-4">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="View record">
                            <ChevronRight className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={10} className="px-6 py-16 text-center sm:py-20">
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

          {/* Component Registry */}
          <section className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
            <h3 className="mb-4 font-display text-xl font-black tracking-tight sm:text-2xl">Component Registry</h3>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {runtimeConfig.ui?.views?.map((v) => (
                <div key={v.id} className="group relative overflow-hidden rounded-xl border bg-surface/30 p-4 transition-all hover:bg-surface hover:shadow-soft sm:p-5">
                  <div className="absolute right-0 top-0 p-3 opacity-10 transition-opacity group-hover:opacity-30">
                    {v.type === "dashboard" ? <LayoutDashboard /> : <Database />}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">{v.type || "view"}</p>
                  <h4 className="mt-1 font-display font-black line-clamp-1">{v.title || v.id}</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    Bound to {v.entity || "system"} • Dynamic rendering enabled
                  </p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>

      {/* ── CSV Import Modal ── */}
      {importingFile && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
          onClick={() => !busy && setImportingFile(null)}
        >
          <div
            className="w-full max-w-xl rounded-t-3xl border bg-card p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-3xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between">
              <h2 className="font-display text-2xl font-black sm:text-3xl">Map CSV Headers</h2>
              <button
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => !busy && setImportingFile(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              File: <span className="font-bold text-foreground">{importingFile.name}</span>
            </p>

            <div className="mt-6 space-y-5 sm:mt-8">
              <div className="scrollbar-none max-h-[40vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[340px] sm:space-y-4">
                {entity?.fields?.map(f => (
                  <div key={f.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border bg-muted/20 p-3 sm:gap-4 sm:p-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-muted-foreground">Target Field</p>
                      <p className="truncate font-bold">{f.label || f.key}</p>
                    </div>
                    <ChevronRight className="shrink-0 text-muted-foreground" size={16} />
                    <Select
                      value={csvMapping[f.key] || "__skip__"}
                      onValueChange={(v) =>
                        setCsvMapping(prev => ({ ...prev, [f.key]: v === "__skip__" ? "" : v }))
                      }
                    >
                      <SelectTrigger className="rounded-lg border bg-background text-sm font-bold shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">Skip field</SelectItem>
                        {importingFile.headers.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="ink" className="flex-1 rounded-xl" onClick={confirmImport} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 animate-spin" /> : null}
                  {busy ? "Importing…" : "Import Records"}
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
    <div className="rounded-2xl border bg-surface/40 p-3 transition-all hover:bg-surface sm:p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <p className="mt-1 font-display text-xl font-black tracking-tight sm:text-2xl">{value}</p>
    </div>
  );
}

function DynamicField({
  field,
  value,
  error,
  onChange,
}: {
  field: { key: string; label?: string; type?: string; required?: boolean; options?: string[] };
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const common =
    "h-11 w-full rounded-xl border bg-background px-4 font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/40";

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-bold tracking-tight">
        {field.label} {field.required && <span className="text-secondary">*</span>}
      </label>

      {field.type === "textarea" ? (
        <textarea
          className={`${common} h-24 resize-none py-3 md:h-28`}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          aria-required={field.required}
        />
      ) : field.type === "select" ? (
        <Select value={String(value || "")} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-11 w-full rounded-xl border bg-background px-4 font-medium transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/40">
            <SelectValue placeholder="Select option…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o: string) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "checkbox" ? (
        <div
          className={`flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border px-4 transition-all ${
            value ? "border-primary/50 bg-primary/5" : "bg-background"
          }`}
          role="checkbox"
          aria-checked={Boolean(value)}
          tabIndex={0}
          onClick={() => onChange(!value)}
          onKeyDown={(e) => e.key === " " && onChange(!value)}
        >
          <span className="text-sm font-bold">{value ? "Enabled" : "Disabled"}</span>
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
              value ? "border-primary bg-primary" : "border-muted-foreground/30 bg-transparent"
            }`}
          >
            {value && <CheckCircle2 className="size-4 text-white" />}
          </div>
        </div>
      ) : (
        <input
          className={common}
          type={
            field.type === "number" ? "number"
            : field.type === "date" ? "date"
            : field.type === "email" ? "email"
            : "text"
          }
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          aria-required={field.required}
        />
      )}

      {error && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-destructive animate-in slide-in-from-left-2">
          <TriangleAlert className="size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
