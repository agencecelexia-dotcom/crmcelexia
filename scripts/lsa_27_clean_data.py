#!/usr/bin/env python3
"""
Étape 27 — Clean final des données CRM avant campagne email.

Trois passes :
  1. Clean company_name : virer émojis, splitter sur séparateurs, cap 50 chars
  2. Clean contact_firstname / contact_name : virer parasites
     (Internet, Liquidateur, parenthèses, chiffres, mots interdits)
  3. Dégager emails suspects :
     - Email apparaissant sur ≥ 2 prospects différents → tous vidés
     - Email "chelou" (google@gmail.com, brand@gmail, test@…) → vidé
     - Local part = mot très générique sur domaine perso → vidé
     - Email avec domaine fortune500 (google.com, etc.) → vidé

NE TOUCHE PAS :
  - status, call_count, last_called_at
  - phone, address, niche
"""
from __future__ import annotations
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent

# Mots à virer du nom de société (après split)
COMPANY_STOP_WORDS = {
    "couvreur", "couverture", "plombier", "plomberie", "chauffagiste",
    "chauffage", "pisciniste", "piscine", "paysagiste", "paysage",
    "elagage", "elagueur", "jardinier", "jardinage", "bardage",
    "ravalement", "façade", "facade", "cloture", "clôture",
    "lille", "paris", "lyon", "marseille", "bordeaux", "nantes",
    "toulouse", "nice", "rennes", "strasbourg", "montpellier", "rouen",
    "grenoble", "tours", "orleans", "dijon", "vannes", "brest",
    "devis", "gratuit", "professionnel", "artisan", "entreprise",
    "création", "creation", "rénovation", "renovation", "installation",
    "dépannage", "depannage", "réparation", "reparation", "entretien",
    "showroom", "magasin", "site", "official", "officiel",
}

# Mots interdits dans prénoms/noms (parasites)
NAME_STOP_WORDS = {
    "internet", "site", "société", "societe", "sarl", "sas", "sa",
    "eurl", "sasu", "siret", "rcs", "ape", "tva", "siège", "social",
    "publication", "monsieur", "madame", "responsable", "directeur",
    "directrice", "gérant", "gerant", "président", "president",
    "liquidateur", "représentant", "representant", "éditeur", "editeur",
}

# Domaines "fortune500" qui n'envoient jamais d'emails artisans
SUSPICIOUS_DOMAINS = {
    "google.com", "facebook.com", "instagram.com", "linkedin.com",
    "twitter.com", "youtube.com", "tiktok.com", "microsoft.com",
    "apple.com", "amazon.com", "amazon.fr", "ebay.com", "ebay.fr",
    "paypal.com", "paypal.fr", "stripe.com", "shopify.com",
    "wordpress.com", "wix.com", "weebly.com", "squarespace.com",
    "github.com", "gitlab.com", "bitbucket.org", "atlassian.com",
    "salesforce.com", "hubspot.com", "zendesk.com", "intercom.com",
    "adobe.com", "oracle.com", "sap.com", "ibm.com",
}

# Domaines emails perso (gmail, yahoo, etc.)
PERSONAL_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.fr", "yahoo.com", "hotmail.fr", "hotmail.com",
    "outlook.fr", "outlook.com", "live.fr", "live.com",
    "free.fr", "orange.fr", "wanadoo.fr", "laposte.net",
    "sfr.fr", "bbox.fr", "neuf.fr", "club-internet.fr",
    "aliceadsl.fr", "numericable.fr",
}

# Préfixes locaux suspects (sur domaine perso = très louche)
SUSPICIOUS_LOCAL_ON_PERSONAL = {
    "google", "facebook", "instagram", "youtube", "amazon", "apple",
    "microsoft", "twitter", "tiktok", "spotify", "netflix",
    "admin", "administrator", "webmaster", "postmaster", "root",
    "test", "demo", "example", "sample", "support",
}

EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U0001F700-\U0001F77F"  # alchemical
    "\U0001F780-\U0001F7FF"  # geometric
    "\U0001F800-\U0001F8FF"  # supplemental arrows
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "\U0001FA00-\U0001FA6F"  # chess
    "\U0001FA70-\U0001FAFF"  # symbols extended
    "\U00002700-\U000027BF"  # dingbats
    "\U00002600-\U000026FF"  # misc
    "]+",
    flags=re.UNICODE,
)


def load_env() -> dict:
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip()
    return out


def deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def clean_company_name(raw: str) -> str:
    if not raw:
        return ""
    s = EMOJI_RE.sub("", raw).strip()
    # Split sur séparateurs forts
    parts = re.split(r"[|•·\-—–]\s*", s, maxsplit=1)
    s = parts[0].strip()

    # Si toujours trop long, couper sur une virgule
    if len(s) > 50:
        parts = s.split(",", 1)
        s = parts[0].strip()

    # Si encore trop long et contient un mot métier, couper juste avant
    if len(s) > 50:
        s_lower = deaccent(s.lower())
        for kw in COMPANY_STOP_WORDS:
            idx = s_lower.find(" " + kw)
            if 5 < idx < 50:
                s = s[:idx].strip()
                break

    # Title case léger : préserver majuscules existantes sauf si TOUT en MAJ
    if s.isupper() and len(s) > 3:
        s = " ".join(w.capitalize() for w in s.split())

    return s.strip()[:80]


