#!/usr/bin/env python3
"""
Citeable SDR Agent
==================
Pipeline outbound automatisé, basé sur le moteur d'audit Citeable comme
couche de personnalisation (notre "Clay" maison).

Étapes :
  1. Sourcing   : lit une liste de prospects (CSV: brand,website[,email,first_name])
                  ou utilise la SEED_LIST intégrée.
  2. Signal     : lance l'audit Citeable (tier Monitor, 12 questions d'achat)
                  pour chaque marque et récupère score / reco / concurrent cité / gap.
  3. Filtrage   : ne garde que les "hooks" (mauvais score + concurrent nommé).
  4. Rédaction  : génère un email perso par prospect (finding réel + lien rapport).
  5. Sortie     : sdr_output.csv (import Smartlead/Instantly) + sdr_review.md.

⚠️  CE SCRIPT N'ENVOIE AUCUN EMAIL. Il produit des drafts à relire/envoyer par un humain
    ou un outil d'envoi (domaine warmé séparé, jamais le domaine principal).

Usage :
    python3 sdr_agent.py                     # utilise la SEED_LIST
    python3 sdr_agent.py prospects.csv       # CSV: brand,website[,email,first_name]
    python3 sdr_agent.py prospects.csv --max 50 --threshold 75
"""

import csv
import json
import os
import sys
import time
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime

API_BASE = "https://getciteable.nanocorp.app"
AUDIT_TIER = "monitor_9eur"          # 12 questions d'achat -> findings riches
DEFAULT_THRESHOLD = 75               # score < seuil => douleur exploitable
POLL_TIMEOUT = 150                   # secondes max d'attente par audit
POLL_INTERVAL = 8
UA = "Mozilla/5.0 (CiteableSDR/1.0)"

# Liste de départ (marques DTC moyennes). Remplaçable par un CSV.
SEED_LIST = [
    ("Bubble Skincare", "https://bubbleskincare.com"),
    ("Topicals", "https://topicals.com"),
    ("Cuts Clothing", "https://cutsclothing.com"),
    ("Cometeer", "https://cometeer.com"),
    ("Ollie", "https://myollie.com"),
    ("Moon Juice", "https://moonjuice.com"),
    ("Our Place", "https://fromourplace.com"),
]


