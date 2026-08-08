/**
 * Site audité factice, servi en local pour les E2E du funnel.
 *
 * Le moteur d'audit va chercher la home, le robots.txt et le balisage du site
 * demandé. Le faire pointer sur un vrai domaine rendrait le test dépendant d'un
 * tiers ; on sert donc un site minimal et stable sur 127.0.0.1.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.E2E_SITE_PORT ?? 3399);

const HOME = `<!doctype html>
<html lang="en">
  <head>
    <title>Oliveto — cold pressed olive oil</title>
    <meta name="description" content="Oliveto sells cold pressed extra virgin olive oil online." />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Oliveto","url":"http://localhost:${PORT}"}</script>
  </head>
  <body><h1>Oliveto</h1><p>Cold pressed extra virgin olive oil, shipped from Provence.</p></body>
</html>`;

createServer((req, res) => {
  if (req.url === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("User-agent: *\nAllow: /\nSitemap: http://localhost:" + PORT + "/sitemap.xml\n");
    return;
  }
  if (req.url === "/sitemap.xml") {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:' + PORT + '/</loc></url></urlset>');
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HOME);
  // Pas d'hôte imposé : `localhost` peut résoudre en ::1 comme en 127.0.0.1
  // selon la pile réseau, et le moteur d'audit doit joindre les deux.
}).listen(PORT, () => {
  console.log(`[e2e] site audité factice sur http://localhost:${PORT}`);
});
