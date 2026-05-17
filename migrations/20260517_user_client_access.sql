-- Multi-client access table
CREATE TABLE IF NOT EXISTS public.user_client_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role       public.user_role NOT NULL DEFAULT 'viewer',
  granted_at timestamp with time zone DEFAULT NOW(),
  granted_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, client_id)
);

ALTER TABLE public.user_client_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uca_select_own" ON public.user_client_access;
CREATE POLICY "uca_select_own" ON public.user_client_access
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uca_admin_insert" ON public.user_client_access;
CREATE POLICY "uca_admin_insert" ON public.user_client_access
  FOR INSERT WITH CHECK (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "uca_admin_delete" ON public.user_client_access;
CREATE POLICY "uca_admin_delete" ON public.user_client_access
  FOR DELETE USING (public.get_user_role() = 'admin');

-- Idempotent backfill from profiles
INSERT INTO public.user_client_access (user_id, client_id, role)
SELECT p.id, p.client_id, p.role
FROM public.profiles p
WHERE p.client_id IS NOT NULL
ON CONFLICT (user_id, client_id) DO NOTHING;
