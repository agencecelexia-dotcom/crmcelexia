#!/usr/bin/env python3
"""
SAFETY CHECK — Pause dans Smartlead tous les prospects qui ont répondu
mais qui ne sont pas encore pausés (= continuent à recevoir des emails).

Causes possibles du gap :
  - Le webhook historique ne pausait pas auto sur EMAIL_REPLY (fixé maintenant)
  - Webhook qui a échoué (timeout, erreur API)
  - Reply enregistré avant la mise en place de l'auto-pause

Stratégie :
  1. Liste les prospects où custom_fields.smartlead_status = 'replied' OU
     'unsubscribed' OU smartlead_reply_count > 0, ET smartlead_paused_at IS NULL
  2. Pour chacun, cherche le lead dans toutes les campagnes Smartlead
  3. Le pause via l'API
  4. Met à jour custom_fields.smartlead_paused_at + reason

Usage : python3 scripts/safety_pause_replied_leads.py [--dry-run]
Pré-requis : .env contient VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMARTLEAD_API_KEY
"""
from __future__ import annotations
import json
import re
import sys
import time
from pathlib import Path

import requests
from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://server.smartlead.ai/api/v1"
DRY_RUN = "--dry-run" in sys.argv


def load_env() -> dict:
    out = {}
    env_path = ROOT / ".env"
    if not env_path.exists():
        print(f"ERREUR : {env_path} introuvable", file=sys.stderr)
        sys.exit(1)
    for line in env_path.read_text().splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMARTLEAD_API_KEY"):
            out[k] = v.strip()
    missing = [k for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMARTLEAD_API_KEY") if k not in out]
    if missing:
        print(f"ERREUR : variables manquantes dans .env : {missing}", file=sys.stderr)
        sys.exit(1)
    return out


def normalize_phone(raw: str | None) -> str:
    if not raw:
        return ""
    d = re.sub(r"[^\d]", "", raw)
    if d.startswith("33") and len(d) == 11:
        return "0" + d[2:]
    if len(d) == 10 and d.startswith("0"):
        return d
    if len(d) == 9:
        return "0" + d
    return d


def list_campaigns(api_key: str) -> list[dict]:
    r = requests.get(f"{API_BASE}/campaigns", params={"api_key": api_key}, timeout=20)
    r.raise_for_status()
    return r.json() or []


def fetch_campaign_leads(api_key: str, campaign_id: int) -> list[dict]:
    leads = []
    offset = 0
    while True:
        r = requests.get(
            f"{API_BASE}/campaigns/{campaign_id}/leads",
            params={"api_key": api_key, "offset": offset, "limit": 100},
            timeout=30,
        )
        if r.status_code != 200:
            print(f"    ⚠ offset {offset}: {r.status_code}")
            break
        batch = (r.json() or {}).get("data", [])
        if not batch:
            break
        leads.extend(batch)
        if len(batch) < 100:
            break
        offset += 100
        time.sleep(0.2)
    return leads


def pause_lead(api_key: str, campaign_id: int, lead_id: int) -> tuple[bool, str]:
    r = requests.post(
        f"{API_BASE}/campaigns/{campaign_id}/leads/{lead_id}/pause",
        params={"api_key": api_key},
        json={},
        timeout=15,
    )
    return r.status_code == 200, r.text[:200]


def main() -> None:
    env = load_env()
    api_key = env["SMARTLEAD_API_KEY"]
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    mode = "[DRY RUN]" if DRY_RUN else "[LIVE]"
    print(f"=== SAFETY PAUSE REPLIED LEADS {mode} ===\n")

    # 1. Récupère TOUTES les campagnes Smartlead (multi-campagnes safe)
    print("→ Liste des campagnes Smartlead...")
    campaigns = list_campaigns(api_key)
    print(f"  {len(campaigns)} campagne(s) trouvée(s)")
    for c in campaigns:
        print(f"    - [{c.get('id')}] {c.get('name')} (status: {c.get('status')})")

    # 2. Charge TOUS les leads de chaque campagne → index par email + phone
    print(f"\n→ Chargement de tous les leads des campagnes...")
    sl_by_email: dict[str, tuple[int, int, str]] = {}  # email -> (campaign_id, lead_id, sl_status)
    sl_by_phone: dict[str, tuple[int, int, str]] = {}
    for c in campaigns:
        cid = c.get("id")
        if not cid:
            continue
        leads = fetch_campaign_leads(api_key, cid)
        print(f"  Campagne {cid} : {len(leads)} leads")
        for ld in leads:
            lead = ld.get("lead", {}) or {}
            lead_id = lead.get("id")
            email = (lead.get("email") or "").lower().strip()
            phone = normalize_phone(lead.get("phone_number"))
            sl_status = ld.get("status") or ""
            if email and lead_id:
                sl_by_email[email] = (cid, lead_id, sl_status)
            if phone and lead_id:
                sl_by_phone[phone] = (cid, lead_id, sl_status)

    # 3. Récupère les prospects "replied" non pausés en DB
    print(f"\n→ Récupération des prospects 'replied' non pausés en DB...")
    # On charge un large lot et on filtre côté Python (JSONB)
    res = sb.table("prospects").select(
        "id, contact_email, phone, status, custom_fields, company_name, contact_firstname, contact_name"
    ).is_("deleted_at", "null").execute()
    all_prospects = res.data or []

    at_risk = []
    for p in all_prospects:
        cf = p.get("custom_fields") or {}
        sl_status = cf.get("smartlead_status")
        reply_count = cf.get("smartlead_reply_count") or 0
        already_paused = cf.get("smartlead_paused_at")
        # Critère : a répondu (replied/unsubscribed/reply_count>0) ET pas pausé
        if (sl_status in ("replied", "unsubscribed") or reply_count > 0) and not already_paused:
            at_risk.append(p)

    print(f"  {len(all_prospects)} prospects scannés")
    print(f"  ⚠ {len(at_risk)} prospects ONT RÉPONDU MAIS NE SONT PAS PAUSÉS\n")

    if not at_risk:
        print("✅ Tout est clean. Aucun lead à pauser.")
        return

    # 4. Détaille et pause
    print("=== DÉTAIL DES PROSPECTS À RISQUE ===\n")
    paused_ok = 0
    pause_failed = 0
    not_in_smartlead = 0
    log = []

    for p in at_risk:
        pid = p["id"]
        email = (p.get("contact_email") or "").lower().strip()
        phone = normalize_phone(p.get("phone"))
        name = " ".join(filter(None, [p.get("contact_firstname"), p.get("contact_name")])) or p.get("company_name") or "?"
        cf = p.get("custom_fields") or {}
        sl_status = cf.get("smartlead_status")
        reply_count = cf.get("smartlead_reply_count") or 0
        last_reply = cf.get("smartlead_last_reply_at") or "?"

        # Cherche dans Smartlead
        match = sl_by_email.get(email) or sl_by_phone.get(phone)
        if not match:
            print(f"  ◇ {name} ({email}) — replied count={reply_count}, status={sl_status}, last_reply={last_reply}")
            print(f"      → Pas trouvé dans Smartlead (déjà supprimé ?). Flag paused en DB.")
            if not DRY_RUN:
                sb.table("prospects").update({
                    "custom_fields": {
                        **cf,
                        "smartlead_paused_at": "2026-05-18T00:00:00Z",
                        "smartlead_pause_reason": "safety_backfill_not_in_smartlead",
                    }
                }).eq("id", pid).execute()
            not_in_smartlead += 1
            log.append({"prospect_id": pid, "name": name, "email": email, "action": "not_in_smartlead"})
            continue

        cid, lead_id, current_sl_status = match
        print(f"  🔥 {name} ({email}) — DB:replied count={reply_count}, SL:{current_sl_status}")
        print(f"      → Pause lead {lead_id} dans campagne {cid}...")

        if DRY_RUN:
            print(f"      [DRY RUN] Aurait pausé.")
            log.append({"prospect_id": pid, "name": name, "email": email, "lead_id": lead_id, "campaign_id": cid, "action": "would_pause"})
            continue

        ok, body = pause_lead(api_key, cid, lead_id)
        if ok:
            sb.table("prospects").update({
                "custom_fields": {
                    **cf,
                    "smartlead_paused_at": "2026-05-18T00:00:00Z",
                    "smartlead_pause_reason": "safety_backfill_replied_not_paused",
                    "smartlead_paused_lead_id": lead_id,
                    "smartlead_paused_campaign_id": cid,
                }
            }).eq("id", pid).execute()
            paused_ok += 1
            print(f"      ✅ Pausé.")
            log.append({"prospect_id": pid, "name": name, "email": email, "lead_id": lead_id, "campaign_id": cid, "action": "paused"})
        else:
            pause_failed += 1
            print(f"      ❌ Échec : {body}")
            log.append({"prospect_id": pid, "name": name, "email": email, "lead_id": lead_id, "campaign_id": cid, "action": "failed", "error": body})
        time.sleep(0.1)

    # Résumé
    print(f"\n=== RÉSUMÉ ===")
    print(f"À risque détectés     : {len(at_risk)}")
    print(f"Pausés OK              : {paused_ok}")
    print(f"Échecs pause           : {pause_failed}")
    print(f"Plus dans Smartlead    : {not_in_smartlead}")

    # Save log
    log_path = ROOT / "data" / "safety-pause-log.json"
    log_path.parent.mkdir(exist_ok=True)
    with log_path.open("w", encoding="utf-8") as f:
        json.dump({"dry_run": DRY_RUN, "timestamp": "2026-05-18", "log": log}, f, indent=2, ensure_ascii=False)
    print(f"\nLog : {log_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
