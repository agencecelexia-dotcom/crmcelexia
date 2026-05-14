#!/usr/bin/env python3
"""
Enrichissement complémentaire des villes manquantes pour les 238 leads sans ville_insee.

Stratégies en cascade :
1. Recherche INSEE par "{dirigeant_prenom} {dirigeant_nom}" (matching dirigeant)
2. Recherche INSEE par {company_name} sans contrainte géo
3. Fallback : indicatif téléphone fixe → département

Input  : data/prospects-dirigeants-clean.csv
Output : data/prospects-dirigeants-villes.csv
        (mêmes colonnes + zone_label calculé pour TOUS les leads)
"""
from __future__ import annotations
import csv
import re
import sys
import time
import requests
from pathlib import Path
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "prospects-dirigeants-clean.csv"
ORIG_CSV = ROOT / "data" / "prospects-non-contactes.csv"
OUT_CSV = ROOT / "data" / "prospects-dirigeants-villes.csv"

# Mapping indicatif fixe (4 premiers chiffres du tel français) → département
# Source : ARCEP plan de numérotation, partiel mais couvre les principaux ZNE
# Format : préfixe → code département
PHONE_TO_DEPT = {
    # 01 - IDF
    "0140": "75", "0141": "75", "0142": "75", "0143": "75", "0144": "75",
    "0145": "75", "0146": "75", "0147": "75", "0148": "75", "0149": "75",
    "0153": "75", "0155": "75", "0156": "75", "0158": "75", "0160": "77",
    "0161": "78", "0164": "77", "0169": "91",
    # 02 - Nord-Ouest
    "0231": "14", "0232": "76", "0233": "50", "0235": "76", "0236": "28",
    "0237": "28", "0238": "45", "0240": "44", "0241": "49", "0243": "72",
    "0244": "44", "0246": "37", "0247": "37", "0250": "85", "0251": "85",
    "0254": "41", "0255": "85", "0256": "85", "0257": "85", "0258": "85",
    "0259": "85", "0261": "27", "0263": "76", "0264": "27", "0265": "53",
    "0276": "60", "0278": "76", "0291": "29", "0292": "29", "0293": "29",
    "0296": "22", "0297": "56", "0298": "29", "0299": "35",
    # 03 - Nord-Est
    "0320": "59", "0321": "62", "0322": "80", "0323": "02", "0325": "10",
    "0326": "51", "0327": "59", "0328": "59", "0329": "55", "0344": "60",
    "0354": "54", "0355": "54", "0356": "67", "0357": "67", "0367": "67",
    "0368": "67", "0369": "67", "0370": "67", "0372": "57", "0381": "25",
    "0383": "54", "0384": "39", "0385": "71", "0386": "89", "0387": "57",
    "0388": "67", "0389": "68", "0390": "67", "0445": "63",
    # 04 - Sud-Est
    "0413": "13", "0426": "69", "0427": "69", "0428": "69", "0432": "84",
    "0437": "69", "0442": "13", "0444": "63", "0450": "74", "0466": "30",
    "0467": "34", "0468": "11", "0469": "30", "0472": "69", "0473": "63",
    "0474": "01", "0475": "26", "0476": "38", "0477": "42", "0478": "69",
    "0479": "73", "0480": "13", "0481": "13", "0482": "13", "0483": "83",
    "0484": "84", "0485": "13", "0486": "84", "0488": "13", "0489": "06",
    "0490": "84", "0491": "13", "0492": "06", "0493": "06", "0494": "83",
    "0495": "2A", "0496": "13", "0497": "06", "0498": "83", "0499": "34",
    # 05 - Sud-Ouest
    "0524": "33", "0532": "65", "0533": "33", "0534": "31", "0535": "33",
    "0540": "33", "0544": "12", "0545": "16", "0546": "17", "0547": "16",
    "0549": "86", "0553": "47", "0554": "16", "0555": "87", "0556": "33",
    "0557": "33", "0558": "40", "0559": "64", "0561": "31", "0562": "31",
    "0563": "82", "0564": "31", "0565": "12", "0567": "31", "0568": "11",
    "0569": "31", "0581": "33", "0582": "31", "0583": "33", "0585": "33",
    "0586": "31", "0587": "33", "0588": "47", "0590": "971", "0594": "973",
    "0595": "975", "0596": "972", "0597": "972", "0599": "971",
}


