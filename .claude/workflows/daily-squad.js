export const meta = {
  name: 'daily-squad',
  description: 'Cycle quotidien Getpick : analyse → story → archi → dev → boucle adversariale → E2E → QA → dossier de déploiement',
  whenToUse: 'Chaque jour ouvré, ou à la demande pour livrer la story la plus prioritaire du backlog de bout en bout.',
  phases: [
    { title: 'Analyse', detail: 'PMM/BA : signaux marché et produit' },
    { title: 'Priorisation', detail: 'PO : backlog à jour + story du jour' },
    { title: 'Architecture', detail: 'Plan technique de la story' },
    { title: 'Développement', detail: 'Implémentation sur branche squad/*' },
    { title: 'Boucle adversariale', detail: 'Review adversariale ↔ corrections (max 3 tours)' },
    { title: 'Tests E2E', detail: 'Parcours utilisateur réels' },
    { title: 'QA', detail: 'Lint, typecheck, build, revue du diff' },
    { title: 'Déploiement', detail: 'Dossier go/no-go — jamais de mise en prod automatique' },
  ],
}

// La date du jour est passée en argument (les workflows n'ont pas accès à Date) :
// Workflow({ scriptPath, args: { date: 'YYYY-MM-DD' } })
const today = (args && args.date) || 'date-inconnue'

// Dépôt de travail unique — les agents peuvent hériter d'un mauvais cwd (session,
// tâche planifiée…) : chaque prompt épingle donc le chemin explicitement.
const REPO = '/Users/charles.kremer/Dev/Projects/getpick'
const REPO_CTX = `Répertoire du projet (dépôt git de travail, cd dedans avant toute commande) : ${REPO}
N'utilise JAMAIS les anciens chemins iCloud (…/NanoCorp/getciteable-main) ni getciteable-restored.`

const STORY_SCHEMA = {
  type: 'object',
  required: ['hasStory', 'title', 'story', 'acceptanceCriteria', 'slug'],
  properties: {
    hasStory: { type: 'boolean', description: 'false si aucune story prête à développer' },
    title: { type: 'string' },
    story: { type: 'string', description: 'En tant que… je veux… afin de…' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    slug: { type: 'string', description: 'slug kebab-case pour la branche git' },
    reason: { type: 'string', description: 'si hasStory=false : pourquoi' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['approved', 'findings'],
  properties: {
    approved: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'severity', 'failureScenario'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          failureScenario: { type: 'string' },
        },
      },
    },
  },
}

const REPORT_SCHEMA = {
  type: 'object',
  required: ['pass', 'summary'],
  properties: {
    pass: { type: 'boolean' },
    summary: { type: 'string', description: 'résumé du rapport avec les résultats réels' },
  },
}

// ── Phase 1 : Analyse marché/produit ────────────────────────────────
phase('Analyse')
log(`Cycle quotidien du ${today} — analyse PMM/BA`)
const insights = await agent(
  `${REPO_CTX}

Cycle quotidien Getpick du ${today}. Produis tes 3-5 insights du jour avec UNE recommandation prioritaire clairement identifiée, prête à être transformée en user story par le PO.`,
  { agentType: 'pmm-analyst', label: 'pmm-analyst' },
)

// ── Phase 2 : Priorisation ──────────────────────────────────────────
phase('Priorisation')
const story = await agent(
  `${REPO_CTX}

Cycle quotidien Getpick du ${today}.

Insights du PMM/BA :
${insights}

1. Mets à jour PRODUCT_BACKLOG.md avec ces insights (nouvelles stories au bon rang de priorité).
2. Sélectionne LA story du jour (taille S ou M, autonome, testable) et retourne-la avec ses critères d'acceptation.
Si aucune story n'est prête à développer, hasStory=false avec la raison.`,
  { agentType: 'po', label: 'po', schema: STORY_SCHEMA },
)

if (!story || !story.hasStory) {
  log('Aucune story prête à développer aujourd\'hui — arrêt du cycle.')
  return { date: today, status: 'no-story', reason: story ? story.reason : 'agent PO indisponible', insights }
}
log(`Story du jour : ${story.title}`)

// ── Phase 3 : Architecture ──────────────────────────────────────────
phase('Architecture')
const storyBlock = `Story : ${story.title}
${story.story}
Critères d'acceptation :
${story.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`

