-- Ajoute la policy UPDATE manquante sur storage.objects pour bucket portal-documents.
-- Sans elle, un re-upload avec upsert: true échoue silencieusement si le fichier
-- existe déjà (notre code utilise Date.now() dans le path donc c'est rare,
-- mais le filet de sécurité évite des bugs subtils lors de re-signatures).

CREATE POLICY portal_doc_artisan_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT clients.id::text FROM clients WHERE clients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT clients.id::text FROM clients WHERE clients.user_id = auth.uid()
    )
  );
