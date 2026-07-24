#!/usr/bin/env python3
"""Activation de la campagne 419e33c5 — GO EXPLICITE de Charles le 23/07/2026
(session principale, après vérification complète de l'état : 3 leads lot 1,
boîte unique freegetpick, template sans signature).

Usage : source keys.env puis python3 instantly_activate_2026-07-23.py
"""
import json, os, sys, urllib.request

KEY = os.environ.get("INSTANTLY_API_KEY", "")
if len(KEY) < 20:
    print("ERREUR: clé absente"); sys.exit(1)
TARGET = "419e33c5-f930-4b13-aee8-83b2395c19a1"


def api(method, path, payload=None):
    hdrs = {"Authorization": f"Bearer {KEY}", "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
    if payload is not None:
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(f"https://api.instantly.ai{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            b = r.read().decode()
            return r.status, (json.loads(b) if b.strip() else {})
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:300]}


# Garde-fou : état attendu avant activation.
st, c = api("GET", f"/api/v2/campaigns/{TARGET}")
assert st == 200, f"GET campagne: HTTP {st}"
assert c.get("email_list") == ["charles@freegetpick.com"], f"boîtes inattendues: {c.get('email_list')}"
st, leads = api("POST", "/api/v2/leads/list", {"campaign": TARGET, "limit": 100})
emails = sorted((l.get("email") or "").lower() for l in leads.get("items") or [])
assert emails == ["amandine.decorte@lemahieu.com", "dbrion@soeur.fr", "vmordant@ekyog.com"], \
    f"leads inattendus: {emails}"

if c.get("status") == 1:
    print("déjà active — rien à faire")
else:
    st, r = api("POST", f"/api/v2/campaigns/{TARGET}/activate", {})
    print("activate:", st, r if st not in (200, 204) else "OK")
    assert st in (200, 204), "activation échouée"

st, c2 = api("GET", f"/api/v2/campaigns/{TARGET}")
print("--- VERIFICATION ---")
print("status (attendu 1=active):", c2.get("status"))
print("email_list:", c2.get("email_list"))
print("leads:", emails)
