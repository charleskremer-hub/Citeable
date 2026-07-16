#!/usr/bin/env bash
# Citeable SDR — runner. Charge les clés depuis .env et enchaîne le pipeline.
# Aucune clé n'est écrite dans le code ; elles vivent dans .env (gitignoré).
set -euo pipefail
cd "$(dirname "$0")"

cmd="${1:-help}"

# Les clés ne sont requises que pour les commandes qui appellent une API.
# On lit keys.env en priorité (là où Charles colle ses clés), sinon .env.
if [[ "$cmd" =~ ^(enrich|batch|push|send|all)$ ]]; then
  if [ -f keys.env ]; then
    set -a; source ./keys.env; set +a
  elif [ -f .env ]; then
    set -a; source ./.env; set +a
  else
    echo "❌ Pas de keys.env. Ouvre keys.env avec TextEdit et colle tes clés."
    exit 1
  fi
fi

CAMPAIGN="${INSTANTLY_CAMPAIGN_ID:-419e33c5-f930-4b13-aee8-83b2395c19a1}"

case "$cmd" in
  enrich)
    # Trouve les emails des décideurs (Hunter) -> sdr_prospects_enriched.csv
    python3 enrich_hunter.py sdr_prospects.csv --out sdr_prospects_enriched.csv
    ;;
  batch)
    # Audite + qualifie + rédige -> sdr_output.csv
    src=sdr_prospects_enriched.csv; [ -f "$src" ] || src=sdr_prospects.csv
    python3 sdr_agent.py "$src" --out .
    ;;
  push)
    # DRY-RUN : montre ce qui serait chargé dans Instantly, sans rien envoyer
    python3 sdr_push_instantly.py sdr_output.csv --campaign "$CAMPAIGN"
    ;;
  send)
    # Charge réellement les leads dans la campagne (TU actives l'envoi ensuite dans Instantly)
    python3 sdr_push_instantly.py sdr_output.csv --campaign "$CAMPAIGN" --push
    ;;
  all)
    python3 enrich_hunter.py sdr_prospects.csv --out sdr_prospects_enriched.csv
    python3 sdr_agent.py sdr_prospects_enriched.csv --out .
    python3 sdr_push_instantly.py sdr_output.csv --campaign "$CAMPAIGN"   # dry-run
    ;;
  *)
    cat <<EOF
Usage : ./run.sh {enrich|batch|push|send|all}

  enrich  Trouve les emails (Hunter)        -> sdr_prospects_enriched.csv
  batch   Audite + rédige les emails perso  -> sdr_output.csv
  push    DRY-RUN vers Instantly (montre, n'envoie pas)
  send    Charge réellement les leads dans Instantly (tu actives ensuite)
  all     enrich + batch + push (dry-run)

Prérequis : cp .env.example .env  puis remplir HUNTER_API_KEY / INSTANTLY_API_KEY.
Rien n'est envoyé tant que tu n'actives pas la campagne dans Instantly.
EOF
    ;;
esac