const plan = await agent(
  `${REPO_CTX}\n\nProduis le plan technique complet pour cette story.\n\n${storyBlock}`,
  { agentType: 'architecte', label: 'architecte' },
)

// ── Phase 4 : Développement ─────────────────────────────────────────
phase('Développement')
const branch = `squad/${today}-${story.slug}`
let implementation = await agent(
  `${REPO_CTX}\n\nImplémente cette story sur la branche ${branch} en suivant le plan de l'architecte.\n\n${storyBlock}\n\nPlan technique :\n${plan}`,
  { agentType: 'dev', label: 'dev:implémentation' },
)

// ── Phase 5 : Boucle adversariale (max 3 tours) ─────────────────────
phase('Boucle adversariale')
let verdict = null
const MAX_ROUNDS = 3
for (let round = 1; round <= MAX_ROUNDS; round++) {
  verdict = await agent(
    `${REPO_CTX}\n\nTour ${round}/${MAX_ROUNDS}. Attaque l'implémentation sur la branche ${branch}.\n\n${storyBlock}\n\nRapport du Dev :\n${implementation}\n\nInspecte le diff réel (git diff main...${branch}) et exécute lint/typecheck/tests toi-même.`,
    { agentType: 'adversarial-reviewer', label: `adversarial:tour-${round}`, phase: 'Boucle adversariale', schema: VERDICT_SCHEMA },
  )
  if (!verdict || verdict.approved) break
  log(`Tour ${round} : ${verdict.findings.length} finding(s) — retour au Dev`)
  implementation = await agent(
    `${REPO_CTX}\n\nSur la branche ${branch}, corrige ces findings de la review adversariale (corrige ou conteste chacun, jamais d'ignorés) :\n${JSON.stringify(verdict.findings, null, 2)}\n\nContexte story :\n${storyBlock}`,
    { agentType: 'dev', label: `dev:corrections-tour-${round}`, phase: 'Boucle adversariale' },
  )
}
const adversarialPassed = Boolean(verdict && verdict.approved)
if (!adversarialPassed) log(`Boucle adversariale non convergée après ${MAX_ROUNDS} tours — le cycle continue mais le déploiement sera No-Go.`)

// ── Phases 6+7 : E2E et QA en parallèle ─────────────────────────────
const [e2e, qa] = await parallel([
  () => agent(
    `${REPO_CTX}\n\nValide les critères d'acceptation par des tests E2E réels sur la branche ${branch}.\n\n${storyBlock}`,
    { agentType: 'e2e-tester', label: 'e2e', phase: 'Tests E2E', schema: REPORT_SCHEMA },
  ),
  () => agent(
    `${REPO_CTX}\n\nPasse QA complète de la branche ${branch} (checklist intégrale : lint, typecheck, tests, build, revue du diff vs main).\n\n${storyBlock}`,
    { agentType: 'qa', label: 'qa', phase: 'QA', schema: REPORT_SCHEMA },
  ),
])

// ── Phase 8 : Dossier de déploiement ────────────────────────────────
phase('Déploiement')
const deployment = await agent(
  `${REPO_CTX}\n\nPrépare le dossier de déploiement pour la branche ${branch}.\n\n${storyBlock}\n\nRésultats amont :
- Boucle adversariale : ${adversarialPassed ? 'APPROUVÉ' : 'NON CONVERGÉE (No-Go obligatoire)'}
- E2E : ${e2e ? (e2e.pass ? 'PASS' : 'FAIL') : 'indisponible'} — ${e2e ? e2e.summary : ''}
- QA : ${qa ? (qa.pass ? 'GO' : 'NO-GO') : 'indisponible'} — ${qa ? qa.summary : ''}

Rappel : tu prépares tout (notes de release, checklist, commandes, rollback) mais tu ne déploies RIEN.`,
  { agentType: 'deploy', label: 'deploy' },
)

return {
  date: today,
  status: 'completed',
  story: { title: story.title, branch },
  adversarial: { passed: adversarialPassed, lastFindings: verdict ? verdict.findings : [] },
  e2e: e2e || { pass: false, summary: 'agent E2E indisponible' },
  qa: qa || { pass: false, summary: 'agent QA indisponible' },
  deployment,
}
