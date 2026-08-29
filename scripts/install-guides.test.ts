// Verrou du LOT 2b (commande CEO/Charles du 28/08/2026) : le guide
// d'installation dit OÙ aller, QUOI coller et COMMENT VÉRIFIER — les trois,
// pour chaque fichier. Plateforme "inconnu" => guide générique ; JAMAIS un
// guide spécifique pour une plateforme non détectée. Le guide ne transporte
// aucun contenu de fichier machine : c'est un mode d'emploi, pas le livrable.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { installGuide, type GuideFile, type GuideLocale } from "@/lib/install-guides";
import { KNOWN_PLATFORMS, type DetectedPlatform } from "@/lib/platform-detect";

const FILES: GuideFile[] = ["jsonld", "llms", "robots"];
const LOCALES: GuideLocale[] = ["fr", "en"];
const ALL_PLATFORMS: DetectedPlatform[] = [...KNOWN_PLATFORMS, "inconnu"];

test("chaque guide porte ses trois volets non vides : où, coller, vérifier", () => {
  for (const platform of ALL_PLATFORMS) {
    for (const file of FILES) {
      for (const locale of LOCALES) {
        const guide = installGuide(file, platform, locale);
        assert.ok(guide.where.trim().length > 0, `where vide: ${platform}/${file}/${locale}`);
        assert.ok(guide.paste.trim().length > 0, `paste vide: ${platform}/${file}/${locale}`);
        assert.ok(guide.verify.trim().length > 0, `verify vide: ${platform}/${file}/${locale}`);
      }
    }
  }
});

test("plateforme inconnue => guide générique, marqué comme tel", () => {
  for (const file of FILES) {
    for (const locale of LOCALES) {
      const guide = installGuide(file, "inconnu", locale);
      assert.equal(guide.generic, true, `inconnu doit rendre le générique (${file}/${locale})`);
    }
  }
});

test("jamais un guide d'une AUTRE plateforme pour une plateforme détectée", () => {
  // Le guide Shopify parle de Shopify, jamais de WordPress/Wix — et
  // réciproquement. Un guide qui cite une autre plateforme est un guide deviné.
  const foreign: Record<string, RegExp> = {
    shopify: /wordpress|woocommerce|wix|squarespace|prestashop/i,
    woocommerce: /shopify|wix|squarespace|prestashop/i,
    wix: /shopify|wordpress|woocommerce|squarespace|prestashop/i,
    squarespace: /shopify|wordpress|woocommerce|wix|prestashop/i,
    prestashop: /shopify|wordpress|woocommerce|wix|squarespace/i,
  };
  for (const platform of KNOWN_PLATFORMS) {
    for (const file of FILES) {
      for (const locale of LOCALES) {
        const guide = installGuide(file, platform, locale);
        const text = `${guide.where} ${guide.paste} ${guide.verify}`;
        assert.ok(!foreign[platform].test(text), `guide ${platform}/${file}/${locale} cite une autre plateforme`);
      }
    }
  }
});

test("le guide vérification est concret : il donne une URL ou une recherche à faire", () => {
  for (const platform of ALL_PLATFORMS) {
    for (const locale of LOCALES) {
      const llms = installGuide("llms", platform, locale);
      const robots = installGuide("robots", platform, locale);
      assert.ok(/llms\.txt/.test(llms.verify), `verify llms sans URL: ${platform}/${locale}`);
      assert.ok(/robots\.txt|crawler/i.test(robots.verify), `verify robots sans point de contrôle: ${platform}/${locale}`);
      const jsonld = installGuide("jsonld", platform, locale);
      assert.ok(/application\/ld\+json/.test(jsonld.verify), `verify jsonld sans recherche source: ${platform}/${locale}`);
    }
  }
});

test("le guide ne promet aucune fréquence codée en dur (la cadence vit dans plan-promises)", () => {
  const banned = /hebdo|weekly|chaque semaine|每|tous les 7|every week|monthly|chaque mois|mensuel/i;
  for (const platform of ALL_PLATFORMS) {
    for (const file of FILES) {
      for (const locale of LOCALES) {
        const guide = installGuide(file, platform, locale);
        const text = `${guide.where} ${guide.paste} ${guide.verify}`;
        assert.ok(!banned.test(text), `fréquence en dur dans ${platform}/${file}/${locale}`);
      }
    }
  }
});
