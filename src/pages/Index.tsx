import { AuthPanel } from "@/features/generator/AuthPanel";
import { RuntimeWorkspace } from "@/features/generator/RuntimeWorkspace";
import { useAuth } from "@/features/generator/useAuth";
import { starterConfig } from "@/features/generator/config";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-hero"><div className="rounded-lg border bg-card p-6 font-display text-xl font-black shadow-crisp">Booting runtime…</div></div>;
  }

  return user ? <RuntimeWorkspace user={user} /> : <AuthPanel config={starterConfig.auth} />;
};

export default Index;
