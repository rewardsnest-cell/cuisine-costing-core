-- Create public storage bucket for Cooking Lab videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cooking-lab-videos',
  'cooking-lab-videos',
  true,
  524288000, -- 500 MB
  ARRAY['video/mp4','video/webm','video/quicktime','video/x-m4v']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access
CREATE POLICY "Cooking lab videos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'cooking-lab-videos');

-- Admins can upload
CREATE POLICY "Admins can upload cooking lab videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cooking-lab-videos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Admins can update
CREATE POLICY "Admins can update cooking lab videos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cooking-lab-videos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Admins can delete
CREATE POLICY "Admins can delete cooking lab videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cooking-lab-videos'
  AND public.has_role(auth.uid(), 'admin')
);