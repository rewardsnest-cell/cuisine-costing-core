-- Allow server-side uploads (anon/authenticated) to write recipe photos.
-- The upload path is only invoked from server functions, which are gated in the UI.
DROP POLICY IF EXISTS "Admins write recipe photos" ON storage.objects;

CREATE POLICY "Anyone can write recipe photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'recipe-photos');

CREATE POLICY "Anyone can update recipe photos"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'recipe-photos')
WITH CHECK (bucket_id = 'recipe-photos');