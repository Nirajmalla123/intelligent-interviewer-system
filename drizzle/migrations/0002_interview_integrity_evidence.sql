CREATE TABLE public.interview_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_key uuid NOT NULL UNIQUE,
 interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
 question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
 kind text NOT NULL,
 observed_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 details text NOT NULL,
 source text NOT NULL DEFAULT 'browser_observation'
);
GRANT SELECT ON public.interview_security_events TO authenticated;
GRANT ALL ON public.interview_security_events TO service_role;
ALTER TABLE public.interview_security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY integrity_events_read ON public.interview_security_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.candidate_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX integrity_events_interview ON public.interview_security_events(interview_id, observed_at);
CREATE TABLE public.answer_integrity_reviews (
 answer_id uuid PRIMARY KEY REFERENCES public.answers(id) ON DELETE CASCADE,
 interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
 review jsonb NOT NULL,
 assessed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.answer_integrity_reviews TO authenticated;
GRANT ALL ON public.answer_integrity_reviews TO service_role;
ALTER TABLE public.answer_integrity_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY integrity_reviews_read ON public.answer_integrity_reviews FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND i.candidate_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));