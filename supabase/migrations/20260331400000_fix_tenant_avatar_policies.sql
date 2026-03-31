-- Fix tenant avatar storage policies to use single-arg is_org_member
-- (matches the working org-avatars pattern)

DROP POLICY IF EXISTS "Org members can upload tenant avatars" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update tenant avatars" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete tenant avatars" ON storage.objects;

-- SELECT policy needed for INSERT ... RETURNING * and upsert
CREATE POLICY "Anyone can read tenant avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-avatars');

CREATE POLICY "Org members can upload tenant avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can update tenant avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can delete tenant avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );
