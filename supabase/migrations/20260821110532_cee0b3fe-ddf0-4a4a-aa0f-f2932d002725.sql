CREATE POLICY "own interview videos update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'interview-videos' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'interview-videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "own interview videos delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'interview-videos' AND (storage.foldername(name))[1] = (auth.uid())::text);