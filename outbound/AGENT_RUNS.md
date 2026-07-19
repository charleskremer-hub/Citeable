# Journal des runs d'agents Citeable

Une ligne par run, écrite par chaque agent. Lu chaque matin par `citeable-product-agent`,
qui supervise, diagnostique et répare les agents en échec.

Format : `- [AAAA-MM-JJ HH:MM] <agent> — <OK | BLOQUÉ | RIEN À FAIRE> — <résumé>`

## Pièges connus (à consulter avant de diagnostiquer une panne)

- **`keys.env` illisible / "Resource deadlock avoided" (OSError errno 35)** — le montage disque
  refuse par intermittence la lecture, pour TOUTES les méthodes (bash source, cat, dd, python),
  parfois plusieurs minutes d'affilée. Conséquence : la clé arrive vide, Instantly répond
  `401 Invalid authorization header`, et on conclut à tort à un « problème d'API ».
  **Toujours vérifier que la clé est chargée (>20 caractères) avant d'incriminer l'API.**
- **`403 error code: 1010`** — WAF Cloudflare d'Instantly. Cause : User-Agent absent ou non
  navigateur. Ni la clé ni l'API. Envoyer un UA Chrome règle le problème.
- **`.git` invisible depuis le sandbox** — les opérations git doivent être faites par Charles.

## Runs

- [2026-07-18 08:40] citeable-inbox-assign — BLOQUÉ — keys.env illisible (montage, errno 35) : faux diagnostic « problème d'API » remonté à Charles. Prompt de la tâche corrigé (lecture robuste 10×15s, garde-fou anti-clé-vide, attribution correcte de l'erreur).
- [2026-07-18 08:45] citeable-product-agent — OK — supervision ajoutée au prompt ; journal partagé créé.
