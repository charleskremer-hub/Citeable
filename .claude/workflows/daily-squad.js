export const meta = {
  name: 'daily-squad',
  description: 'Cycle quotidien Getpick : analyse → story → archi → dev → boucle adversariale → E2E → QA → dossier de déploiement',
  phases: [
    { title: 'Analyse', detail: 'pmm-analyst : insights du jour' },
    { title: 'Priorisation', detail: 'po : story prioritaire + critères' },
    { title: 'Architecture', detail: 'architecte : plan technique' },
    { title: 'Développement', detail: 'dev : implémentation + tests' },
    { title: 'Boucle adversariale', detail: 'reviewer attaque, dev corrige (max 3 tours)' },
    { title: 'Tests E2E', detail: 'e2e-tester : parcours réels' },
    { title: 'QA', detail: 'qa : lint/typecheck/tests/build + verdict' },
    { title: 'Déploiement', detail: 'deploy : dossier go/no-go (aucune mise en prod)' },
  ],
};

// Répertoire git de travail réel. Les agents DOIVENT cd dedans ; jamais les
// anciens chemins iCloud (…/NanoCorp/getciteable-main) ni getciteable-restored.
const PROJECT_DIR = '/Users/charles.kremer/Dev/Projects/getpick';
const PREAMBLE =
  `Répertoire du projet (dépôt git de travail, cd dedans avant toute commande) : ${PROJECT_DIR}\n` +
  `N'utilise JAMAIS les anciens chemins iCloud (…/NanoCorp/getciteable-main) ni getciteable-restored.\n\n`;

// Date du jour, threadée partout. Corrige le bug historique « date-inconnue » :
// on lit réellement args.date fourni par la tâche planifiée.
// `args` arrive parfois sous forme de chaîne JSON selon l'appelant : on tolère les deux.
const ARGS = (() => {
  if (args && typeof args === 'object') return args;
  if (typeof args === 'string') { try { return JSON.parse(args); } catch { return {}; } }
  return {};
})();
const DATE = (typeof ARGS.date === 'string' && ARGS.date.trim()) ? ARGS.date.trim() : 'date-inconnue';

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'story';
}

const PO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hasStory'],
  properties: {
    hasStory: { type: 'boolean' },
    title: { type: 'string' },
    story: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
};

const ADVERSARIAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'findings'],
  properties: {
    approved: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'severity', 'failureScenario'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['majeur', 'mineur'] },
          failureScenario: { type: 'string' },
        },
      },
    },
  },
};

const PASS_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'summary'],
  properties: { pass: { type: 'boolean' }, summary: { type: 'string' } },
};

// ─── 1. Analyse ───────────────────────────────────────────────────────────────
phase('Analyse');
log(`Cycle quotidien du ${DATE} — analyse PMM/BA`);
const insights = await agent(
  PREAMBLE +
    `Cycle quotidien Getpick du ${DATE}. Produis tes 3-5 insights du jour avec UNE ` +
    `recommandation prioritaire clairement identifiée, prête à être transformée en ` +
    `user story par le PO.`,
  { agentType: 'pmm-analyst', label: 'pmm-analyst', phase: 'Analyse' },
);

// ─── 2. Priorisation ──────────────────────────────────────────────────────────
phase('Priorisation');
const po = await agent(
  PREAMBLE +
    `Cycle quotidien Getpick du ${DATE}.\n\nInsights du PMM/BA :\n${insights}\n\n` +
    `Choisis LA story prioritaire du jour (réalisable en une journée) avec des ` +
    `critères d'acceptation testables, ou indique hasStory=false s'il n'y a rien de ` +
    `prioritaire à livrer.`,
  { agentType: 'po', label: 'po', phase: 'Priorisation', schema: PO_SCHEMA },
);

if (!po || !po.hasStory) {
  log('Pas de story prioritaire aujourd\'hui — fin du cycle.');
  return { date: DATE, status: 'no-story', insights, reason: po ? po.rationale : 'PO indisponible' };
}

log(`Story du jour : ${po.title}`);
const slug = slugify(po.title);
const branch = `squad/${DATE}-${slug}`;
const acText = (po.acceptanceCriteria || []).map((a, i) => `AC${i + 1}. ${a}`).join('\n');
const storyBlock =
  `Story : ${po.title}\n${po.story}\n\nCritères d'acceptation :\n${acText}\n\nBranche : ${branch}`;

