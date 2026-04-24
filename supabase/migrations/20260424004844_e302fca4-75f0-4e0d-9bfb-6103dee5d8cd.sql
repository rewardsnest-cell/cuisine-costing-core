-- Allow public (anon + authenticated) to read only published cooking guides
CREATE POLICY "Public can view published cooking guides"
ON public.cooking_guides
FOR SELECT
TO anon, authenticated
USING (status = 'published');