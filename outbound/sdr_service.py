#!/usr/bin/env python3
"""
Citeable SDR Service — le "cerveau" appelé par l'orchestrateur (n8n).
Expose notre logique métier (audit -> finding -> qualification/QA -> copy)
en HTTP, sans dépendance externe (stdlib only).

Endpoints
---------
  GET  /health
  POST /start-audit      body: {"brand": "...", "website": "https://..."}
                          -> {"audit_id": "..."}
  GET  /finding?audit_id=X
                          -> 200 {finding}   si l'audit est terminé
                          -> 202 {"status": "running"}  sinon
  POST /qualify          body: {finding}     (ou {audit_id} pour tout faire)
                          -> {"hook": bool, "reason": "..."}
  POST /draft            body: {finding, "first_name": "..."}
                          -> {"subject": "...", "body": "..."}

Lancer :  python3 sdr_service.py            # port 8787
          PORT=9000 python3 sdr_service.py

n8n appelle ce service ; la logique reste chez nous (versionnée, testable).
Le service N'ENVOIE AUCUN email.
"""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import sdr_agent as S

PORT = int(os.environ.get("PORT", "8787"))


def _finding_from_audit(audit_id, brand="", website=""):
    data = S._get(f"/api/audit-status?audit_id={audit_id}")
    if data.get("status") != "completed":
        return None, data.get("status", "unknown")
    f = S.analyze(brand or data.get("brand_name", ""),
                  website or data.get("website_url", ""), audit_id, data)
    return f, "completed"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def log_message(self, *args):
        pass  # silencieux

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self._send(200, {"ok": True, "service": "citeable-sdr"})
        if parsed.path == "/finding":
            qs = parse_qs(parsed.query)
            audit_id = (qs.get("audit_id") or [""])[0]
            if not audit_id:
                return self._send(400, {"error": "audit_id required"})
            try:
                f, status = _finding_from_audit(audit_id,
                                                (qs.get("brand") or [""])[0],
                                                (qs.get("website") or [""])[0])
            except Exception as e:
                return self._send(502, {"error": str(e)})
            if f is None:
                return self._send(202, {"status": status})
            return self._send(200, f)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        payload = self._read_json()

        if parsed.path == "/start-audit":
            brand = payload.get("brand", "").strip()
            website = payload.get("website") or payload.get("url") or ""
            if not brand or not website:
                return self._send(400, {"error": "brand + website required"})
            try:
                audit_id = S.start_audit(brand, website, int(time.time()))
            except Exception as e:
                return self._send(502, {"error": str(e)})
            return self._send(200, {"audit_id": audit_id, "brand": brand, "website": website})

        if parsed.path == "/qualify":
            f = payload.get("finding") or payload
            if payload.get("audit_id") and "score" not in f:
                f, status = _finding_from_audit(payload["audit_id"],
                                                payload.get("brand", ""), payload.get("website", ""))
                if f is None:
                    return self._send(202, {"status": status})
            threshold = int(payload.get("threshold", S.DEFAULT_THRESHOLD))
            result = S.qualify(f, threshold)
            result["brand"] = f.get("brand", "")
            return self._send(200, result)

        if parsed.path == "/draft":
            f = payload.get("finding") or payload
            subject, body = S.draft_email(f, payload.get("first_name", ""))
            return self._send(200, {"subject": subject, "body": body,
                                    "report_url": f.get("report_url", "")})

        return self._send(404, {"error": "not found"})


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[sdr-service] écoute sur http://0.0.0.0:{PORT}  (endpoints: /health /start-audit /finding /qualify /draft)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
