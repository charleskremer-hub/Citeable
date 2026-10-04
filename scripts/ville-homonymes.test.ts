import assert from "node:assert/strict";
import test from "node:test";

/**
 * Défaut 02–04/10 : Fiaud-Laporte (36250 Saint-Maur, Indre, 3 537 hab.) mesuré
 * sur Saint-Maur-des-Fossés (94) — questions « à Saint-Maur », 6/6 réponses et
 * tous les confrères dans le Val-de-Marne. Fixture = réponses réelles de
 * geo.api.gouv.fr (04/10/2026).
 */
const { departmentSuffixNeeded, inferLocationFromHomepage } = await import("@/lib/audit-engine");

const SAINT_MAUR_36 = { nom: "Saint-Maur", code: "36202", population: 3537, departement: { nom: "Indre" } };
const SAINT_MAUR_SEARCH = [
  { nom: "Saint-Maur-des-Fossés", code: "94068", population: 76572 },
  { nom: "Saint-Maurin", code: "47260", population: 377 },
  { nom: "Sainte-Maure", code: "10352", population: 1801 },
  { nom: "Saint-Maur", code: "36202", population: 3537 },
  { nom: "Saint-Maur", code: "60588", population: 397 },
];

test("Saint-Maur (Indre) : homonyme « Saint-Maur-des-Fossés » 20× plus peuplé → département requis", () => {
  assert.equal(departmentSuffixNeeded(SAINT_MAUR_36, SAINT_MAUR_SEARCH), true);
});

test("Valence (Drôme) : la plus peuplée des Valence n'a pas besoin de précision", () => {
  const self = { nom: "Valence", code: "26362", population: 64458, departement: { nom: "Drôme" } };
  const search = [
    { nom: "Valence", code: "26362", population: 64458 },
    { nom: "Bourg-lès-Valence", code: "26058", population: 19992 },
    { nom: "Valence", code: "82186", population: 5289 },
    { nom: "Valence", code: "16392", population: 192 },
  ];
  assert.equal(departmentSuffixNeeded(self, search), false);
});

test("Valence (Tarn-et-Garonne) : un homonyme exact plus peuplé existe → département requis", () => {
  const self = { nom: "Valence", code: "82186", population: 5289, departement: { nom: "Tarn-et-Garonne" } };
  const search = [{ nom: "Valence", code: "26362", population: 64458 }, { nom: "Valence", code: "82186", population: 5289 }];
  assert.equal(departmentSuffixNeeded(self, search), true);
});

test("Belfort : aucune ambiguïté", () => {
  const self = { nom: "Belfort", code: "90010", population: 45912, departement: { nom: "Territoire de Belfort" } };
  const search = [{ nom: "Belfort", code: "90010", population: 45912 }, { nom: "Belfort-du-Quercy", code: "46021", population: 504 }];
  assert.equal(departmentSuffixNeeded(self, search), false);
});

test("la ville lue garde la précision de département", () => {
  assert.equal(inferLocationFromHomepage("36250 Saint-Maur (Indre) · Cabinet Fiaud-Laporte"), "Saint-Maur (Indre)");
  assert.equal(inferLocationFromHomepage("90000 Belfort · Mon Espace Compta"), "Belfort");
  assert.equal(inferLocationFromHomepage("26000 Valence Cabinet comptable"), "Valence");
});
