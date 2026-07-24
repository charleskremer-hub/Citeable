#!/usr/bin/env python3
"""Application des décisions Charles (23/07) sur Instantly — À N'EXÉCUTER
QU'APRÈS GO DIRECT DE CHARLES DANS LA SESSION.

Actions, dans l'ordre :
  1. Retire les 10 leads US de la campagne 419e33c5 (match par email, re-listé au
     moment de l'exécution — pas d'ID périmé).
  2. Supprime le brouillon 802b9b61 (et ses 3 leads doublons).
  3. PATCH séquence 419e33c5 : body = {{sdr_body}} + ligne unsubscribe (la ligne
     {{unsubscribeLink}} est CONSERVÉE — délivrabilité/conformité ; seule la
     signature « Best, / Charles / GetPick — ... » est retirée).
  4. PATCH email_list = ["charles@freegetpick.com"] uniquement.
  5. Push des 3 leads lot 1 (Lemahieu, Ekyog, Soeur) depuis
     sdr_conversion_2026-07-22_enriched.csv avec sdr_subject/sdr_body.
  6. Vérification finale complète. N'ACTIVE JAMAIS la campagne.

Usage : source keys.env puis
  python3 instantly_apply_lot1.py --apply     (sans --apply : dry-run)
"""
import csv, json, os, sys, time, urllib.request, urllib.error

APPLY = "--apply" in sys.argv
KEY = os.environ.get("INSTANTLY_API_KEY", "")
if len(KEY) < 20:
    print("ERREUR: clé absente"); sys.exit(1)
HDRS = {
    "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json"}
TARGET = "419e33c5-f930-4b13-aee8-83b2395c19a1"
OLD = "802b9b61-b1ca-4fc6-9fb8-aefe90d2acf7"
US_EMAILS = {
    "ellen@hedleyandbennett.com", "randi@necessaire.com", "kevin@spotandtango.com",
    "ewesel@versedskin.com", "gina@tower28beauty.com", "michelle@arrae.com",
    "mmash@dagnedover.com", "kawa@youthtothepeople.com", "elise@birdies.com",
    "terri@thinkjinx.com"}
LOT1_CSV = "/Users/charles.kremer/Dev/Projects/getpick/outbound/sdr_conversion_2026-07-22_enriched.csv"
CLEAN_BODY = ('<div>{{sdr_body}}<br /><br /><span style="font-size:11px;color:#888">'
              'Not relevant? {{unsubscribeLink}}</span></div>')


