# Test avocats — lot 1 de prospection (01/10/2026)

GO Charles 01/10. Deuxième métier testé à côté des expert-comptables, même offre (14 j gratuits puis 69 € HT/mois), page dédiée https://www.getpick.ai/avocats.

## Protocole

- **Cible** : cabinets indépendants, droit de la famille (Nantes, Lyon) et droit du travail (Lille, Bordeaux).
- **Accroche** : le vrai résultat de leur diagnostic gratuit, lancé le 01/10 — une question de client, et le confrère que l'IA nomme à leur place. Aucune accroche générique.
- **Lien** : leur rapport `/audit/[id]` (débloqué par leur email → capture de lead), sinon /avocats.
- **Mesure à 3 semaines, vs le lot expert-comptable de même taille** : taux de réponse, rapports ouverts, emails capturés, essais démarrés. PostHog : `landing=avocats`.
- **Contacts** : à enrichir au moment de l'envoi (étape Hunter du pipeline) — non compilés ici. Vouvoiement (usage de la profession).
- **Ordre d'envoi (Charles, 01/10)** : WordPress connectable en 1 clic D'ABORD (GetPick publie lui-même page + JSON-LD sur leur domaine : promesse « zéro geste » vraie de bout en bout), puis WordPress verrouillé, puis le reste. Colonne « Site » calculée par `outbound/prioriser-wordpress.ts` (même détection que le bouton « Connecter mon site ») — à relancer sur chaque nouveau lot.
- **Envoi** : à la main depuis hello@getpick.ai (GO Charles 01/10, pas d'Instantly), signé « Charles — GetPick ».

## Modèles d'email (v2 — 01/10, 16 h 40)

Changements vs v1 : signature sans nom de famille, envoi depuis hello@getpick.ai, lien de RDV 15 min, nombre de questions réel par cabinet, promesse alignée sur ce que le produit livre selon le site (colonne « Site »). Rien de promis qui ne soit livré : pas de résultat garanti, pas de délai.

Champs : {Nom} · {IA} et {confrères} = colonne « Accroche » · {question} = colonne « Question » · {n} = dénominateur de la colonne de l'IA citée · {lien rapport} = colonne « Rapport ».

### A — Site « WordPress · 1 clic » ou « WordPress · verrouillé » (12 cabinets, à envoyer en premier)

```
Objet : {IA} recommande {confrère n°1} à vos futurs clients

Maître {Nom},

J'ai posé à {IA} la question qu'un client tape avant de choisir son avocat :
« {question} »

{IA} répond : {confrères}. Votre cabinet n'est pas dans la réponse.

J'ai posé {n} questions de ce type sur votre ville et vos domaines. Le détail, question par question, avec les sites que l'IA a lus pour répondre : {lien rapport}

Votre site est sous WordPress : en un clic, sans webmaster, GetPick y publie les réponses à ces questions, écrites à partir des seules informations de votre site, avec les données structurées et le fichier llms.txt que ces assistants lisent. Chaque mois, les mêmes questions sont reposées et vous voyez qui est cité, vous ou vos confrères.

14 jours gratuits, puis 69 € HT/mois, sans engagement. 15 minutes pour en parler : getpick.ai/rdv

Charles — GetPick
hello@getpick.ai

Vous ne souhaitez plus recevoir ce type de message ? Répondez « stop ».
```

### B — Autre site (Wix, autre CMS : 11 cabinets)

Même email, en remplaçant le paragraphe « Votre site est sous WordPress… » par :

```
GetPick écrit les réponses à ces questions à partir des seules informations de votre site, les publie là où ces assistants les lisent, et vous dit précisément quoi ajouter sur votre site. Chaque mois, les mêmes questions sont reposées et vous voyez qui est cité, vous ou vos confrères.
```

### Règles d'envoi

- Depuis **hello@getpick.ai**, un par un, 10 à 15 par jour maximum (délivrabilité d'une boîte neuve).
- Ordre : le tableau ci-dessous, de haut en bas (WordPress d'abord).
- Ne pas envoyer aux cabinets déjà cités sur la majorité des questions (pas de douleur) : Majeli Avocat (Gemini 3/6, ChatGPT 4/5), Poussier Avocat (4/6, 3/4) — à garder comme références.
- Le lien rapport demande l'email du cabinet pour afficher le détail : le rapport part alors par email automatiquement (bug corrigé le 01/10).

## Prospects (23)

| Cabinet | Site | Ville · domaine | Gemini te cite | ChatGPT te cite | Accroche (IA · confrères nommés) | Question | Rapport |
|---| --- |---|---|---|---|---|---|
| [Cottineau Avocats](https://cottineau.net/) | WordPress · 1 clic | Nantes · Famille | 1/6 | 0/6 | ChatGPT · Cabinet Majeli | Quel avocat en droit de la famille à Nantes peut m'accompagner pour préparer un divorce par consentement mutuel avec des enfants | [rapport](https://www.getpick.ai/audit/2a16d875-a3c2-43c2-bb7a-7a148b17bb58) |
| [Florine Michel Avocat](https://www.avocat-florine-michel.fr/) | WordPress · 1 clic | Lille · Travail | 3/6 | 0/6 | ChatGPT · Howard Avocats | Quel avocat spécialisé en droit du travail à Lille pouvez-vous me recommander pour contester un licenciement abusif | [rapport](https://www.getpick.ai/audit/9dedaa4e-9e11-47eb-a8f4-abf77350549b) |
| [Catherine Vérot Fournet Avocat](https://verotfournetavocat.fr/) | WordPress · 1 clic | Lyon · Famille | 0/6 | 0/5 | ChatGPT · Cabinet Drai Attal, Cabinet Del Vecchio-Zinsch | Quel avocat spécialisé en droit de la famille à Lyon recommandez-vous pour gérer une procédure de divorce conflictuelle | [rapport](https://www.getpick.ai/audit/aaaad022-2717-49c5-a8c4-7fc4f27adaec) |
| [Lisa Salvatore Avocat](https://salvatore-avocat.com/) | WordPress · 1 clic | Lyon · Famille | 3/6 | 0/3 | ChatGPT · Cabinet Drai Attal, Cabinet Guiol Avocat | Où trouver un bon avocat pour fixer la pension alimentaire et la garde des enfants à Lyon | [rapport](https://www.getpick.ai/audit/c75c05d0-4669-432a-a69e-951f8eac8b43) |
| [Busquet Avocat](https://www.avocatlyon-busquet.com/) | WordPress · 1 clic | Lyon · Famille | 2/6 | 0/4 | ChatGPT · Cabinet Drai Attal | Quel avocat spécialisé en droit de la famille à Lyon recommandez-vous pour un divorce par consentement mutuel rapide | [rapport](https://www.getpick.ai/audit/605684dc-ac94-41b1-887d-8564207d0ed4) |
| [Michèle Bauer Avocat](https://michelebaueravocatbordeaux.fr/) | WordPress · 1 clic | Bordeaux · Travail | 3/6 | 0/4 | ChatGPT · Cabinet Trois, Cabinet Jebbouri | Quel cabinet d'avocats à Bordeaux contacter en urgence pour une comparution devant le tribunal correctionnel | [rapport](https://www.getpick.ai/audit/0ca64ae4-0a85-435a-8507-e0ff8e8949a4) |
| [Majeli Avocat](https://www.majeli-avocat.fr/) | WordPress · verrouillé | Nantes · Famille | 3/6 | 4/5 | Gemini · AGN Avocats Nantes | Quel avocat spécialisé en droit de la famille et divorce recommandez-vous à Nantes pour une procédure conflictuelle | [rapport](https://www.getpick.ai/audit/a0d94a63-945d-4d4e-b002-574dfdd1235d) |
| [Hélène Nicolas Avocate](https://nicolasavocat.fr/) | WordPress · verrouillé | Nantes · Famille | 3/6 | 0/5 | ChatGPT · Cabinet Majeli, Nautilus Avocats | Quel cabinet d'avocats à Nantes consulter pour régler une question de pension alimentaire et de résidence des enfants | [rapport](https://www.getpick.ai/audit/dffc474f-b185-41b5-a958-8a2880442edb) |
| [MS Avocat Marina Stefania](https://avocat-stefania.fr/) | WordPress · verrouillé | Lyon · Famille | 1/6 | 0/5 | ChatGPT · Nicol Fideurope Lyon SELAFA, Dahan Avocats | Quel cabinet d'avocats à Lyon est spécialisé dans la protection du patrimoine et les successions complexes pour un dirigeant d'entreprise | [rapport](https://www.getpick.ai/audit/e3f5c873-5bad-4351-831e-f2b6bdcd6f8f) |
| [Jalain Avocat](https://www.avocat-jalain.fr/) | WordPress · verrouillé | Bordeaux · Travail | 0/6 | 0/5 | ChatGPT · JM Avocats | Où trouver un bon avocat spécialisé en droit social à Bordeaux pour m'accompagner en tant que salarié lors d'une procédure de licenciement économique | [rapport](https://www.getpick.ai/audit/2c9232d8-bec9-4cc9-87f5-d09284f24ad9) |
| [CBS Avocats](https://www.cbs-avocats.fr/) | WordPress · verrouillé | Bordeaux · Travail | 0/6 | 1/5 | ChatGPT · YAD Avocats, JM Avocats | Quel cabinet d'avocats à Bordeaux recommandez-vous pour gérer un contentieux prud'hommal avec un salarié | [rapport](https://www.getpick.ai/audit/e79c2435-0fbb-4a7f-afd6-0d297eb3ad3c) |
| [AFC Ledermann](https://afcledermann.com/) | WordPress · verrouillé | Bordeaux · Travail | 0/6 | 0/4 | ChatGPT · YAD Avocats, Ellipse Avocats | Où trouver un avocat spécialisé en droit du travail à Bordeaux pour négocier un plan de départ négocié de cadre dirigeant | [rapport](https://www.getpick.ai/audit/b60e6b7f-ee10-4a25-9bdd-d5243130829a) |
| [Marie Chapuis Avocat](https://www.marie-chapuis-avocat-famille.fr/) | Wix | Lyon · Famille | 2/6 | 0/3 | ChatGPT · Cabinet Drai Attal, Cabinet Excellim Avocats | Où trouver un cabinet d'avocats en droit de la famille à Lyon capable de m'accompagner pour une modification de pension alimentaire | [rapport](https://www.getpick.ai/audit/337fb161-1130-4c46-b85f-1c14ad972780) |
| [Cabinet R-P Avocats](https://www.cabinet-r-p-avocats.fr/) | Autre CMS | Nantes · Famille | 0/4 | 0/3 | ChatGPT · Cabinet Lefebvre, Majeli Avocat | Quel avocat pénaliste à Nantes contacter en urgence pour une garde à vue | [rapport](https://www.getpick.ai/audit/9591fb6e-f5d6-4edb-abe1-725163a9d5f5) |
| [Debernard Avocat](https://avocatnantesdebernard.fr/) | Autre CMS | Nantes · Famille | 0/6 | 0/5 | ChatGPT · Cabinet Majeli, Cabinet Richard CAILLAUD | Quel avocat en droit de la famille à Nantes recommandez-vous pour gérer un divorce par consentement mutuel avec des enfants | [rapport](https://www.getpick.ai/audit/8ee21b24-92ec-4b17-bb98-d4f8b77fc7b8) |
| [Poussier Avocat](https://www.avocat-poussier.fr/) | Autre CMS | Nantes · Famille | 4/6 | 3/4 | ChatGPT · Nautilus Avocats, Majeli Avocat | Où trouver un bon avocat spécialisé dans les affaires familiales et la protection des mineurs à Nantes | [rapport](https://www.getpick.ai/audit/312e1895-7ef5-4fab-b13e-81b12d9e5610) |
| [Isabelle Saffre Avocat](https://www.saffre-avocat.com/) | Autre CMS | Lille · Travail | 2/6 | 3/3 | Gemini · Cabinet Howard | Quel avocat spécialisé en droit du travail à Lille recommandez-vous pour négocier une rupture conventionnelle en tant que salarié | [rapport](https://www.getpick.ai/audit/3c3c1755-9e3f-4f59-be59-4e17f933976e) |
| [Excellim Avocats](https://excellim-avocats-lyon.fr/) | Autre CMS | Lyon · Famille | 0/6 | 1/6 | ChatGPT · Cabinet Barlatier | Quel avocat en droit de la famille à Lyon recommandez-vous pour gérer un divorce par consentement mutuel avec des enfants mineurs | [rapport](https://www.getpick.ai/audit/b3116402-0cf1-47a3-b21c-39e75208d4d2) |
| [Marion Vincent-Girod Avocat](https://www.vincentgirod-avocat.fr/) | Autre CMS | Lyon · Famille | 0/6 | 0/6 | ChatGPT · Cabinet Drai Attal, Cabinet Elisa GILLET | Quel avocat en droit de la famille à Lyon contacter pour un divorce par consentement mutuel urgent | [rapport](https://www.getpick.ai/audit/f1301b05-77d3-4abd-b160-9a7d5237d924) |
| [Vibourel Avocat](https://www.vibourel-avocat.com/) | Autre CMS | Lyon · Famille | 1/6 | 0/4 | ChatGPT · LC AVOCATS, KPMG Avocats Lyon | Où trouver un cabinet d'avocats à Lyon pour rédiger un pacte d'associés dans le cadre de ma start-up | [rapport](https://www.getpick.ai/audit/66e0957f-e076-4581-95bf-96fa4f16fed9) |
| [Cabinet Eleos](https://www.cabineteleos.fr/) | Autre CMS | Bordeaux · Travail | 3/5 | 0/4 | ChatGPT · Drouot Avocats | Quel avocat en droit du travail à Libourne contacter pour contester un licenciement abusif | [rapport](https://www.getpick.ai/audit/4cbdbf34-8250-4e39-8670-29cc5256367e) |
| [Decima Avocat](https://www.decima-avocat.fr/) | Autre CMS | Bordeaux · Travail | 0/6 | 0/5 | ChatGPT · CPM AVOCATS, Cabinet Rodesse | Quel cabinet d'avocats à Bordeaux est spécialisé en droit de la famille pour gérer une procédure de divorce conflictuelle | [rapport](https://www.getpick.ai/audit/dc920e57-0cd6-4596-a950-7d8531d998e9) |
| [Alvarez-Vigon Avocat](https://www.alvarez-vigon-avocat.com/) | Autre CMS | Bordeaux · Travail | 0/6 | 0/6 | ChatGPT · Altea Avocats, Cabinet Saraya Avocat | Quel avocat en droit commercial à Le Bouscat pouvez-vous me recommander pour rédiger les contrats de ma nouvelle entreprise | [rapport](https://www.getpick.ai/audit/6a324b6e-15ae-409b-8372-64016d573901) |

## Écartés

- Lejeune-Brachet (Nantes), Huber (Lille), Parafiniuk (Lille) : déjà cités sur presque toutes les questions — pas de douleur ; à garder comme références de marché.
- JM Avocats (Bordeaux) : classé comptable (bug corrigé, commit 63d6aa4) — à rediagnostiquer demain.
- Camille Lenoble (Bordeaux) : questions hors de son activité (cabinet en ligne) — accroche non crédible.
- Emmanuelle Olliéric (Nantes) : site injoignable.

## Ce que le lot montre déjà

- 10/23 cabinets ne sont cités par Gemini sur aucune question ; 18/23 ne le sont par ChatGPT sur aucune question vérifiée.
- ChatGPT et Gemini ne citent pas les mêmes cabinets (ex. Nantes : ChatGPT nomme Majeli quasi systématiquement) — l'argument « deux IA » est concret.
- La couverture ChatGPT est partielle sur ce lot (429 en rafale) : corrigé par un réessai (63d6aa4).
