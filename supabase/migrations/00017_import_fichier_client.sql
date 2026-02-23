-- Import 18 prospects from Notion "Fichier client" (GESTION AGENCE)
-- Status mapping: site envoyé par mail / Mail a envoyé → interesse, RDV pris/fait → rdv_pris, A rappeler → a_rappeler

DO $$
DECLARE
  v_cid uuid;
BEGIN
  SELECT id INTO v_cid FROM profiles WHERE role = 'fondateur' LIMIT 1;

  -- 1. Tony Reybaud
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('TONY REYBAUD', 'Tony Reybaud', '0623033714', 'tony.oinne@gmail.com', 'interesse', 'manual', v_cid,
    'Macon gros oeuvre', 'https://macon-tony-reybaud.vercel.app/',
    'peut être intéresse le prix et pas chère il dis il a deja fait des site mais le problème c qu''il dis que ca convertit pas',
    '2026-02-18T00:00:00Z');

  -- 2. Michel Gourul
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('MG MENUISERIE CHARPENTE', 'Michel Gourul', '0630257302', 'mg.menuiseriecharpente@gmail.com', 'interesse', 'manual', v_cid,
    'menuisier', 'https://menuisier-mg-menuiserie-charpente.vercel.app/',
    'a deja pris rdv avec une autre agence sais le prix',
    '2026-02-18T00:00:00Z');

  -- 3. AYDIN elitas
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('AGEL FACADES', 'AYDIN elitas', '0666978911', 'info@groupefcp.fr', 'interesse', 'manual', v_cid,
    'maconnerie ravalement facade', 'https://macon-agel-facades.vercel.app/',
    NULL,
    '2026-02-19T00:00:00Z');

  -- 4. rouleau magalie - RDV pris le 26/02 à 11h
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, notes, created_at)
  VALUES ('DM Services', 'rouleau magalie', '0621338056', 'dmservices44@gmail.com', 'rdv_pris', 'manual', v_cid,
    'Demenageur',
    'interesse de bz cherche un site | RDV: 26/02 à 11h',
    '2026-02-17T00:00:00Z');

  -- 5. Christophe lecanu
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('Transports Boulocher', 'Christophe lecanu', '0642087060', 'direction@transportsboulocher.fr', 'interesse', 'manual', v_cid,
    'Demenageur', 'https://demenageur-tau.vercel.app/',
    NULL,
    '2026-02-17T00:00:00Z');

  -- 6. SOHAIB
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('ALLIANCE DEPANNAGE', 'SOHAIB', '0698591498', 'alliance.depannage.fr@gmail.com', 'interesse', 'manual', v_cid,
    'clim plomberie depannage serrurerie', 'https://plombier-alliance-depannage.vercel.app/',
    NULL,
    '2026-02-18T00:00:00Z');

  -- 7. Igor MINKO MI NZE
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('Avocat', 'Igor MINKO MI NZE', '0667280939', 'minkominze.avocat@gmail.com', 'interesse', 'manual', v_cid,
    'avocat droit etrangers', 'https://avocat-mu.vercel.app/',
    'eu au tel nous recontacte interesse',
    '2026-02-16T00:00:00Z');

  -- 8. Michel Bernard
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('MEA CLIM ENERGIE', 'Michel Bernard', '0750264998', 'mea.clim@gmail.com', 'interesse', 'manual', v_cid,
    'installation clima chauffage pompe a chaleur plomberie sanitaire', 'https://plombier-mea-clim-energie.vercel.app/',
    'est interesse site a envoye par mail',
    '2026-02-19T00:00:00Z');

  -- 9. Pierre Capello - RDV pris le 23/02 à 14h
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, notes, created_at)
  VALUES ('pierre CAPELLO', 'Pierre Capello', '0604178532', 'pierrecapello1974@gmail.com', 'rdv_pris', 'manual', v_cid,
    'Ravalement petit maconnerie peinture interieur elagage nettoyage exterieur',
    'cherche un site rdv lundi 23 a 14h',
    '2026-02-19T00:00:00Z');

  -- 10. Maxence Donate
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('MDNT CONSTRUCTION', 'Maxence Donate', '0621144549', 'mdntconstruction@gmail.com', 'interesse', 'manual', v_cid,
    'Charpente menuiserie', 'https://menuisier-mdnt-construction.vercel.app/',
    NULL,
    '2026-02-18T00:00:00Z');

  -- 11. Jeremy - A rappeler (manque email)
  INSERT INTO prospects (company_name, contact_name, phone, status, source, commercial_id, niche, notes, created_at)
  VALUES ('croisic espace vert', 'Jeremy', '0670756551', 'a_rappeler', 'manual', v_cid,
    'Paysagiste',
    'il manque son mail pour fixer rdv a rappeler',
    '2026-02-17T00:00:00Z');

  -- 12. Raphael khelifi
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('RK ENERGIES', 'Raphael khelifi', '0755602186', 'rk.energies81@gmail.com', 'interesse', 'manual', v_cid,
    'plomberie chauffagiste climatisation', 'https://plombier-rk-energies.vercel.app/',
    'fait des devis avec plusieurs agence est en train de racheter une entreprise pq pas faire un site pour les 2',
    '2026-02-19T00:00:00Z');

  -- 13. Alexandre BENEDETTI
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('EGB CONSTRUCTION & RENOVATION', 'Alexandre BENEDETTI', '0623678857', 'egbhabitat@gmail.com', 'interesse', 'manual', v_cid,
    'CONSTRUCTION RENOVATION entreprise generale du batiment maconnerie', 'https://macon-egb-construction-renovation.vercel.app/',
    'veut voir le site va avoir besoin d''un site',
    '2026-02-18T00:00:00Z');

  -- 14. Yohann Pereira
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('PLOMBERIE AQUALEO', 'Yohann Pereira', '0613142090', 'plombier88idf@gmail.com', 'interesse', 'manual', v_cid,
    'Plombier', 'https://plombier-plomberie-aqualeo.vercel.app/',
    'site a envoye par mail ultra qualifier prendre rdv a l''issu du mail',
    '2026-02-18T00:00:00Z');

  -- 15. Mickael Le gall - RDV fait le 20/02 à 14h
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('Atelier Le Gall menuisier', 'Mickael Le gall', '0673016237', 'atelier.legall22450@gmail.com', 'rdv_pris', 'manual', v_cid,
    'Menuisier', 'https://atelier-le-gall-menuisier.vercel.app/contact',
    'perdu a deja été démarcher rdv vendredi a 14h va falloir être bon sur le closing. prix annonce a 1000 avec mensualité 20 a dis qu''il étais pas sur d''investir sur un site mais on peut carrément le booker',
    '2026-02-17T00:00:00Z');

  -- 16. Arnaud zlotos
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, notes, created_at)
  VALUES ('AZ COUVERTURE CHARPENTE', 'Arnaud zlotos', '0785504044', 'azcouverture19@gmail.com', 'interesse', 'manual', v_cid,
    'COUVERTURE CHARPENTE',
    'pas en recherche de site mais dans le futur il veut',
    '2026-02-20T00:00:00Z');

  -- 17. muammer bayrak
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, website, notes, created_at)
  VALUES ('B.C.M CONSTRUCTION', 'muammer bayrak', '0607222104', 'bmc.construction@hotmail.fr', 'interesse', 'manual', v_cid,
    'Expertise en maçonnerie et gros œuvre', 'https://macon-muammer-bayrak-bcm-constructi.vercel.app/',
    'est pas forcement en recherche mais intéresse',
    '2026-02-20T00:00:00Z');

  -- 18. Jerome
  INSERT INTO prospects (company_name, contact_name, phone, contact_email, status, source, commercial_id, niche, notes, created_at)
  VALUES ('MSB MULTI SERVICES BATIMENTS', 'Jerome', '0628490094', 'msb.couverture@gmail.com', 'interesse', 'manual', v_cid,
    NULL,
    'interesse en fonction du prix sera plus disponible en fin de semaine',
    '2026-02-23T00:00:00Z');

END $$;
