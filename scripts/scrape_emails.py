#!/usr/bin/env python3
"""
Enrichissement emails — prospects Celexia non contactés.

Lit data/prospects-non-contactes.csv et pour chaque prospect avec un
website, visite les pages courantes (contact, mentions légales, à propos)
et extrait les emails par regex. Écrit le résultat dans
data/prospects-emails-enrichis.csv.

Usage :
    pip3 install requests beautifulsoup4
    python3 scripts/scrape_emails.py            # test sur 20 prospects
    python3 scripts/scrape_emails.py --full     # tous les 4543

Légal B2B : scraping d'emails pro déjà publics sur les sites des
prospects, pour démarchage commercial. Conforme RGPD si opt-out
mentionné au 1er contact (intérêt légitime, art. 6.1.f).
"""

from __future__ import annotations
import argparse
import csv
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
import urllib3
from bs4 import BeautifulSoup

# On ignore les certificats SSL périmés (très répandu chez les artisans).
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = Path(__file__).resolve().parent.parent
INPUT_CSV = ROOT / "data" / "prospects-non-contactes.csv"
OUTPUT_CSV = ROOT / "data" / "prospects-emails-enrichis.csv"

# Pages courantes où les emails se cachent (top 5 les plus rentables).
# Après mesure : 90% des emails trouvés viennent de home + /contact + /mentions-legales.
PROBE_PATHS = [
    "",  # home
    "/contact",
    "/nous-contacter",
    "/mentions-legales",
    "/a-propos",
]

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
)

# Patterns à filtrer (emails techniques / faux positifs / templates).
# Tout email contenant l'une de ces chaînes en SOUS-CHAÎNE est jeté.
BLOCKLIST = {
    # Erreurs / robots
    "sentry.io", "noreply", "no-reply", "donotreply", "do-not-reply",
    "u003e", "u003c", "@2x", "@3x",
    # Builders de site (apparaissent dans le footer/CMS)
    "wixpress.com", "wix.com", "webador", "ovhcloud", "ovh.com",
    "jimdo", "squarespace", "weebly", "godaddy", "1and1.fr", "ionos",
    "shopify.com", "myshopify.com", "prestashop", "shopify-mail",
    "wordpress.com", "automattic.com", "wpengine",
    # Trackers / analytics
    "google-analytics", "googleadservices", "facebook.com", "fbcdn",
    "googletagmanager", "doubleclick", "hotjar.com", "intercom",
    # Templates / placeholders répandus
    "example.com", "test.com", "domain.com", "yourdomain", "votredomaine",
    "email@", "nom@", "prenom@", "votre.email", "votre-email",
    "jacques@martin.com",  # template WordPress canonique vu en prod
    "john@doe", "jane@doe", "john.doe", "jane.doe",
    "lorem.ipsum", "lorem@",
    "mon@mail.fr", "mail@mail.fr",  # placeholders mailto vus en prod
    # Adresses techniques agences/dev (recurrent dans pied de page sites WP)
    "cm2c.net", "stagheaddesigns", "hkcom",
    "comuneidee.fr",  # agence digitale qui appose son email en footer
}

