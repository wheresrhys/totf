ALTER TABLE public."Test" ADD COLUMN haha text;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."Test" FROM anon;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."Test" FROM authenticated;
REVOKE DELETE, INSERT, SELECT, UPDATE ON public."Test" FROM service_role;