def clean_name(raw: str) -> str:
    """Clean un prénom OU un nom. Renvoie '' si invalide."""
    if not raw:
        return ""
    s = raw.strip()
    # Virer parenthèses et leur contenu
    s = re.sub(r"\([^)]*\)", "", s).strip()
    s = re.sub(r"\s+", " ", s)

    if not s or len(s) < 2 or len(s) > 50:
        return ""
    # Pas de chiffres
    if any(c.isdigit() for c in s):
        return ""
    # Pas d'email
    if "@" in s:
        return ""

    # Garde uniquement les mots qui ne sont pas stop_words
    words = []
    for w in s.split():
        wl = deaccent(w.lower())
        if wl in NAME_STOP_WORDS:
            continue
        if len(w) < 2:
            continue
        words.append(w.title())
    if not words:
        return ""
    return " ".join(words[:3])  # max 3 mots


def is_suspicious_email(email: str, company: str = "") -> tuple[bool, str]:
    """Retourne (suspicious, reason)."""
    e = email.lower().strip()
    if "@" not in e:
        return True, "no_at"
    local, domain = e.rsplit("@", 1)
    if not local or not domain:
        return True, "empty_part"
    if domain in SUSPICIOUS_DOMAINS:
        return True, f"suspicious_domain:{domain}"
    if domain in PERSONAL_EMAIL_DOMAINS and local in SUSPICIOUS_LOCAL_ON_PERSONAL:
        return True, f"suspicious_local_on_personal:{local}"
    # Local part = brand/marque connue
    for brand in SUSPICIOUS_LOCAL_ON_PERSONAL:
        if local == brand or local.startswith(brand + ".") or local.startswith(brand + "-"):
            return True, f"brand_local:{brand}"
    # Format invalide (caractères chelous, trop court, etc.)
    if len(local) < 2 or len(domain) < 4 or "." not in domain:
        return True, "format_invalid"
    return False, ""


def main() -> None:
    env = load_env()
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    # 1. Charge tous les prospects actifs
    print("→ Chargement DB CRM...")
    all_rows = []
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, company_name, contact_email, contact_firstname, contact_name, status, custom_fields"
        ).is_("deleted_at", "null").range(offset, offset + 999).execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"  {len(all_rows)} prospects actifs")
    print()

    # 2. Compte emails pour détecter doublons
    email_count: Counter[str] = Counter()
    for r in all_rows:
        em = (r.get("contact_email") or "").lower().strip()
        if em:
            email_count[em] += 1

    dup_emails = {em for em, c in email_count.items() if c >= 2}
    print(f"→ Emails dupliqués (≥ 2 sociétés) : {len(dup_emails)}")
    if dup_emails:
        # Top duplicates pour log
        top_dup = sorted(((em, email_count[em]) for em in dup_emails), key=lambda x: -x[1])[:10]
        for em, c in top_dup:
            print(f"    {c}× {em}")
    print()

    # 3. Pass cleanup
    company_changes = 0
    firstname_changes = 0
    name_changes = 0
    email_cleared_dup = 0
    email_cleared_suspicious = 0
    updates_failed = 0
    rows_updated = 0

    suspicious_log = []

    for i, r in enumerate(all_rows):
        if i % 200 == 0:
            print(f"  {i}/{len(all_rows)}... updated={rows_updated}")

        update_data = {}

        # 3a. Company name
        old_company = r.get("company_name") or ""
        new_company = clean_company_name(old_company)
        if new_company and new_company != old_company:
            update_data["company_name"] = new_company
            company_changes += 1

        # 3b. Firstname
        old_first = r.get("contact_firstname") or ""
        new_first = clean_name(old_first)
        if new_first != old_first:
            update_data["contact_firstname"] = new_first if new_first else None
            firstname_changes += 1

        # 3c. Name
        old_name = r.get("contact_name") or ""
        new_name = clean_name(old_name)
        if new_name != old_name:
            update_data["contact_name"] = new_name if new_name else None
            name_changes += 1

        # 3d. Email — doublon ou suspect
        email = (r.get("contact_email") or "").lower().strip()
        if email:
            if email in dup_emails:
                update_data["contact_email"] = None
                email_cleared_dup += 1
            else:
                susp, reason = is_suspicious_email(email, r.get("company_name") or "")
                if susp:
                    update_data["contact_email"] = None
                    email_cleared_suspicious += 1
                    suspicious_log.append((email, reason))

        if not update_data:
            continue

        try:
            sb.table("prospects").update(update_data).eq("id", r["id"]).execute()
            rows_updated += 1
        except Exception as e:
            updates_failed += 1
            if updates_failed < 5:
                print(f"  ⚠ {r['id']}: {e}")

    print()
    print("=" * 60)
    print("✅ CLEAN DONE")
    print("=" * 60)
    print(f"Total prospects updated : {rows_updated}")
    print(f"  - company_name cleaned : {company_changes}")
    print(f"  - firstname cleaned    : {firstname_changes}")
    print(f"  - name cleaned         : {name_changes}")
    print(f"  - email cleared (dup)  : {email_cleared_dup}")
    print(f"  - email cleared (susp) : {email_cleared_suspicious}")
    print(f"Failed                  : {updates_failed}")

    # Top reasons suspicieux
    if suspicious_log:
        print("\nTop raisons emails suspects :")
        reasons = Counter(r for _, r in suspicious_log)
        for reason, c in reasons.most_common(10):
            print(f"  {reason:40s} : {c}")


if __name__ == "__main__":
    main()