def api(method, path, payload=None, ok=(200, 204)):
    hdrs = dict(HDRS)
    if payload is None:
        hdrs.pop("Content-Type", None)  # l'API rejette un Content-Type JSON sans body
    # GET/DELETE/PATCH sont idempotents ici : retry sur timeout. POST jamais retenté
    # (risque de doublon) — l'appelant vérifie l'existence avant.
    attempts = 3 if method != "POST" or path.endswith("/list") else 1
    last_err = None
    for i in range(attempts):
        req = urllib.request.Request(f"https://api.instantly.ai{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode()
                return r.status, (json.loads(body) if body.strip() else {})
        except urllib.error.HTTPError as e:
            code, msg = e.code, e.read().decode()[:300]
            if code == 404 and method == "DELETE":
                return 204, {}  # déjà supprimé — idempotent
            return code, {"error": msg}
        except (OSError, urllib.error.URLError) as e:
            last_err = e
            time.sleep(2 * (i + 1))
    return 0, {"error": f"réseau: {last_err}"}


def act(desc, method, path, payload=None):
    if not APPLY:
        print(f"[dry-run] {desc}")
        return 0, {}
    st, r = api(method, path, payload)
    flag = "OK" if st in (200, 204) else "ECHEC"
    print(f"[{flag} {st}] {desc}" + (f" — {r.get('error','')}" if flag == "ECHEC" else ""))
    if flag == "ECHEC":
        sys.exit(1)
    time.sleep(0.5)
    return st, r


# Garde-fou : la campagne doit être en pause avant toute action.
st, c = api("GET", f"/api/v2/campaigns/{TARGET}")
assert st == 200, f"GET campagne cible: HTTP {st}"
assert c.get("status") == 0, f"ABANDON: campagne cible status={c.get('status')} (pas en pause)"

# 1. Retirer les 10 leads US (re-listés, match par email).
st, leads = api("POST", "/api/v2/leads/list", {"campaign": TARGET, "limit": 100})
assert st == 200
for l in leads.get("items") or []:
    if (l.get("email") or "").lower() in US_EMAILS:
        act(f"DELETE lead US {l['email']}", "DELETE", f"/api/v2/leads/{l['id']}")

# 2. Supprimer le brouillon 802b9b61 (garde-fou : uniquement si status=-1).
# L'API refuse le DELETE de campagne (« AI Sales Agent managed ») — plan B :
# vider ses leads, ce qui élimine le risque d'envoi double. Coquille vide à
# supprimer à la main dans le dashboard.
st, oldc = api("GET", f"/api/v2/campaigns/{OLD}")
if st == 200:
    assert oldc.get("status") == -1, f"ABANDON: 802b9b61 status={oldc.get('status')} != -1"
    st_d, r_d = api("DELETE", f"/api/v2/campaigns/{OLD}") if APPLY else (0, {})
    if not APPLY:
        print("[dry-run] DELETE campagne brouillon 802b9b61 (fallback: vider ses leads)")
    elif st_d in (200, 204):
        print("[OK] DELETE campagne brouillon 802b9b61")
    else:
        print(f"[note] DELETE campagne refusé ({st_d}) — fallback: suppression de ses leads")
        st_l, old_leads = api("POST", "/api/v2/leads/list", {"campaign": OLD, "limit": 100})
        assert st_l == 200, f"listage leads 802b9b61: HTTP {st_l}"
        for l in old_leads.get("items") or []:
            act(f"DELETE lead doublon 802b9b61 {l.get('email')}", "DELETE", f"/api/v2/leads/{l['id']}")
else:
    print(f"[note] brouillon 802b9b61 introuvable (HTTP {st}) — déjà supprimé ?")

# 3. Séquence sans signature (structure re-lue, seul le body du variant change).
seqs = c.get("sequences") or []
assert seqs and seqs[0].get("steps"), "séquence introuvable"
for s in seqs:
    for step in s.get("steps") or []:
        for v in step.get("variants") or []:
            assert "{{sdr_subject}}" in (v.get("subject") or ""), "subject inattendu"
            v["body"] = CLEAN_BODY
act("PATCH séquence (body = sdr_body + unsubscribe, sans signature)",
    "PATCH", f"/api/v2/campaigns/{TARGET}", {"sequences": seqs})

# 4. Une seule boîte d'envoi.
act("PATCH email_list = [charles@freegetpick.com]",
    "PATCH", f"/api/v2/campaigns/{TARGET}", {"email_list": ["charles@freegetpick.com"]})

# 5. Push des 3 leads lot 1 (idempotent : skip si l'email est déjà en campagne).
rows = list(csv.DictReader(open(LOT1_CSV, encoding="utf-8")))
assert len(rows) == 3 and all((r.get("email") or "").strip() for r in rows), \
    f"CSV lot 1 inattendu ({len(rows)} lignes)"
st, existing = api("POST", "/api/v2/leads/list", {"campaign": TARGET, "limit": 100})
assert st == 200, f"re-listage leads: HTTP {st}"
present = {(l.get("email") or "").lower() for l in existing.get("items") or []}
for r in rows:
    if r["email"].strip().lower() in present:
        print(f"[skip] lead déjà présent: {r['email'].strip()}")
        continue
    payload = {
        "campaign": TARGET, "email": r["email"].strip(),
        "first_name": (r.get("first_name") or "").strip(),
        "company_name": (r.get("company") or r.get("brand") or "").strip(),
        "custom_variables": {
            "sdr_subject": r.get("subject", ""), "sdr_body": r.get("body", ""),
            "report_url": r.get("report_url", ""),
            "top_competitor": r.get("top_competitor", ""), "score": r.get("score", "")}}
    act(f"POST lead lot1 {payload['email']}", "POST", "/api/v2/leads", payload)

# 6. Vérification finale.
if APPLY:
    st, c2 = api("GET", f"/api/v2/campaigns/{TARGET}")
    st2, leads2 = api("POST", "/api/v2/leads/list", {"campaign": TARGET, "limit": 100})
    items = leads2.get("items") or []
    st3, gone = api("GET", f"/api/v2/campaigns/{OLD}")
    body_now = ((c2.get("sequences") or [{}])[0].get("steps") or [{}])[0].get("variants", [{}])[0].get("body", "")
    print("--- VERIFICATION FINALE ---")
    print("status (attendu 0):", c2.get("status"))
    print("email_list (attendu freegetpick seul):", c2.get("email_list"))
    print("leads (attendu 3):", [(l.get("email"), l.get("company_name")) for l in items])
    print("body sans signature:", "Best," not in body_now and "{{sdr_body}}" in body_now)
    print("unsubscribe conservé:", "{{unsubscribeLink}}" in body_now)
    print("brouillon 802b9b61 supprimé (attendu != 200):", st3)
    for l in items:
        stv, lv = api("GET", f"/api/v2/leads/{l['id']}")
        cv = (lv.get("payload") or lv.get("custom_variables") or {})
        has = bool(cv.get("sdr_subject")) and bool(cv.get("sdr_body"))
        print(f"  vars posées {l.get('email')}: {has}")
else:
    print("[dry-run] terminé — rien n'a été modifié. Relancer avec --apply après GO Charles.")
