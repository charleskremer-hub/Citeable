# Nettoyage requis au déploiement — monitoring des 21 marques du re-run

## État laissé en prod par le re-run du 2026-07-23

Le re-run (`scripts/rerun-study-2026-07.ts`, tier `agent_19eur`) est passé
par le chemin d'écriture de production : chaque audit complété a donc
créé/réactivé une ligne `monitored_brands` (`upsertMonitoredBrandForAudit`
dans `src/lib/audit-engine.ts`) avec `active = true` et
`next_run_at = 2026-08-22` (~30 jours après la collecte).

Sans action, `runDueWeeklyRescans` relancera automatiquement les 21 audits
chaque mois (~250 appels gpt-4o-mini mensuels) pour des marques qui n'ont
rien demandé. Les emails, eux, sont déjà supprimés (domaine
`anonymous.citeable.invalid` dans la liste de suppression) — seul le coût
LLM récurrent reste.

## Décision

Le re-run de l'étude est un snapshot ponctuel, pas un abonnement au
monitoring. Les 21 lignes doivent être désactivées (`active = false`),
sans suppression, pour conserver l'historique des audits liés.

## Action au déploiement (avant le 2026-08-22)

```
DATABASE_URL="<Neon prod>" node scripts/deactivate-study-rerun-monitoring.ts
```

Dry-run possible avec `DRY_RUN=1`. Le script cible uniquement l'email exact
du re-run (`study-rerun-2026-07@anonymous.citeable.invalid`) : aucune marque
inscrite par un vrai utilisateur n'est touchée. Idempotent.

Ce nettoyage n'a pas pu être exécuté depuis le poste de dev (pas de
`DATABASE_URL` local) — il fait partie de la checklist de déploiement de
l'édition juillet 2026.
