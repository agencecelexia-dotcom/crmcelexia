#!/usr/bin/env python3
"""
Étape 2b du pipeline LSA : récupération de la ville par reverse-geo
(lat/lng du maps_url → ville la plus proche dans la matrice).

Pré-requis : géocodage one-time des 195 villes de la matrice via Nominatim
             (cache dans data/cities-coords.json).

Pour chaque prospect dans lsa-02-quality.csv qui n'a pas city_matched :
  1. Extraire lat/lng depuis google_maps_url (regex !3d<lat>!4d<lng>)
  2. Trouver la ville la plus proche (Haversine sur centre-ville)
  3. Si distance < MAX_DIST_KM → assigner ville

Output : data/lsa-02b-geocoded.csv (city_matched rempli pour le max possible)
"""
from __future__ import annotations
import csv
import json
import math
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-02-quality.csv"
MATRIX_CSV = ROOT / "csv" / "matrice_villes_metiers - matrice_villes_metiers.csv (2).csv"
CITIES_CACHE = ROOT / "data" / "cities-coords.json"
OUT_CSV = ROOT / "data" / "lsa-02b-geocoded.csv"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "celexia-crm/1.0 (contact@celexia.fr)"

MAX_DIST_KM = 30  # distance max prospect ↔ centre-ville pour assigner

LATLNG_RE = re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance Haversine en km entre 2 points GPS."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlmb/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))


def extract_latlng(maps_url: str) -> tuple[float, float] | None:
    m = LATLNG_RE.search(maps_url or "")
    if not m:
        return None
    try:
        return float(m.group(1)), float(m.group(2))
    except ValueError:
        return None


def load_cities_from_matrix() -> list[str]:
    with MATRIX_CSV.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        return [row[0].strip() for row in reader if row and row[0].strip()]


def geocode_city(city: str) -> tuple[float, float] | None:
    """Appelle Nominatim pour récupérer (lat, lng) d'une ville française."""
    try:
        r = requests.get(
            NOMINATIM_URL,
            params={"q": f"{city}, France", "format": "json", "limit": 1, "countrycodes": "fr"},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if r.status_code != 200:
            return None
        results = r.json()
        if not results:
            return None
        return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"  ⚠ erreur géocodage {city}: {e}")
        return None


def get_cached_coords() -> dict[str, tuple[float, float]]:
    """Charge le cache JSON ou géocode toutes les villes si absent."""
    if CITIES_CACHE.exists():
        with CITIES_CACHE.open() as f:
            data = json.load(f)
        return {k: tuple(v) for k, v in data.items() if v}

    print("Cache absent → géocodage des 195 villes via Nominatim...")
    cities = load_cities_from_matrix()
    coords: dict[str, tuple[float, float] | None] = {}
    for i, city in enumerate(cities, 1):
        coords[city] = geocode_city(city)
        print(f"  [{i:3d}/{len(cities)}] {city:30s} → {coords[city]}")
        time.sleep(1.05)  # rate limit Nominatim : 1 req/s

    # Save cache (filtre les None)
    CITIES_CACHE.parent.mkdir(exist_ok=True)
    with CITIES_CACHE.open("w") as f:
        json.dump({k: list(v) if v else None for k, v in coords.items()}, f, indent=2)

    return {k: v for k, v in coords.items() if v}


def find_nearest_city(lat: float, lng: float, cities_coords: dict) -> tuple[str, float] | None:
    """Retourne (city_name, distance_km) de la ville la plus proche."""
    best: tuple[str, float] | None = None
    for city, (clat, clng) in cities_coords.items():
        d = haversine_km(lat, lng, clat, clng)
        if best is None or d < best[1]:
            best = (city, d)
    return best


def main() -> None:
    coords = get_cached_coords()
    print(f"\nVilles géocodées : {len(coords)}\n")

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects qualité")

    n_already_matched = 0
    n_geocoded = 0
    n_no_coords = 0
    n_too_far = 0

    for r in rows:
        if r.get("city_matched"):
            n_already_matched += 1
            r["city_match_method"] = "name"
            continue
        latlng = extract_latlng(r.get("google_maps_url", ""))
        if not latlng:
            n_no_coords += 1
            r["city_match_method"] = "no_gps"
            continue
        lat, lng = latlng
        nearest = find_nearest_city(lat, lng, coords)
        if not nearest:
            n_no_coords += 1
            continue
        city, dist = nearest
        if dist > MAX_DIST_KM:
            n_too_far += 1
            r["city_match_method"] = f"too_far_{int(dist)}km"
            continue
        r["city_matched"] = city
        r["city_match_method"] = f"gps_{int(dist)}km"
        n_geocoded += 1

    fieldnames = list(rows[0].keys())
    if "city_match_method" not in fieldnames:
        fieldnames.append("city_match_method")

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("=== GEOCODE FILL DONE ===")
    print(f"Déjà matché par nom    : {n_already_matched}")
    print(f"Récupéré par GPS       : {n_geocoded}")
    print(f"Hors zone (>{MAX_DIST_KM} km)  : {n_too_far}")
    print(f"Aucune coord GPS       : {n_no_coords}")
    total_matched = n_already_matched + n_geocoded
    print()
    print(f"Total avec ville : {total_matched}/{len(rows)} ({100*total_matched/max(len(rows),1):.0f}%)")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