def detect_dept_from_phone(phone: str) -> str | None:
    """Retourne le code département FR depuis un téléphone fixe (4 premiers chiffres)."""
    if not phone:
        return None
    p = re.sub(r"[^\d]", "", phone)
    if len(p) < 4:
        return None
    # Mobile (06, 07) ou VoIP (09) = pas de signal géo
    if p.startswith(("06", "07", "08", "09")):
        return None
    return PHONE_TO_DEPT.get(p[:4])


# Code département → nom département (pour fallback "dans le département X")
DEPT_NAMES = {
    "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence",
    "05": "Hautes-Alpes", "06": "Alpes-Maritimes", "07": "Ardèche", "08": "Ardennes",
    "09": "Ariège", "10": "Aube", "11": "Aude", "12": "Aveyron", "13": "Bouches-du-Rhône",
    "14": "Calvados", "15": "Cantal", "16": "Charente", "17": "Charente-Maritime",
    "18": "Cher", "19": "Corrèze", "2A": "Corse-du-Sud", "2B": "Haute-Corse",
    "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse", "24": "Dordogne",
    "25": "Doubs", "26": "Drôme", "27": "Eure", "28": "Eure-et-Loir", "29": "Finistère",
    "30": "Gard", "31": "Haute-Garonne", "32": "Gers", "33": "Gironde", "34": "Hérault",
    "35": "Ille-et-Vilaine", "36": "Indre", "37": "Indre-et-Loire", "38": "Isère",
    "39": "Jura", "40": "Landes", "41": "Loir-et-Cher", "42": "Loire", "43": "Haute-Loire",
    "44": "Loire-Atlantique", "45": "Loiret", "46": "Lot", "47": "Lot-et-Garonne",
    "48": "Lozère", "49": "Maine-et-Loire", "50": "Manche", "51": "Marne",
    "52": "Haute-Marne", "53": "Mayenne", "54": "Meurthe-et-Moselle", "55": "Meuse",
    "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord", "60": "Oise",
    "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme",
    "64": "Pyrénées-Atlantiques", "65": "Hautes-Pyrénées", "66": "Pyrénées-Orientales",
    "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône", "70": "Haute-Saône",
    "71": "Saône-et-Loire", "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie",
    "75": "Paris", "76": "Seine-Maritime", "77": "Seine-et-Marne", "78": "Yvelines",
    "79": "Deux-Sèvres", "80": "Somme", "81": "Tarn", "82": "Tarn-et-Garonne",
    "83": "Var", "84": "Vaucluse", "85": "Vendée", "86": "Vienne", "87": "Haute-Vienne",
    "88": "Vosges", "89": "Yonne", "90": "Territoire de Belfort", "91": "Essonne",
    "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne",
    "95": "Val-d'Oise",
}


def title_case(s: str) -> str:
    """ROUBAIX → Roubaix, LA ROCHE-SUR-YON → La Roche-Sur-Yon."""
    if not s:
        return ""
    words = []
    for word in s.split():
        words.append("-".join(p.capitalize() for p in word.split("-")))
    return " ".join(words).strip()


