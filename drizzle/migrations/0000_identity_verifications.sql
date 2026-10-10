CREATE TABLE public.identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  matched boolean NOT NULL,
  confidence double precision NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.identity_verifications TO authenticated;
GRANT ALL ON public.identity_verifications TO service_role;
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own verifications" ON public.identity_verifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX identity_verifications_user_idx ON public.identity_verifications (user_id, created_at DESC);