export type FieldType = "text" | "email" | "number" | "date" | "select" | "textarea" | "checkbox";
export type ComponentType = "form" | "table" | "dashboard" | "metric" | "unknown";

export type FieldConfig = {
  key: string;
  label?: string;
  type?: FieldType | string;
  required?: boolean;
  options?: string[];
  fallback?: unknown;
};

export type EntityConfig = {
  name: string;
  label?: string;
  fields?: FieldConfig[];
};

export type ViewConfig = {
  id: string;
  type?: ComponentType | string;
  entity?: string;
  title?: string;
  description?: string;
};

export type AppConfig = {
  app?: { name?: string; description?: string; slug?: string };
  auth?: { enabled?: boolean; providers?: string[]; title?: string };
  database?: { entities?: EntityConfig[] };
  ui?: { views?: ViewConfig[] };
  localization?: { defaultLocale?: string; locales?: Record<string, Record<string, string>> };
  notifications?: { events?: Array<{ on: string; title: string; body?: string }> };
};

export const starterConfig: AppConfig = {
  app: {
    name: "FieldOps CRM",
    slug: "fieldops-crm",
    description: "A generated operations workspace driven entirely by JSON config.",
  },
  auth: { enabled: true, providers: ["email", "google"], title: "Workspace access" },
  localization: {
    defaultLocale: "en",
    locales: {
      en: { leads: "Leads", newRecord: "New record", import: "Import CSV", save: "Save", empty: "No records yet" },
      es: { leads: "Clientes", newRecord: "Nuevo registro", import: "Importar CSV", save: "Guardar", empty: "Sin registros" },
      hi: { leads: "लीड्स", newRecord: "नया रिकॉर्ड", import: "CSV आयात", save: "सेव", empty: "अभी रिकॉर्ड नहीं" },
    },
  },
  database: {
    entities: [
      {
        name: "leads",
        label: "Leads",
        fields: [
          { key: "company", label: "Company", type: "text", required: true },
          { key: "contact", label: "Contact email", type: "email", required: true },
          { key: "value", label: "Pipeline value", type: "number" },
          { key: "stage", label: "Stage", type: "select", options: ["New", "Qualified", "Proposal", "Won"] },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
      },
      {
        name: "tasks",
        label: "Tasks",
        fields: [
          { key: "title", label: "Task", type: "text", required: true },
          { key: "due", label: "Due date", type: "date" },
          { key: "done", label: "Done", type: "checkbox" },
        ],
      },
    ],
  },
  ui: {
    views: [
      { id: "dash", type: "dashboard", title: "Live generated dashboard" },
      { id: "leadForm", type: "form", entity: "leads", title: "Lead intake" },
      { id: "leadTable", type: "table", entity: "leads", title: "Lead records" },
      { id: "taskTable", type: "table", entity: "tasks", title: "Task board" },
      { id: "odd", type: "kanban", entity: "leads", title: "Unknown component demo" },
    ],
  },
  notifications: {
    events: [{ on: "record.created", title: "Record created", body: "A generated API stored a new row successfully." }],
  },
};

const safeKey = (value: unknown, fallback: string) => {
  const raw = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return raw || fallback;
};

export function normalizeConfig(input: unknown): AppConfig {
  const source = typeof input === "object" && input ? (input as AppConfig) : {};
  const entities = Array.isArray(source.database?.entities) ? source.database!.entities! : starterConfig.database!.entities!;
  const normalizedEntities = entities.map((entity, index) => {
    const name = safeKey(entity?.name, `entity_${index + 1}`);
    const fields = Array.isArray(entity?.fields) && entity.fields.length ? entity.fields : [{ key: "title", label: "Title", type: "text", required: true }];
    return {
      name,
      label: entity?.label || name.replace(/_/g, " "),
      fields: fields.map((field, fieldIndex) => ({
        key: safeKey(field?.key, `field_${fieldIndex + 1}`),
        label: field?.label || safeKey(field?.key, `field_${fieldIndex + 1}`).replace(/_/g, " "),
        type: field?.type || "text",
        required: Boolean(field?.required),
        options: Array.isArray(field?.options) ? field.options.map(String).filter(Boolean) : undefined,
        fallback: field?.fallback,
      })),
    };
  });
  const views = Array.isArray(source.ui?.views) && source.ui.views.length ? source.ui.views : starterConfig.ui!.views!;
  return {
    app: {
      name: source.app?.name || "Generated Workspace",
      slug: safeKey(source.app?.slug || source.app?.name, "generated_workspace"),
      description: source.app?.description || "Config-driven app generated from resilient JSON.",
    },
    auth: { enabled: source.auth?.enabled !== false, providers: source.auth?.providers || ["email", "google"], title: source.auth?.title || "Sign in" },
    localization: {
      defaultLocale: source.localization?.defaultLocale || "en",
      locales: source.localization?.locales || starterConfig.localization!.locales,
    },
    database: { entities: normalizedEntities },
    ui: { views: views.map((view, index) => ({ id: view?.id || `view_${index + 1}`, type: view?.type || "table", entity: view?.entity, title: view?.title, description: view?.description })) },
    notifications: { events: Array.isArray(source.notifications?.events) ? source.notifications!.events! : starterConfig.notifications!.events },
  };
}

export function entityFor(config: AppConfig, name?: string) {
  return config.database?.entities?.find((entity) => entity.name === name) || config.database?.entities?.[0];
}

export function validateRecord(entity: EntityConfig | undefined, values: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const field of entity?.fields || []) {
    const value = values[field.key];
    if (field.required && (value === undefined || value === null || String(value).trim() === "")) errors[field.key] = `${field.label || field.key} is required`;
    if (field.type === "email" && value && !/^\S+@\S+\.\S+$/.test(String(value))) errors[field.key] = "Enter a valid email";
    if (field.type === "number" && value !== "" && value !== undefined && Number.isNaN(Number(value))) errors[field.key] = "Must be a number";
  }
  return errors;
}

export function translate(config: AppConfig, locale: string, key: string) {
  return config.localization?.locales?.[locale]?.[key] || config.localization?.locales?.[config.localization.defaultLocale || "en"]?.[key] || key;
}
