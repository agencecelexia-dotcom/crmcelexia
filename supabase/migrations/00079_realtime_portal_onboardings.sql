-- Active Supabase Realtime sur portal_onboardings pour que la page client
-- côté admin se mette à jour instantanément quand l'artisan progresse dans
-- son onboarding (sans avoir à recharger / changer d'onglet).

ALTER PUBLICATION supabase_realtime ADD TABLE portal_onboardings;
