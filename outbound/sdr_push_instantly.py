#!/usr/bin/env python3
"""
Citeable SDR — Push vers Instantly
==================================
Charge les prospects APPROUVÉS (sdr_output.csv) comme leads dans une campagne
Instantly, avec l'email perso baké par nous (subject + body en custom variables).

⚠️  GARDE-FOUS
  - La clé API reste CHEZ TOI : variable d'environnement INSTANTLY_API_KEY.
    Le script ne l'affiche jamais, ne l'écrit nulle part.
  - DRY-RUN par défaut : sans --push, il montre ce qu'il enverrait, sans appeler l'API.
  - Il AJOUTE des leads à la campagne, il NE L'ACTIVE PAS. C'est toi qui lances
    l'envoi dans Instantly (revue finale = ton garde-fou anti-spam).
  - Il n'envoie que les lignes avec un email non vide (et 'approved' vrai si la colonne existe).

Config campagne côté Instantly (une fois) :
  Séquence -> Subject = {{sdr_subject}}   Body = {{sdr_body}}
  (l'email est entièrement personnalisé par nous, Instantly ne fait que délivrer.)

Usage :
  export INSTANTLY_API_KEY="ta_cle"           # jamais dans le code
  python3 sdr_push_instantly.py --campaign <CAMPAIGN_ID>            # DRY-RUN
  python3 sdr_push_instantly.py --campaign <CAMPAIGN_ID> --push     # envoie à l'API
  python3 sdr_push_instantly.py sdr_output.csv --campaign <ID> --push
"""

import csv
import json
import os
import sys
import time
import urllib.request
import urllib.error

API_URL = "https://api.instantly.ai/api/v2/leads"   # create lead (v2)
APPROVED_TRUTHY = {"1", "true", "yes", "y", "x", "ok", "approved"}


def build_lead(row, campaign_id):
    """Construit le payload lead Instantly à partir d'une ligne sdr_output.csv."""
    cv = {
        "sdr_subject": row.get("subject", ""),
        "sdr_body": row.get("body", ""),
        "report_url": row.get("report_url", ""),
        "top_competitor": row.get("top_competitor", ""),
        "score": row.get("score", ""),
    }
    return {
        "campaign": campaign_id,           # UUID de la campagne Instantly
        "email": row.get("email", "").strip(),
        "first_name": row.get("first_name", "").strip(),
        "company_name": row.get("company", "").strip(),
        "custom_variables": cv,
    }


def post_lead(payload, api_key):
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # UA réaliste : sans lui, le WAF Cloudflare d'Instantly renvoie 1010.
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/126.0 Safari/537.36",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode()[:200]


def wants_send(row):
    email = (row.get("email") or "").strip()
    if not email:
        return False, "pas d'email (enrichir avant)"
    if "approved" in row and (row.get("approved") or "").strip().lower() not in APPROVED_TRUTHY:
        return False, "non approuvé"
    return True, ""


def main():
    args = sys.argv[1:]
    csv_path = "sdr_output.csv"
    campaign_id = os.environ.get("INSTANTLY_CAMPAIGN_ID", "")
    push = False
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--campaign":
            campaign_id = args[i + 1]; i += 2
        elif a == "--push":
            push = True; i += 1
        else:
            csv_path = a; i += 1

    if not campaign_id:
        print("ERREUR : --campaign <ID> requis (ou env INSTANTLY_CAMPAIGN_ID)."); sys.exit(1)

    api_key = os.environ.get("INSTANTLY_API_KEY", "")
    if push and not api_key:
        print("ERREUR : --push demandé mais INSTANTLY_API_KEY absent de l'environnement."); sys.exit(1)

    with open(csv_path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    to_send, skipped = [], []
    for row in rows:
        ok, reason = wants_send(row)
        (to_send if ok else skipped).append((row, reason))

    mode = "PUSH (envoi API)" if push else "DRY-RUN (aucun appel API)"
    print(f"[instantly] {mode} · campagne={campaign_id} · {len(to_send)} à charger, {len(skipped)} ignorés")
    for row, reason in skipped:
        print(f"   - ignoré {row.get('company','?')}: {reason}")

    pushed = 0
    for row, _ in to_send:
        payload = build_lead(row, campaign_id)
        if not push:
            print(f"   ~ [dry-run] {payload['company_name']} <{payload['email']}> subj=\"{payload['custom_variables']['sdr_subject'][:50]}\"")
            continue
        try:
            status, body = post_lead(payload, api_key)
            pushed += 1
            print(f"   ✓ {payload['company_name']} <{payload['email']}> -> HTTP {status}")
        except urllib.error.HTTPError as e:
            print(f"   ! {payload['company_name']}: HTTP {e.code} {e.read().decode()[:160]}")
        except Exception as e:
            print(f"   ! {payload['company_name']}: {e}")
        time.sleep(0.5)

    if push:
        print(f"[instantly] {pushed} leads chargés dans la campagne.")
        print("[instantly] ⚠️  Rien n'est envoyé tant que TU n'actives pas la campagne dans Instantly.")
    else:
        print("[instantly] DRY-RUN terminé. Ajoute --push pour charger réellement (clé API requise).")


if __name__ == "__main__":
    main()
