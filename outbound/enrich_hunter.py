#!/usr/bin/env python3
"""
Citeable SDR — Enrichissement emails (Hunter.io)
================================================
Pour chaque marque (brand, website), interroge Hunter.io (domain-search),
choisit le meilleur contact décideur (rôle + score de confiance) et remplit
les colonnes email / first_name. Sortie prête pour le pipeline SDR.

Pourquoi Hunter : emails VÉRIFIÉS avec score de confiance -> peu de bounces.
Les bounces tuent la réputation d'envoi ; on ne devine JAMAIS un email.

⚠️  Clé API : variable d'environnement HUNTER_API_KEY (jamais dans le code,
    jamais vue par l'agent). Provider interchangeable (Apollo/Findymail = swap
    de la fonction lookup()).

Usage :
  export HUNTER_API_KEY="ta_cle"
  python3 enrich_hunter.py                         # sdr_prospects.csv -> sdr_prospects_enriched.csv
  python3 enrich_hunter.py sdr_output.csv --out sdr_output_enriched.csv
  python3 enrich_hunter.py --min-confidence 80 --limit 50
"""

import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HUNTER_URL = "https://api.hunter.io/v2/domain-search"
DEFAULT_MIN_CONFIDENCE = 70
# Rôles décideurs prioritaires (ordre = priorité)
DECISION_ROLES = [
    "founder", "co-founder", "cofounder", "ceo", "owner", "president",
    "cmo", "chief marketing", "head of growth", "head of marketing",
    "vp marketing", "growth", "marketing", "ecommerce", "e-commerce", "brand",
]


def domain_of(website):
    w = (website or "").strip()
    if "//" in w:
        w = w.split("//", 1)[1]
    return w.split("/", 1)[0].replace("www.", "").lower()


def role_rank(position):
    p = (position or "").lower()
    for i, role in enumerate(DECISION_ROLES):
        if role in p:
            return i
    return len(DECISION_ROLES) + 1  # non-décideur -> dernier


def lookup(domain, api_key):
    """Retourne la liste des contacts Hunter pour un domaine."""
    # Plan Hunter gratuit : max 10 résultats par domain-search (au-delà -> HTTP 400).
    qs = urllib.parse.urlencode({"domain": domain, "api_key": api_key, "limit": 10})
    req = urllib.request.Request(f"{HUNTER_URL}?{qs}", headers={"User-Agent": "CiteableSDR/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except urllib.error.HTTPError as he:
        # Hunter renvoie un JSON {"errors":[{"details": "..."}]} — on l'affiche.
        body = he.read().decode("utf-8", "replace")
        detail = body
        try:
            j = json.loads(body)
            errs = j.get("errors") or []
            if errs:
                detail = "; ".join(e.get("details", "") for e in errs)
        except Exception:
            pass
        raise RuntimeError(f"HTTP {he.code} — {detail}") from None
    return (data.get("data") or {}).get("emails") or []


def pick_best(emails, min_confidence):
    """Choisit le meilleur contact : décideur d'abord, puis confiance la plus haute.
    Ignore les emails 'generic' (info@, contact@) et sous le seuil de confiance."""
    candidates = []
    for e in emails:
        if e.get("type") == "generic":
            continue
        conf = e.get("confidence") or 0
        if conf < min_confidence:
            continue
        candidates.append(e)
    if not candidates:
        return None
    candidates.sort(key=lambda e: (role_rank(e.get("position")), -(e.get("confidence") or 0)))
    return candidates[0]


def main():
    args = sys.argv[1:]
    in_path = "sdr_prospects.csv"
    out_path = None
    min_conf = DEFAULT_MIN_CONFIDENCE
    limit = 200
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--out": out_path = args[i + 1]; i += 2
        elif a == "--min-confidence": min_conf = int(args[i + 1]); i += 2
        elif a == "--limit": limit = int(args[i + 1]); i += 2
        else: in_path = a; i += 1
    if not out_path:
        base = os.path.splitext(in_path)[0]
        out_path = f"{base}_enriched.csv"

    api_key = os.environ.get("HUNTER_API_KEY", "")
    if not api_key:
        print("ERREUR : HUNTER_API_KEY absent de l'environnement.")
        print("  export HUNTER_API_KEY=\"ta_cle\"   (Settings -> API dans Hunter)")
        sys.exit(1)

    with open(in_path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    fieldnames = rows[0].keys() if rows else ["brand", "website", "email", "first_name"]
    fieldnames = list(dict.fromkeys(list(fieldnames) + ["email", "first_name"]))

    found, skipped = 0, 0
    for idx, row in enumerate(rows[:limit], 1):
        if (row.get("email") or "").strip():
            continue  # déjà enrichi
        domain = domain_of(row.get("website") or row.get("url"))
        if not domain:
            skipped += 1; continue
        try:
            emails = lookup(domain, api_key)
        except Exception as e:
            print(f"[enrich] ! {row.get('brand','?')} ({domain}): {e}"); skipped += 1; continue
        best = pick_best(emails, min_conf)
        if not best:
            print(f"[enrich] - {row.get('brand','?')} ({domain}): aucun contact fiable (>= {min_conf})")
            skipped += 1
        else:
            row["email"] = best.get("value", "")
            row["first_name"] = best.get("first_name", "") or ""
            found += 1
            print(f"[enrich] ✓ {row.get('brand','?')}: {row['first_name']} <{row['email']}> "
                  f"({best.get('position','?')}, conf {best.get('confidence')})")
        time.sleep(1)  # respecte le rate limit Hunter

    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})

    print(f"[enrich] {found} enrichis, {skipped} sans contact fiable. Écrit : {out_path}")
    print("[enrich] Relis avant d'envoyer. Emails vérifiés uniquement (protège la délivrabilité).")


if __name__ == "__main__":
    main()
