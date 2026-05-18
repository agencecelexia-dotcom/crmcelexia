#!/usr/bin/env python3
"""
Étape 13 — Réactive la campagne Smartlead 3338241 après le nettoyage strict.

Vérifie d'abord le state actuel, puis envoie un PATCH pour passer en ACTIVE.
"""
from __future__ import annotations
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_ID = 3338241


def load_api_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("SMARTLEAD_API_KEY="):
            return line.split("=", 1)[1].strip()
    print("ERREUR : SMARTLEAD_API_KEY introuvable", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    api_key = load_api_key()

    # 1. État actuel
    r = requests.get(f"{API_BASE}/campaigns/{CAMPAIGN_ID}", params={"api_key": api_key}, timeout=15)
    if r.status_code == 200:
        data = r.json()
        print(f"État actuel : {data.get('status', '?')} — {data.get('name', '?')}")

    # 2. Resume via POST /campaigns/{id}/status
    r = requests.post(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/status",
        params={"api_key": api_key},
        json={"status": "START"},
        timeout=15,
    )
    print(f"\n→ Resume campagne : {r.status_code}")
    print(f"  Response : {r.text[:300]}")

    # 3. Vérification
    r = requests.get(f"{API_BASE}/campaigns/{CAMPAIGN_ID}", params={"api_key": api_key}, timeout=15)
    if r.status_code == 200:
        data = r.json()
        print(f"\nÉtat final : {data.get('status', '?')}")
        print(f"Dashboard : https://app.smartlead.ai/app/email-campaign/{CAMPAIGN_ID}/analytics")


if __name__ == "__main__":
    main()
