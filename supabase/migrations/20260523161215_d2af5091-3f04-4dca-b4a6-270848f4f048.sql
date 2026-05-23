
CREATE TABLE public.user_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_invites_code_idx ON public.user_invites(code);
CREATE INDEX user_invites_email_idx ON public.user_invites(LOWER(email));

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage user_invites"
ON public.user_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