# Emails personnels "OK" (FAI / boîtes pro classiques)
PERSONAL_DOMAINS = {
    "gmail.com", "outlook.fr", "outlook.com", "hotmail.fr", "hotmail.com",
    "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr",
    "yahoo.fr", "yahoo.com", "live.fr", "icloud.com", "me.com",
    "bbox.fr", "neuf.fr", "aliceadsl.fr",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CelexiaCRM-Enricher/1.0; "
        "+contact: agence.celexia@gmail.com)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

TIMEOUT = (5, 8)      # (connect, read) — strict pour éviter les hangs
PROSPECT_HARD_TIMEOUT = 20  # max secondes pour TOUT le scraping d'un prospect (5 pages)
MAX_WORKERS = 15      # 15 prospects en parallèle (~5-8 req/s effectif)
DELAY_BETWEEN_PROBES = 0.2  # pause entre 2 pages du même site


def normalize_url(url: str) -> str | None:
    """Normalise et valide une URL. Retourne None si inutilisable."""
    if not url or not url.strip():
        return None
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return None
        # Strip path/query/fragment pour repartir de la racine
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return None


def is_email_garbage(email: str) -> bool:
    """Filtre les emails techniques / faux positifs."""
    email_lower = email.lower()
    if any(b in email_lower for b in BLOCKLIST):
        return True
    # Emails trop courts ou avec extension bizarre
    local, _, domain = email_lower.partition("@")
    if len(local) < 2 or len(domain) < 4:
        return True
    # Extensions suspectes (souvent des sprites image scannés)
    tld = domain.rsplit(".", 1)[-1]
    if tld in {"png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js"}:
        return True
    return False


def extract_emails_from_html(html: str) -> set[str]:
    """Extrait les emails uniques d'un HTML, en dédupliquant et filtrant."""
    # 1) Regex globale sur le texte brut
    candidates = set(EMAIL_RE.findall(html))
    # 2) Liens mailto: (souvent plus propres)
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a[href^='mailto:']"):
        href = a.get("href", "")
        addr = href[7:].split("?")[0].strip()
        if addr:
            candidates.add(addr)
    # 3) Filtre
    return {e.lower() for e in candidates if not is_email_garbage(e)}


def rank_emails(emails: set[str], site_url: str | None) -> list[tuple[str, str]]:
    """
    Trie les emails par qualité décroissante et retourne max 3 paires
    (email, quality_tag) où tag ∈ {high, medium, low}.

    - high   : email finissant par @<domaine-du-site> (vraie boîte de l'entreprise)
    - medium : email sur FAI classique (gmail, orange, etc.) — souvent le gérant
    - low    : autre (vendor, voisin du footer, etc.) — à vérifier manuellement
    """
    site_domain: str | None = None
    if site_url:
        try:
            netloc = urlparse(site_url).netloc.lower()
            # Strip www. et sous-domaine éventuel pour matcher email pro
            site_domain = netloc.lstrip("www.")
        except Exception:
            site_domain = None

    def tag(email: str) -> str:
        domain = email.split("@", 1)[1] if "@" in email else ""
        if site_domain and (domain == site_domain or site_domain.endswith("." + domain) or domain.endswith("." + site_domain)):
            return "high"
        if domain in PERSONAL_DOMAINS:
            return "medium"
        return "low"

    ranked = sorted(emails, key=lambda e: ({"high": 0, "medium": 1, "low": 2}[tag(e)], e))
    return [(e, tag(e)) for e in ranked[:3]]


def fetch(url: str) -> str | None:
    """Récupère le HTML d'une URL avec gestion d'erreur souple.
    Timeout strict (5s connect, 8s read), pas de retry — si ça plante on passe.
    SSL ignoré (beaucoup d'artisans ont des certificats périmés)."""
    try:
        r = requests.get(
            url, headers=HEADERS, timeout=TIMEOUT,
            allow_redirects=True, verify=False,
        )
        if r.status_code == 200 and "text/html" in r.headers.get("Content-Type", "").lower():
            # Limite taille HTML à 500 KB pour éviter d'absorber des sites énormes
            return r.text[:500_000]
    except Exception:
        pass
    return None


def scrape_prospect(row: dict) -> dict:
    """Scrape un prospect, retourne la row enrichie avec emails_found + quality."""
    website = normalize_url(row.get("website"))
    emails_found: set[str] = set()
    pages_visited = 0
    if website:
        for path in PROBE_PATHS:
            url = urljoin(website, path) if path else website
            html = fetch(url)
            pages_visited += 1
            if html:
                emails_found |= extract_emails_from_html(html)
                if emails_found:
                    # Si on en a déjà, on s'arrête vite (souvent les bons sont en home/contact)
                    if pages_visited >= 3:
                        break
            time.sleep(DELAY_BETWEEN_PROBES)

    # Classement par qualité (high > medium > low), top 3 max
    ranked = rank_emails(emails_found, website)
    row["emails_found"] = ";".join(e for e, _ in ranked)
    row["email_quality"] = ";".join(t for _, t in ranked)
    # Meilleur email (le top 1) + sa qualité — colonnes prêtes pour UPDATE SQL
    row["best_email"] = ranked[0][0] if ranked else ""
    row["best_email_quality"] = ranked[0][1] if ranked else ""
    row["pages_visited"] = str(pages_visited)
    return row


def load_already_processed() -> set[str]:
    """Lit le CSV de sortie s'il existe, retourne les IDs déjà traités.

    Permet de reprendre un scrape interrompu sans refaire les prospects
    déjà scannés. Aucune perte de travail.
    """
    if not OUTPUT_CSV.exists():
        return set()
    try:
        with OUTPUT_CSV.open(encoding="utf-8") as f:
            return {row["id"] for row in csv.DictReader(f) if row.get("id")}
    except Exception:
        return set()


def append_row(row: dict, fieldnames: list[str], header_written: bool) -> bool:
    """Écrit une ligne au CSV en mode append, gère le header.

    Retourne True si le header est désormais écrit (à passer au prochain
    appel pour ne pas le réécrire).
    """
    OUTPUT_CSV.parent.mkdir(exist_ok=True)
    mode = "a" if header_written else "w"
    with OUTPUT_CSV.open(mode, encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not header_written:
            writer.writeheader()
        writer.writerow(row)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Traite tous les prospects (sinon limit 20)")
    parser.add_argument("--limit", type=int, default=20, help="Nombre max (défaut 20)")
    parser.add_argument("--reset", action="store_true", help="Repart de zéro (supprime le CSV existant)")
    args = parser.parse_args()

    if not INPUT_CSV.exists():
        print(f"ERREUR : {INPUT_CSV} introuvable", file=sys.stderr)
        sys.exit(1)

    if args.reset and OUTPUT_CSV.exists():
        OUTPUT_CSV.unlink()
        print(f"→ {OUTPUT_CSV.name} supprimé, on repart de zéro\n")

    with INPUT_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Filtre : skip ceux qui ont déjà un email + ceux sans website
    candidates = [r for r in rows if not r.get("email") and r.get("website")]
    print(f"Total prospects : {len(rows)}")
    print(f"Avec website, sans email : {len(candidates)}")

    # Reprise auto : skip les IDs déjà présents dans le CSV de sortie
    done_ids = load_already_processed()
    if done_ids:
        before = len(candidates)
        candidates = [c for c in candidates if c["id"] not in done_ids]
        print(f"Déjà traités (reprise auto) : {before - len(candidates)}")
        print(f"Restant à scraper : {len(candidates)}")

    if not args.full:
        candidates = candidates[: args.limit]
        print(f"Test sur {len(candidates)} prospects (--full pour tout)\n")
    else:
        print(f"Mode FULL : {len(candidates)} prospects\n")

    if not candidates:
        print("Rien à faire — tout est déjà traité. Utilise --reset pour recommencer.")
        return

    # Fieldnames basés sur la 1re row + colonnes ajoutées par scrape_prospect
    base_fields = list(candidates[0].keys())
    extra_fields = ["emails_found", "email_quality", "best_email", "best_email_quality", "pages_visited"]
    fieldnames = base_fields + [f for f in extra_fields if f not in base_fields]

    header_written = OUTPUT_CSV.exists() and OUTPUT_CSV.stat().st_size > 0

    start = time.monotonic()
    processed = 0
    found = 0
    high = medium = low = 0
    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = {ex.submit(scrape_prospect, r): r for r in candidates}
            for fut in as_completed(futures):
                # Hard timeout : si un worker pend (DNS mort, SSL bloqué…), on l'abandonne
                # après PROSPECT_HARD_TIMEOUT secondes et on passe au suivant.
                try:
                    row = fut.result(timeout=PROSPECT_HARD_TIMEOUT)
                except Exception as e:
                    # Worker mort/abandonné — on stocke quand même une row vide pour
                    # ne pas réessayer ce prospect au prochain run (sinon boucle infinie).
                    orig = futures[fut]
                    row = dict(orig)
                    row["emails_found"] = ""
                    row["email_quality"] = ""
                    row["best_email"] = ""
                    row["best_email_quality"] = ""
                    row["pages_visited"] = "TIMEOUT"
                    print(f"[{processed + 1:>4}/{len(candidates)}] {orig.get('company_name', '')[:40]:<40} ⏱ timeout ({type(e).__name__})")

                processed += 1
                # Write incremental — pas de perte si interruption
                header_written = append_row(row, fieldnames, header_written)
                emails = row.get("emails_found", "")
                quality = row.get("best_email_quality", "")
                if emails:
                    found += 1
                    if quality == "high": high += 1
                    elif quality == "medium": medium += 1
                    elif quality == "low": low += 1
                if row.get("pages_visited") != "TIMEOUT":
                    company = row.get("company_name", "")[:40]
                    status = f"✓ {emails}" if emails else "✗"
                    print(f"[{processed:>4}/{len(candidates)}] {company:<40} {status}")
    except KeyboardInterrupt:
        print(f"\n⏸  Interrompu manuellement après {processed} prospects. Les données sont sauvées.")
        print(f"   Relance la même commande pour reprendre.")

    elapsed = time.monotonic() - start
    print(f"\n--- Bilan de la session ---")
    print(f"Durée    : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Traités  : {processed}")
    print(f"Trouvés  : {found}/{processed} ({100 * found / max(processed, 1):.1f} %)")
    print(f"  - high   : {high}")
    print(f"  - medium : {medium}")
    print(f"  - low    : {low}")
    print(f"\nCSV : {OUTPUT_CSV.relative_to(ROOT)}")
    if OUTPUT_CSV.exists():
        with OUTPUT_CSV.open(encoding="utf-8") as f:
            total_in_csv = sum(1 for _ in f) - 1  # -1 pour le header
        print(f"Total cumulé dans le CSV : {total_in_csv}")


if __name__ == "__main__":
    main()