def search_insee(query: str, session: requests.Session) -> dict | None:
    """Tente API recherche-entreprises. Retourne premier résultat ou None."""
    try:
        r = session.get(
            "https://recherche-entreprises.api.gouv.fr/search",
            params={"q": query, "page": 1, "per_page": 1},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        results = r.json().get("results", [])
        return results[0] if results else None
    except Exception:
        return None


def get_ville_from_lead(lead: dict, session: requests.Session) -> tuple[str, str]:
    """
    Retourne (ville_brute, source) avec source = 'existing' / 'insee_dirigeant' /
    'insee_company' / 'phone_dept' / 'none'.
    """
    # 1. Déjà présente
    if lead.get("ville_insee"):
        return (lead["ville_insee"], "existing")

    # 2. Recherche INSEE par dirigeant_full
    full = lead.get("dirigeant_full", "").strip()
    if full and len(full.split()) >= 2:
        res = search_insee(full, session)
        if res:
            ville = res.get("siege", {}).get("libelle_commune", "")
            if ville:
                return (ville, "insee_dirigeant")
        time.sleep(0.15)

    # 3. Recherche INSEE par company_name
    company = lead.get("company_name", "").strip()
    if company:
        # Nettoie suffixes descriptifs Google Maps
        for sep in (" - ", " | ", " / ", "/", "|", " ("):
            idx = company.find(sep)
            if idx > 0:
                company = company[:idx].strip()
                break
        if len(company) > 2:
            res = search_insee(company, session)
            if res:
                # Validation : si on a un dirigeant, vérifie qu'il matche
                if full and res.get("dirigeants"):
                    last_name_lead = full.split()[-1].lower()
                    for d in res["dirigeants"]:
                        if last_name_lead in (d.get("nom", "") or "").lower():
                            ville = res.get("siege", {}).get("libelle_commune", "")
                            if ville:
                                return (ville, "insee_company")
                # Sinon, accepte si le nom de société matche bien (validation faible)
                nom_res = (res.get("nom_complet") or "").lower()
                if company.lower()[:8] in nom_res:
                    ville = res.get("siege", {}).get("libelle_commune", "")
                    if ville:
                        return (ville, "insee_company")
        time.sleep(0.15)

    return ("", "none")


def compute_zone_label(ville_titled: str, dept_code: str | None) -> str:
    """Calcule le label injecté dans l'email selon ce qu'on a."""
    if ville_titled:
        return f"à {ville_titled}"
    if dept_code and dept_code in DEPT_NAMES:
        return f"dans le {DEPT_NAMES[dept_code]}"
    return "dans votre zone"


def enrich_one(lead_row: dict, orig: dict) -> dict:
    """Worker : ajoute ville + zone_label à une ligne."""
    session = requests.Session()
    ville_raw, source = get_ville_from_lead(lead_row, session)
    ville_titled = title_case(ville_raw)
    dept = detect_dept_from_phone(orig.get("phone", ""))

    out = dict(lead_row)
    out["ville_enrichie"] = ville_titled
    out["ville_source"] = source if ville_titled else ("phone_dept" if dept else "none")
    out["departement"] = dept or ""
    out["zone_label"] = compute_zone_label(ville_titled, dept)
    return out


def main() -> None:
    # Index original pour phones
    with ORIG_CSV.open(encoding="utf-8") as f:
        orig_index = {r["id"]: r for r in csv.DictReader(f)}

    with IN_CSV.open(encoding="utf-8") as f:
        leads = list(csv.DictReader(f))

    # Ne re-traiter QUE ceux qui ont un email (704 cibles Smartlead)
    target = [r for r in leads if r.get("best_email") and r.get("dirigeant_full")]
    print(f"Total leads à traiter : {len(target)}")
    n_with_existing = sum(1 for r in target if r.get("ville_insee"))
    print(f"  déjà avec ville INSEE : {n_with_existing}")
    print(f"  à enrichir            : {len(target) - n_with_existing}")
    print()

    enriched: list[dict] = []
    source_counter: Counter[str] = Counter()

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(enrich_one, r, orig_index.get(r["id"], {})): r for r in target}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                res = fut.result(timeout=15)
            except Exception as e:
                src = futures[fut]
                res = dict(src)
                res.update({"ville_enrichie": "", "ville_source": f"err:{type(e).__name__}",
                            "departement": "", "zone_label": "dans votre zone"})
            enriched.append(res)
            source_counter[res["ville_source"]] += 1
            if i % 50 == 0:
                print(f"  {i}/{len(target)} ...")

    # Stats
    elapsed = time.time() - t0
    print(f"\n=== Done in {elapsed:.0f}s ===")
    for src, c in source_counter.most_common():
        print(f"  {src:25s} : {c}")
    n_with_ville = sum(1 for r in enriched if r["ville_enrichie"])
    n_with_zone = sum(1 for r in enriched if r["zone_label"] != "dans votre zone")
    print()
    print(f"Ville utilisable          : {n_with_ville}/{len(enriched)} ({100*n_with_ville/len(enriched):.0f}%)")
    print(f"Zone label personnalisé   : {n_with_zone}/{len(enriched)} ({100*n_with_zone/len(enriched):.0f}%)")
    print(f"  → '{(n_with_zone-n_with_ville)}' ont 'dans le département X' (fallback phone)")

    # Préserve aussi les leads sans email pour cohérence du CSV de base
    enriched_ids = {r["id"] for r in enriched}
    for r in leads:
        if r["id"] not in enriched_ids:
            r2 = dict(r)
            r2.update({"ville_enrichie": "", "ville_source": "no_email", "departement": "", "zone_label": ""})
            enriched.append(r2)

    fieldnames = list(enriched[0].keys())
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(enriched)
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
