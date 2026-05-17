#!/usr/bin/env python3
"""
Sync Smartlead → CRM Celexia (Supabase).

Pour chaque campagne Smartlead, récupère tous les leads + leur status
(envoyé / ouvert / répondu / bounce / unsubscribed) et met à jour les
prospects DB correspondants (match par email puis par téléphone).

Custom fields injectés dans prospects.custom_fields :
  - smartlead_campaign_id      : id de la campagne
  - smartlead_status           : 'sent'/'opened'/'replied'/'bounced'/'unsubscribed'
  - smartlead_last_sent_at     : ISO datetime du 1er envoi
  - smartlead_open_count       : nb d'ouvertures
  - smartlead_reply_count      : nb de réponses

Usage :
    python3 scripts/sync_smartlead_to_crm.py            # toutes les campagnes
    python3 scripts/sync_smartlead_to_crm.py --campaign 3338241  # une seule
"""
from __future__ import annotations
import argparse
import os
import re
import sys
import time
from pathlib import Path

import requests
from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://server.smartlead.ai/api/v1"


def load_env() -> dict:
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMARTLEAD_API_KEY"):
            out[k] = v.strip()
    if not all(k in out for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMARTLEAD_API_KEY")):
        print("ERREUR : variables .env manquantes", file=sys.stderr)
        sys.exit(1)
    return out


def normalize_phone(raw: str) -> str:
    if not raw:
        return ""
    d = re.sub(r"[^\d]", "", raw)
    if d.startswith("33") and len(d) == 11:
        d = "0" + d[2:]
    if len(d) == 10 and d.startswith("0"):
        return d
    return d


def get_all_campaigns(api_key: str) -> list[dict]:
    r = requests.get(f"{API_BASE}/campaigns", params={"api_key": api_key}, timeout=15)
    if r.status_code != 200:
        print(f"⚠ list campaigns: {r.status_code} {r.text[:200]}")
        return []
    return r.json() if isinstance(r.json(), list) else []


def get_campaign_leads(api_key: str, campaign_id: int) -> list[dict]:
    """Récupère TOUS les leads (paginé)."""
    all_leads: list[dict] = []
    offset = 0
    limit = 100
    while True:
        r = requests.get(
            f"{API_BASE}/campaigns/{campaign_id}/leads",
            params={"api_key": api_key, "offset": offset, "limit": limit},
            timeout=20,
        )
        if r.status_code != 200:
            print(f"  ⚠ leads page {offset}: {r.status_code}")
            break
        body = r.json()
        leads = body.get("data", []) if isinstance(body, dict) else []
        if not leads:
            break
        all_leads.extend(leads)
        if len(leads) < limit:
            break
        offset += limit
        time.sleep(0.3)
    return all_leads


def get_lead_message_history(api_key: str, campaign_id: int, lead_id: int) -> list[dict]:
    """Récupère l'historique d'envois pour 1 lead (pour status précis)."""
    try:
        r = requests.get(
            f"{API_BASE}/campaigns/{campaign_id}/leads/{lead_id}/message-history",
            params={"api_key": api_key},
            timeout=10,
        )
        if r.status_code != 200:
            return []
        body = r.json()
        return body.get("history", []) if isinstance(body, dict) else []
    except Exception:
        return []


def derive_status(lead_obj: dict) -> tuple[str | None, str | None, int, int]:
    """Extrait (status, last_sent_at, open_count, reply_count) du lead Smartlead.

    IMPORTANT : Smartlead expose un champ `status` au niveau campaign_lead_map
    qui vaut "STARTED" pour les leads pas encore envoyés. Ne PAS conclure
    "sent" par défaut — l'envoi réel est tracké via webhook EMAIL_SENT.
    """
    inner = lead_obj.get("lead", {}) or lead_obj
    data = lead_obj.get("lead_campaign_data") or {}
    open_count = int(data.get("open_count", 0) or 0)
    reply_count = int(data.get("reply_count", 0) or 0)
    sent_count = int(data.get("sent_count", 0) or 0)
    sent_at = data.get("last_sent_at") or data.get("sent_at")
    is_replied = data.get("is_replied") or reply_count > 0
    is_bounced = data.get("is_bounced") or False
    is_unsubscribed = data.get("is_unsubscribed") or False
    is_opened = open_count > 0
    # Statut au niveau campagne (STARTED = pas envoyé)
    map_status = (lead_obj.get("status") or "").upper()

    if is_unsubscribed:
        return ("unsubscribed", sent_at, open_count, reply_count)
    if is_bounced:
        return ("bounced", sent_at, open_count, reply_count)
    if is_replied:
        return ("replied", sent_at, open_count, reply_count)
    if is_opened:
        return ("opened", sent_at, open_count, reply_count)
    if sent_count > 0 and map_status not in ("STARTED", "QUEUED", ""):
        return ("sent", sent_at, open_count, reply_count)
    # Pas encore envoyé → on ne renseigne aucun statut
    return (None, None, open_count, reply_count)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", type=int, default=None, help="ID campagne spécifique")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    api_key = env["SMARTLEAD_API_KEY"]

    if args.campaign:
        campaigns = [{"id": args.campaign, "name": f"Campaign {args.campaign}"}]
    else:
        campaigns = get_all_campaigns(api_key)
    print(f"Campagnes Smartlead : {len(campaigns)}")

    # Index DB par email + phone
    print("Fetching DB prospects (paginé)...")
    db_by_email: dict[str, dict] = {}
    db_by_phone: dict[str, dict] = {}
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, contact_email, phone, custom_fields"
        ).is_("deleted_at", "null").range(offset, offset + 999).execute()
        batch = res.data or []
        for r in batch:
            if r.get("contact_email"):
                db_by_email[r["contact_email"].lower().strip()] = r
            ph = normalize_phone(r.get("phone", ""))
            if ph:
                db_by_phone[ph] = r
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"DB indexée : {len(db_by_email)} emails, {len(db_by_phone)} phones")
    print()

    total_updated = 0
    total_matched = 0
    total_unmatched = 0

    for c in campaigns:
        cid = c["id"]
        cname = c.get("name", "?")
        print(f"\n== Campagne {cid} : {cname[:60]} ==")
        leads = get_campaign_leads(api_key, cid)
        print(f"  Smartlead leads : {len(leads)}")

        updates: list[tuple[str, dict]] = []
        for lead_obj in leads:
            inner = lead_obj.get("lead", {}) or lead_obj
            sl_email = (inner.get("email") or "").lower().strip()
            sl_phone = normalize_phone(inner.get("phone_number", ""))

            db_row = db_by_email.get(sl_email) or db_by_phone.get(sl_phone)
            if not db_row:
                total_unmatched += 1
                continue
            total_matched += 1

            status, sent_at, opens, replies = derive_status(lead_obj)
            existing_cf = db_row.get("custom_fields") or {}
            new_cf = {**existing_cf, "smartlead_campaign_id": cid}
            # On n'écrit smartlead_status QUE si on a une vraie info d'envoi
            # (sinon le webhook le fera correctement au 1er event réel)
            if status is not None:
                new_cf["smartlead_status"] = status
                if sent_at:
                    new_cf["smartlead_last_sent_at"] = sent_at
                if opens > 0:
                    new_cf["smartlead_open_count"] = opens
                if replies > 0:
                    new_cf["smartlead_reply_count"] = replies
            updates.append((db_row["id"], new_cf))

        print(f"  Matchés en DB   : {len(updates)}")

        if args.dry_run:
            for db_id, cf in updates[:5]:
                print(f"  [dry] id={db_id[:8]} → status={cf['smartlead_status']}")
            continue

        for db_id, cf in updates:
            try:
                sb.table("prospects").update({"custom_fields": cf}).eq("id", db_id).execute()
                total_updated += 1
            except Exception as e:
                print(f"  ⚠ {db_id}: {e}")

    print("\n=== SYNC DONE ===")
    print(f"Matchés DB ↔ Smartlead : {total_matched}")
    print(f"Non matchés (Smartlead only) : {total_unmatched}")
    print(f"Updates DB effectués : {total_updated}")


if __name__ == "__main__":
    main()
