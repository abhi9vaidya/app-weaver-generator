CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  preferred_language text NOT NULL DEFAULT 'en',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.generated_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled app',
  slug text NOT NULL DEFAULT 'untitled-app',
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  default_locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE public.app_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.generated_apps(id) ON DELETE CASCADE,
  entity text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.csv_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.generated_apps(id) ON DELETE CASCADE,
  entity text NOT NULL,
  file_name text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows_total integer NOT NULL DEFAULT 0,
  rows_imported integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id uuid REFERENCES public.generated_apps(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  event_type text NOT NULL DEFAULT 'system',
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own generated apps" ON public.generated_apps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own generated apps" ON public.generated_apps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own generated apps" ON public.generated_apps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own generated apps" ON public.generated_apps FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own app records" ON public.app_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own app records" ON public.app_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.generated_apps WHERE id = app_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own app records" ON public.app_records FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.generated_apps WHERE id = app_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own app records" ON public.app_records FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own csv imports" ON public.csv_imports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own csv imports" ON public.csv_imports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.generated_apps WHERE id = app_id AND user_id = auth.uid()));

CREATE POLICY "Users can view own notifications" ON public.app_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own notifications" ON public.app_notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.app_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.app_notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_generated_apps_updated_at BEFORE UPDATE ON public.generated_apps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_app_records_updated_at BEFORE UPDATE ON public.app_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

CREATE INDEX idx_generated_apps_user_id ON public.generated_apps(user_id);
CREATE INDEX idx_app_records_app_entity ON public.app_records(app_id, entity);
CREATE INDEX idx_app_records_data_gin ON public.app_records USING gin(data);
CREATE INDEX idx_csv_imports_app_id ON public.csv_imports(app_id);
CREATE INDEX idx_app_notifications_user_unread ON public.app_notifications(user_id, read_at);