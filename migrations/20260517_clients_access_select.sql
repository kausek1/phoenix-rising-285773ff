-- Allow users to SELECT any client they have access to via user_client_access.
-- Without this, the ClientSwitcher join silently drops rows the user can't read.
DROP POLICY IF EXISTS "clients_select_via_access" ON public.clients;
CREATE POLICY "clients_select_via_access" ON public.clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_client_access uca
      WHERE uca.client_id = clients.id
        AND uca.user_id = auth.uid()
    )
  );
