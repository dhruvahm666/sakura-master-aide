
CREATE TABLE public.voice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Voice conversation',
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_sessions_select_own" ON public.voice_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "voice_sessions_insert_own" ON public.voice_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "voice_sessions_update_own" ON public.voice_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "voice_sessions_delete_own" ON public.voice_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER voice_sessions_set_updated_at
  BEFORE UPDATE ON public.voice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX voice_sessions_user_updated_idx ON public.voice_sessions(user_id, updated_at DESC);
