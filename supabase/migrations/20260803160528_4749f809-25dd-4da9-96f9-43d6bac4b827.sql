CREATE TYPE public.app_role AS ENUM ('candidate', 'admin');
CREATE TYPE public.interview_status AS ENUM ('in_progress', 'completed', 'abandoned');
CREATE TYPE public.analysis_status AS ENUM ('pending', 'processing', 'complete', 'failed');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  headline text,
  target_role text,
  years_experience integer NOT NULL DEFAULT 0,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select own or admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'candidate') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resumes select" ON public.resumes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "resumes write own" ON public.resumes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_role text NOT NULL,
  seniority text NOT NULL DEFAULT 'mid',
  status public.interview_status NOT NULL DEFAULT 'in_progress',
  planned_questions integer NOT NULL DEFAULT 5,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interviews select" ON public.interviews FOR SELECT TO authenticated
  USING (candidate_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "interviews write own" ON public.interviews FOR ALL TO authenticated
  USING (candidate_id = auth.uid()) WITH CHECK (candidate_id = auth.uid());
CREATE TRIGGER interviews_updated_at BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX interviews_candidate_idx ON public.interviews (candidate_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.owns_interview(_interview_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = _interview_id AND i.candidate_id = auth.uid())
$$;

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  parent_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  category text NOT NULL DEFAULT 'technical',
  is_followup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions select" ON public.questions FOR SELECT TO authenticated
  USING (public.owns_interview(interview_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "questions write own" ON public.questions FOR ALL TO authenticated
  USING (public.owns_interview(interview_id)) WITH CHECK (public.owns_interview(interview_id));
CREATE INDEX questions_interview_idx ON public.questions (interview_id, order_index);

CREATE TABLE public.answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_path text,
  duration_seconds numeric NOT NULL DEFAULT 0,
  analysis_status public.analysis_status NOT NULL DEFAULT 'pending',
  analysis_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answers TO authenticated;
GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers select" ON public.answers FOR SELECT TO authenticated
  USING (candidate_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "answers write own" ON public.answers FOR ALL TO authenticated
  USING (candidate_id = auth.uid()) WITH CHECK (candidate_id = auth.uid());
CREATE TRIGGER answers_updated_at BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX answers_interview_idx ON public.answers (interview_id, created_at);

CREATE OR REPLACE FUNCTION public.owns_answer(_answer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.answers a WHERE a.id = _answer_id AND a.candidate_id = auth.uid())
$$;

CREATE TABLE public.speech_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL UNIQUE REFERENCES public.answers(id) ON DELETE CASCADE,
  transcript text NOT NULL DEFAULT '',
  language text,
  confidence numeric,
  word_count integer NOT NULL DEFAULT 0,
  speech_duration_seconds numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.face_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL UNIQUE REFERENCES public.answers(id) ON DELETE CASCADE,
  face_detected_ratio numeric NOT NULL DEFAULT 0,
  eye_contact_ratio numeric NOT NULL DEFAULT 0,
  head_stability numeric NOT NULL DEFAULT 0,
  blink_rate_per_min numeric NOT NULL DEFAULT 0,
  yaw_avg numeric NOT NULL DEFAULT 0,
  pitch_avg numeric NOT NULL DEFAULT 0,
  landmark_samples integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.emotion_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL UNIQUE REFERENCES public.answers(id) ON DELETE CASCADE,
  happy numeric NOT NULL DEFAULT 0,
  sad numeric NOT NULL DEFAULT 0,
  neutral numeric NOT NULL DEFAULT 0,
  fear numeric NOT NULL DEFAULT 0,
  angry numeric NOT NULL DEFAULT 0,
  surprise numeric NOT NULL DEFAULT 0,
  dominant_emotion text NOT NULL DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.voice_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL UNIQUE REFERENCES public.answers(id) ON DELETE CASCADE,
  pitch_hz numeric NOT NULL DEFAULT 0,
  pitch_variance numeric NOT NULL DEFAULT 0,
  energy_rms numeric NOT NULL DEFAULT 0,
  volume_db numeric NOT NULL DEFAULT 0,
  speech_rate_wpm numeric NOT NULL DEFAULT 0,
  pause_count integer NOT NULL DEFAULT 0,
  total_pause_seconds numeric NOT NULL DEFAULT 0,
  voice_confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.llm_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL UNIQUE REFERENCES public.answers(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lovable-ai',
  model text NOT NULL DEFAULT '',
  technical_score numeric NOT NULL DEFAULT 0,
  communication_score numeric NOT NULL DEFAULT 0,
  relevance_score numeric NOT NULL DEFAULT 0,
  grammar_score numeric NOT NULL DEFAULT 0,
  evaluation text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_question text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interview_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  overall_score numeric NOT NULL DEFAULT 0,
  technical_score numeric NOT NULL DEFAULT 0,
  communication_score numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  emotion_score numeric NOT NULL DEFAULT 0,
  eye_contact_score numeric NOT NULL DEFAULT 0,
  voice_score numeric NOT NULL DEFAULT 0,
  grammar_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.interview_scores TO authenticated;
GRANT ALL ON public.interview_scores TO service_role;
ALTER TABLE public.interview_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores select" ON public.interview_scores FOR SELECT TO authenticated
  USING (public.owns_interview(interview_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER scores_updated_at BEFORE UPDATE ON public.interview_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  recommendation text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  chart_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports select" ON public.reports FOR SELECT TO authenticated
  USING (public.owns_interview(interview_id) OR public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['speech_analysis','face_analysis','emotion_analysis','voice_analysis','llm_evaluations']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY "%1$s select" ON public.%1$I FOR SELECT TO authenticated
      USING (public.owns_answer(answer_id) OR public.has_role(auth.uid(), 'admin'))$f$, t);
  END LOOP;
END $$;

CREATE POLICY "own interview videos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'interview-videos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "own interview videos write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interview-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own resumes read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "own resumes write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own resumes delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);