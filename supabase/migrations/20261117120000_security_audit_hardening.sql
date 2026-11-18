-- Endurecimiento tras la auditoría de seguridad del 17/11/2026 (solo permisos y políticas; sin datos).
-- 1) property_features: solo agentes/admin escriben (antes cualquier dueño podía saltarse las RPC owner_*).
-- 2) Mínimo privilegio en grants de tabla: anon no escribe en nada; authenticated solo donde hay política.
--    RLS ya neutralizaba estas escrituras; esto añade una segunda capa por si alguna vez entra una política permisiva.
-- 3) Rendimiento: la función de usuario de auth envuelta en (select ...) para evaluarse una vez por consulta (advisor auth_rls_initplan).
-- Semántica de las políticas existentes sin cambios salvo el punto 1.

-- 1) property_features
alter policy "agents manage property features" on public.property_features
  using (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = property_features.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())))
  with check (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = property_features.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())));

-- 2) Grants de tabla. TRUNCATE, TRIGGER, REFERENCES y MAINTAIN nunca los usa la API.
revoke insert, update, delete, truncate, references, trigger, maintain
  on public.properties, public.property_images, public.property_features, public.favorites,
     public.leads, public.property_views, public.profiles, public.admin_audit_log
  from anon;
revoke select on public.favorites from anon;  -- favoritos son siempre de un usuario con sesión

revoke truncate, references, trigger, maintain
  on public.properties, public.property_images, public.property_features, public.favorites,
     public.leads, public.property_views, public.profiles, public.admin_audit_log
  from authenticated;
-- Sin política que las permita:
revoke delete on public.leads from authenticated;
revoke update, delete on public.property_views from authenticated;

-- 3) Mismas políticas, el usuario de auth evaluado una vez por consulta.
alter policy "profiles read own record" on public.profiles
  using (((select auth.uid()) = id) or private.is_admin());
alter policy "profiles update own record" on public.profiles
  using (((select auth.uid()) = id) or private.is_admin())
  with check (((select auth.uid()) = id) or private.is_admin());

alter policy "agents manage properties" on public.properties
  with check (private.is_agent() and ((agent_id = (select auth.uid())) or (owner_id = (select auth.uid())) or private.is_admin()));
alter policy "agents update managed properties" on public.properties
  using (private.is_agent() and ((agent_id = (select auth.uid())) or (owner_id = (select auth.uid())) or private.is_admin()))
  with check (private.is_agent() and ((agent_id = (select auth.uid())) or (owner_id = (select auth.uid())) or private.is_admin()));

alter policy "agents read related leads" on public.leads
  using (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = leads.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())));
alter policy "agents update related leads" on public.leads
  using (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = leads.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())))
  with check (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = leads.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())));

alter policy "users manage own favorites" on public.favorites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "agents read property views" on public.property_views
  using (private.is_agent() and exists (
    select 1 from public.properties p
    where p.id = property_views.property_id
      and (p.agent_id = (select auth.uid()) or p.owner_id = (select auth.uid()) or private.is_admin())));

notify pgrst, 'reload schema';
