import { useState } from "react";
import { Chrome, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type AuthConfig = {
  enabled?: boolean;
  providers?: string[];
  title?: string;
  subtitle?: string;
  primaryColor?: string;
};

export function AuthPanel({ config }: { config?: AuthConfig }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const title = config?.title || (mode === "signIn" ? "Welcome back" : "Create your account");
  const subtitle = config?.subtitle || "Authentication powered by ConfigForge Runtime.";
  const providers = config?.providers || ["email", "google"];

  const submit = async () => {
    setBusy(true);
    setMessage("");
    const action = mode === "signIn" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await action.call(supabase.auth, {
      email: email.trim(),
      password,
      ...(mode === "signUp" ? { options: { emailRedirectTo: window.location.origin } } : {}),
    });
    setBusy(false);
    setMessage(error ? error.message : mode === "signUp" ? "Check your email to confirm your account." : "Signed in.");
  };

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) setMessage(error.message || "Google sign-in failed.");
    setBusy(false);
  };

  return (
    <section className="grid min-h-screen place-items-center bg-hero p-4 md:p-8 runtime-grid">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border bg-panel shadow-soft animate-enter md:grid md:grid-cols-[1.1fr_0.9fr]">
        <div className="relative min-h-[360px] p-7 md:p-10">
          <div className="absolute right-8 top-8 h-28 w-28 rounded-full border bg-accent/30 blur-2xl animate-float motion-reduce:animate-none" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-semibold shadow-crisp animate-fade-in hover-lift">
                <ShieldCheck className="size-4 text-primary" /> ConfigForge Runtime
              </div>
              <h1 className="max-w-2xl font-display text-4xl font-black leading-tight text-balance animate-fade-in md:text-6xl">
                {config?.title || "Ship generated apps from imperfect JSON."}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                {config?.subtitle || "Dynamic UI, backend APIs, database-shaped records, CSV import, localization, and event notifications."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {["Schema tolerant", "User scoped", "API driven"].map((item) => (
                <div key={item} className="rounded-md border bg-card/70 p-2 text-xs font-semibold interactive-card sm:p-3 sm:text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t bg-card p-6 animate-slide-in-right md:border-l md:border-t-0 md:p-8">
          <div className="mb-6">
            <p className="text-sm font-bold uppercase text-primary">Authentication</p>
            <h2 className="font-display text-2xl font-black">{title}</h2>
          </div>
          <div className="space-y-3">
            {providers.includes("email") && (
              <>
                <label className="block text-sm font-semibold">Email</label>
                <input
                  className="h-11 w-full rounded-md border bg-background px-3 outline-none soft-focus transition-colors hover:border-primary/60"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                />
                <label className="block text-sm font-semibold">Password</label>
                <input
                  className="h-11 w-full rounded-md border bg-background px-3 outline-none soft-focus transition-colors hover:border-primary/60"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                />
                <Button variant="command" className="w-full" onClick={submit} disabled={busy || !email || password.length < 6}>
                  {busy ? <Loader2 className="animate-spin" /> : <Mail />} {mode === "signIn" ? "Sign in" : "Sign up"}
                </Button>
              </>
            )}
            {providers.includes("google") && (
              <Button variant="soft" className="w-full" onClick={google} disabled={busy}>
                <Chrome /> Continue with Google
              </Button>
            )}
            <button className="story-link text-sm font-semibold text-primary" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
              {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
            {message && <p className="rounded-md border bg-surface p-3 text-sm text-muted-foreground animate-scale-in">{message}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
