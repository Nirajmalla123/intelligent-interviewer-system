DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars owner or admin read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role)));