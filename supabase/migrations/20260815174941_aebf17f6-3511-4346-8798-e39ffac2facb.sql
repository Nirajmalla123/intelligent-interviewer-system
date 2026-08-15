-- 1) interview_scores / reports: AI-owned tables, writes only via service role
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.interview_scores FROM authenticated;
REVOKE ALL ON public.interview_scores FROM anon;
GRANT SELECT ON public.interview_scores TO authenticated;
GRANT ALL ON public.interview_scores TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.reports FROM authenticated;
REVOKE ALL ON public.reports FROM anon;
GRANT SELECT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

-- 2) user_roles: no client-side role writes (prevents privilege escalation)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles FROM authenticated;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Explicit deny-by-default documentation: no write policies exist for these tables
-- (RLS is enabled and only SELECT policies are defined), so even a future grant
-- would not permit client-side writes.

-- 3) SECURITY DEFINER helpers: keep them out of reach of anonymous/public callers.
--    authenticated must retain EXECUTE on has_role/owns_* because RLS policies
--    evaluate these functions as the querying role.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_answer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_interview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_answer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_interview(uuid) TO authenticated, service_role;