#!/usr/bin/env python3
"""
Configure le webhook Smartlead → Edge Function Supabase pour TOUTES les
campagnes du compte (ou une seule via --campaign).

À relancer chaque fois qu'on crée une nouvelle campagne Smartlead.
"""
from __future__ import annotations
import argparse
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://server.smartlead.ai/api/v1"
WEBHOOK_URL = "https://zsbrhftzjqqqbwbboyqe.supabase.co/functions/v1/smartlead-webhook"
EVENT_TYPES = ["EMAIL_SENT", "EMAIL_OPEN", "EMAIL_REPLY", "EMAIL_BOUNCE"]
CATEGORIES = [
    "Interested", "Meeting Request", "Not Interested", "Do Not Contact",
    "Information Request", "Out Of Office", "Wrong Person", "Sender Originated Bounce",
]


def load_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("SMARTLEAD_API_KEY="):
            return line.split("=", 1)[1].strip()
    print("ERREUR : SMARTLEAD_API_KEY introuvable", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", type=int, default=None, help="ID campagne (par défaut : toutes)")
    args = parser.parse_args()
    api_key = load_key()

    if args.campaign:
        campaigns = [{"id": args.campaign, "name": f"Campaign {args.campaign}"}]
    else:
        r = requests.get(f"{API_BASE}/campaigns", params={"api_key": api_key}, timeout=15)
        campaigns = r.json() if r.status_code == 200 else []
        print(f"Campagnes trouvées : {len(campaigns)}")

    for c in campaigns:
        cid = c["id"]
        # Liste les webhooks existants pour éviter doublons
        existing = requests.get(
            f"{API_BASE}/campaigns/{cid}/webhooks", params={"api_key": api_key}, timeout=15,
        ).json()
        already_configured = any(
            w.get("webhook_url") == WEBHOOK_URL for w in (existing if isinstance(existing, list) else [])
        )
        if already_configured:
            print(f"  Campagne {cid} ({c.get('name','?')[:40]}) : ✓ déjà configuré")
            continue

        r = requests.post(
            f"{API_BASE}/campaigns/{cid}/webhooks",
            params={"api_key": api_key},
            json={
                "name": "Celexia CRM",
                "webhook_url": WEBHOOK_URL,
                "event_types": EVENT_TYPES,
                "categories": CATEGORIES,
            },
            timeout=15,
        )
        status = "✓ créé" if r.status_code == 200 else f"✗ ERREUR {r.status_code}: {r.text[:80]}"
        print(f"  Campagne {cid} ({c.get('name','?')[:40]}) : {status}")


if __name__ == "__main__":
    main()
