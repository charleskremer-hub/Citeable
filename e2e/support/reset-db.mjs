/**
 * Remise à zéro de la base E2E JETABLE (jamais la production).
 *
 * Doit tourner AVANT le démarrage du serveur : `readTrafficClassSince` mémoïse la
 * première valeur non nulle lue par l'instance, donc un reliquat d'un run
 * précédent fausserait `traffic_class_since` pour toute la durée du test.
 */
import { Client } from "pg";

const url = process.env.E2E_DATABASE_URL;

if (!url || /neon|amazonaws|supabase|vercel/i.test(url)) {
  console.error("E2E_DATABASE_URL doit pointer sur une base LOCALE jetable.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
await client.query("DROP SCHEMA public CASCADE");
await client.query("CREATE SCHEMA public");
await client.end();
console.log("[e2e] base réinitialisée");