// ─── 3. Architecture ──────────────────────────────────────────────────────────
phase('Architecture');
const plan = await agent(
  PREAMBLE + `Produis le plan technique complet pour cette story.\n\n${storyBlock}`,
  { agentType: 'architecte', label: 'architecte', phase: 'Architecture' },
);

// ─── 4. Développement ─────────────────────────────────────────────────────────
phase('Développement');
const devReport = await agent(
  PREAMBLE +
    `Implémente cette story sur la branche ${branch} (créée depuis main) en suivant ` +
    `le plan de l'architecte. Commits locaux uniquement, aucun push/merge.\n\n` +
    `${storyBlock}\n\nPlan de l'architecte :\n${plan}`,
  { agentType: 'dev', label: 'dev:implémentation', phase: 'Développement' },
);

// ─── 5. Boucle adversariale (max 3 tours) ─────────────────────────────────────
phase('Boucle adversariale');
const MAX_TOURS = 3;
let approved = false;
let lastFindings = [];
for (let tour = 1; tour <= MAX_TOURS; tour++) {
  const review = await agent(
    PREAMBLE +
      `Tour ${tour}/${MAX_TOURS}. Attaque l'implémentation sur la branche ${branch}.\n\n` +
      `${storyBlock}\n\nRapport du Dev :\n${devReport}`,
    { agentType: 'adversarial-reviewer', label: `adversarial:tour-${tour}`, phase: 'Boucle adversariale', schema: ADVERSARIAL_SCHEMA },
  );
  if (!review) { log(`Tour ${tour} : reviewer indisponible — arrêt de la boucle.`); break; }
  lastFindings = review.findings || [];
  if (review.approved && lastFindings.length === 0) {
    approved = true;
    log(`Tour ${tour} : approuvé — boucle adversariale convergée.`);
    break;
  }
  log(`Tour ${tour} : ${lastFindings.length} finding(s) — retour au Dev`);
  if (tour === MAX_TOURS) {
    log('Boucle adversariale non convergée après 3 tours — le cycle continue mais le déploiement sera No-Go.');
    break;
  }
  await agent(
    PREAMBLE +
      `Sur la branche ${branch}, corrige ces findings de la review adversariale ` +
      `(corrige ou conteste chacun avec preuve, jamais d'ignorés) :\n` +
      `${JSON.stringify(lastFindings, null, 2)}`,
    { agentType: 'dev', label: `dev:corrections-tour-${tour}`, phase: 'Boucle adversariale' },
  );
}

// ─── 6 & 7. E2E + QA (en parallèle) ───────────────────────────────────────────
phase('Tests E2E');
const [e2e, qa] = await parallel([
  () => agent(
    PREAMBLE +
      `Valide les critères d'acceptation par des tests E2E réels sur la branche ${branch}.\n\n${storyBlock}`,
    { agentType: 'e2e-tester', label: 'e2e', phase: 'Tests E2E', schema: PASS_SUMMARY_SCHEMA },
  ),
  () => agent(
    PREAMBLE +
      `Passe QA complète de la branche ${branch} (checklist intégrale : lint, ` +
      `typecheck, tests, build, revue du diff vs main).\n\n${storyBlock}`,
    { agentType: 'qa', label: 'qa', phase: 'QA', schema: PASS_SUMMARY_SCHEMA },
  ),
]);

// ─── 8. Déploiement ───────────────────────────────────────────────────────────
phase('Déploiement');
const deployment = await agent(
  PREAMBLE +
    `Prépare le dossier de déploiement pour la branche ${branch}.\n` +
    `NE DÉPLOIE PAS. Prépare seulement le dossier et les commandes.\n\n${storyBlock}\n\n` +
    `Verdict QA : ${qa ? (qa.pass ? 'GO' : 'NO-GO') : 'indisponible'}\n` +
    `Résumé QA :\n${qa ? qa.summary : '(indisponible)'}\n\n` +
    `Boucle adversariale : ${approved ? 'CONVERGÉE' : 'NON CONVERGÉE'}\n` +
    `Findings restants :\n${JSON.stringify(lastFindings, null, 2)}\n\n` +
    `Résultat E2E : ${e2e ? (e2e.pass ? 'PASS' : 'FAIL') : 'indisponible'}`,
  { agentType: 'deploy', label: 'deploy', phase: 'Déploiement' },
);

return {
  date: DATE,
  status: 'completed',
  story: { title: po.title, branch },
  adversarial: { passed: approved, lastFindings },
  e2e: e2e || { pass: false, summary: 'indisponible' },
  qa: qa || { pass: false, summary: 'indisponible' },
  deployment,
};