def _post(path, payload):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _get(path):
    req = urllib.request.Request(f"{API_BASE}{path}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def start_audit(brand, website, idx):
    payload = {
        "email": f"sdr-{idx}-{int(time.time())}@example.org",
        "brand_name": brand,
        "website_url": website,
        "locale": "en",
        "audit_tier": AUDIT_TIER,
    }
    data = _post("/api/capture-email", payload)
    return data.get("audit_id")


def poll_audit(audit_id):
    waited = 0
    while waited < POLL_TIMEOUT:
        data = _get(f"/api/audit-status?audit_id={audit_id}")
        if data.get("status") == "completed":
            return data
        time.sleep(POLL_INTERVAL)
        waited += POLL_INTERVAL
    return None


def analyze(brand, website, audit_id, data):
    """Extrait le finding exploitable d'un audit terminé."""
    prompts = data.get("buyer_intent_prompts") or []
    checked = [
        p for p in prompts
        if any(s.get("kind") == "ai_engine" and s.get("status") == "checked"
               for s in (p.get("surfaces") or []))
    ]
    mentioned = sum(1 for p in checked if p.get("brandMentioned"))
    comp = Counter()
    for p in checked:
        for c in (p.get("competitors") or []):
            comp[c] += 1
    top = [c for c, _ in comp.most_common(3)]
    gap = next((p.get("prompt") for p in checked if not p.get("brandMentioned")), None)
    return {
        "brand": brand,
        "website": website,
        "audit_id": audit_id,
        "report_url": f"{API_BASE}/audit/{audit_id}",
        "score": data.get("score"),
        "category": data.get("category"),
        "recommended": mentioned,
        "checked": len(checked),
        "competitors": top,
        "gap_prompt": gap,
    }


def _norm(s):
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


def qualify(f, threshold=DEFAULT_THRESHOLD):
    """Qualifie un prospect + QA anti-bruit. Retourne {hook: bool, reason: str}.
    Hook = concurrent nommé + IA recommande < 75% des questions + score < seuil,
    ET le concurrent n'est pas la marque elle-même (auto-cite = bruit)."""
    if f.get("score") is None:
        return {"hook": False, "reason": "audit incomplet"}
    if not f.get("competitors"):
        return {"hook": False, "reason": "aucun concurrent cité"}
    if not f.get("checked"):
        return {"hook": False, "reason": "aucune question d'achat vérifiée"}
    brand_n = _norm(f.get("brand"))
    if brand_n and _norm(f["competitors"][0]) == brand_n:
        return {"hook": False, "reason": "auto-cite (concurrent = la marque) — bruit"}
    ratio = f["recommended"] / f["checked"]
    if ratio >= 0.75:
        return {"hook": False, "reason": f"recommandé {f['recommended']}/{f['checked']} (>=75%, pas de douleur)"}
    if f["score"] >= threshold:
        return {"hook": False, "reason": f"score {f['score']} >= {threshold}"}
    return {"hook": True, "reason": f"recommandé {f['recommended']}/{f['checked']}, {f['competitors'][0]} cité à sa place"}


def is_hook(f, threshold):
    return qualify(f, threshold)["hook"]


def clean_category(cat):
    if not cat or "your type of business" in cat:
        return "your category"
    return cat


def draft_email(f, first_name=""):
    name = first_name.strip() or "there"
    comp = f["competitors"][0] if f["competitors"] else "competitors"
    comp2 = ", ".join(f["competitors"][:2]) if f["competitors"] else "other brands"
    brand = f["brand"]
    subject = f"{comp}, not {brand}, on ChatGPT"
    # Pas de phrase de catégorie (l'inférence peut se tromper) : on ancre sur le
    # vrai signal vérifiable — concurrents nommés + score. Pas de placeholder de
    # signature ni de lien d'unsubscribe : Instantly les injecte (compte + footer).
    body = (
        f"Hi {name},\n\n"
        f"I ran the buyer questions shoppers ask AI before purchasing — ChatGPT and "
        f"Gemini recommended {comp2}, not {brand}. Across 12 of those questions, "
        f"AI names {brand} only {f['recommended']}/{f['checked']}.\n\n"
        f"More shoppers ask AI before buying (and soon agents will buy for them). "
        f"When AI doesn't name you, no ad budget wins that sale.\n\n"
        f"Here's your full AI-visibility report (free, 30s): {f['report_url']}\n\n"
        f"If useful, Citeable writes the copy-paste fixes to climb. Want me to show one?"
    )
    return subject, body


def load_prospects(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            rows.append({
                "brand": (r.get("brand") or r.get("name") or "").strip(),
                "website": (r.get("website") or r.get("url") or "").strip(),
                "email": (r.get("email") or "").strip(),
                "first_name": (r.get("first_name") or "").strip(),
            })
    return [r for r in rows if r["brand"] and r["website"]]


def write_outputs(findings, out_dir, threshold):
    """Écrit sdr_output.csv (import-ready) + sdr_review.md dans out_dir."""
    hooks = sorted([f for f in findings if is_hook(f, threshold)], key=lambda x: x["score"])
    csv_path = os.path.join(out_dir, "sdr_output.csv")
    md_path = os.path.join(out_dir, "sdr_review.md")

    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["email", "first_name", "company", "website", "score",
                    "recommended", "top_competitor", "report_url", "subject", "body"])
        for f in hooks:
            subject, body = draft_email(f, f.get("first_name", ""))
            w.writerow([f.get("email", ""), f.get("first_name", ""), f["brand"],
                        f["website"], f["score"], f"{f['recommended']}/{f['checked']}",
                        (f["competitors"][0] if f["competitors"] else ""),
                        f["report_url"], subject, body])

    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(f"# SDR run — {datetime.now():%Y-%m-%d %H:%M}\n\n")
        fh.write(f"{len(hooks)} prospects avec hook (sur {len(findings)} audités). "
                 f"**Rien n'a été envoyé.**\n\n")
        fh.write("| Marque | Score | Reco | Concurrent | Rapport |\n|---|---|---|---|---|\n")
        for f in hooks:
            fh.write(f"| {f['brand']} | {f['score']} | {f['recommended']}/{f['checked']} | "
                     f"{(f['competitors'][0] if f['competitors'] else '—')} | {f['report_url']} |\n")
        fh.write("\n---\n\n## Drafts\n\n")
        for f in hooks:
            subject, body = draft_email(f, f.get("first_name", ""))
            fh.write(f"### {f['brand']} (score {f['score']})\n\n**Subject:** {subject}\n\n{body}\n\n---\n\n")

    print(f"[SDR] {len(hooks)}/{len(findings)} hooks. Écrit : {csv_path} + {md_path}")
    print("[SDR] ⚠️  Aucun email envoyé.")
    return hooks


def run_post(csv_path, state_path, max_n):
    """Phase 1 : POST les audits (rapide), écrit l'état {brand,website,audit_id}."""
    if csv_path:
        prospects = load_prospects(csv_path)
    else:
        prospects = [{"brand": b, "website": w, "email": "", "first_name": ""} for b, w in SEED_LIST]
    prospects = prospects[:max_n]
    state = []
    for idx, p in enumerate(prospects, 1):
        try:
            aid = start_audit(p["brand"], p["website"], idx)
            if aid:
                state.append({**p, "audit_id": aid})
                print(f"[SDR] posted {p['brand']} -> {aid}")
        except Exception as e:
            print(f"[SDR] ! {p['brand']}: {e}")
        time.sleep(1.2)
    with open(state_path, "w", encoding="utf-8") as fh:
        json.dump(state, fh)
    print(f"[SDR] {len(state)} audits lancés. État: {state_path}. Attends ~2min puis --collect.")


def run_collect(state_path, out_dir, threshold):
    """Phase 2 : récupère les findings des audits de l'état, écrit les sorties."""
    state = json.load(open(state_path, encoding="utf-8"))
    findings = []
    for p in state:
        try:
            data = _get(f"/api/audit-status?audit_id={p['audit_id']}")
            if data.get("status") != "completed":
                print(f"[SDR] ~ {p['brand']} pas encore prêt"); continue
            f = analyze(p["brand"], p["website"], p["audit_id"], data)
            f["email"] = p.get("email", "")
            f["first_name"] = p.get("first_name", "")
            findings.append(f)
        except Exception as e:
            print(f"[SDR] ! {p['brand']}: {e}")
    write_outputs(findings, out_dir, threshold)


def main():
    args = sys.argv[1:]
    threshold = DEFAULT_THRESHOLD
    max_n = 50
    csv_path = None
    state_path = "/tmp/sdr_state.json"
    out_dir = "."
    mode = "sync"
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--threshold": threshold = int(args[i + 1]); i += 2
        elif a == "--max": max_n = int(args[i + 1]); i += 2
        elif a == "--state": state_path = args[i + 1]; i += 2
        elif a == "--out": out_dir = args[i + 1]; i += 2
        elif a == "--post": mode = "post"; i += 1
        elif a == "--collect": mode = "collect"; i += 1
        else: csv_path = a; i += 1

    if mode == "post":
        run_post(csv_path, state_path, max_n)
    elif mode == "collect":
        run_collect(state_path, out_dir, threshold)
    else:
        # mode synchrone (petits lots locaux) : POST + poll + sortie en un run
        if csv_path:
            prospects = load_prospects(csv_path)
        else:
            prospects = [{"brand": b, "website": w, "email": "", "first_name": ""} for b, w in SEED_LIST]
        prospects = prospects[:max_n]
        findings = []
        for idx, p in enumerate(prospects, 1):
            print(f"[SDR] ({idx}/{len(prospects)}) audit {p['brand']} …", flush=True)
            try:
                aid = start_audit(p["brand"], p["website"], idx)
                data = poll_audit(aid) if aid else None
                if not data:
                    print("       ! timeout/erreur"); continue
                f = analyze(p["brand"], p["website"], aid, data)
                f["email"] = p["email"]; f["first_name"] = p["first_name"]
                findings.append(f)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f"       ! erreur: {e}")
            time.sleep(2)
        write_outputs(findings, out_dir, threshold)


if __name__ == "__main__":
    main()
