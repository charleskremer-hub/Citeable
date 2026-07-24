#!/usr/bin/env python3
"""Lecture seule : état de la campagne 419e33c5 (statut, boîtes, leads, stats).
Usage : source keys.env puis python3 instantly_status_check.py
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


st, c = api("GET", f"/api/v2/campaigns/{TARGET}")
print("status (1=active, 0=pause):", c.get("status"))
print("email_list:", c.get("email_list"))
st, leads = api("POST", "/api/v2/leads/list", {"campaign": TARGET, "limit": 100})
for l in leads.get("items") or []:
    print("lead:", l.get("email"), "| status:", l.get("status"),
          "| contacté:", l.get("email_open_count") is not None)
st, an = api("GET", f"/api/v2/campaigns/analytics?id={TARGET}")
if st == 200:
    row = an[0] if isinstance(an, list) and an else an
    if isinstance(row, dict):
        print("analytics:", {k: row.get(k) for k in
              ("leads_count", "contacted_count", "emails_sent_count",
               "open_count", "reply_count", "link_click_count") if k in row})
else:
    print("analytics indisponibles:", st)
