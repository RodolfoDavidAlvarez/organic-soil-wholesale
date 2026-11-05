import test from "node:test";
import assert from "node:assert/strict";
import { PROMO_BUNDLES } from "../shared/promoBundles.js";
import { getBundleUsage } from "../shared/bundleUsage.js";

test("all catalog products have coverage, correct package sizes, and reconciled totals", () => {
  const sizes = { plantpal: 1.5, "simons-gold": 1, "mikeys-worm-poop": 1, "natures-blanket-premium": 2 };
  for (const bundle of PROMO_BUNDLES) {
    let volume = 0, bags = 0;
    for (const item of bundle.items) {
      const usage = getBundleUsage(item);
      assert.ok(usage, item.name);
      assert.equal(usage.volume / usage.bags, sizes[item.href.split("/").at(-1)]);
      volume += usage.volume;
      bags += usage.bags;
    }
    assert.equal(bags, parseInt(bundle.bagLabel));
    assert.equal(volume, parseFloat(bundle.volumeLabel));
  }
});

test("coverage converts cubic feet to the stated depth without counting mulch as growing mix", () => {
  const expected = {
    "garden-refresh": ["Covers about 60 sq ft", "Covers about 36 sq ft", "Covers about 48 sq ft"],
    "garden-refresh-plus": ["One 4×8 bed", "Covers about 36 sq ft", "Covers about 72 sq ft"],
    "big-garden-setup": ["Two 4×8 beds", "Covers about 48 sq ft", "Covers about 72 sq ft", "Covers about 36 sq ft"],
  };
  for (const bundle of PROMO_BUNDLES) {
    assert.deepEqual(bundle.items.map(item => getBundleUsage(item).coverage), expected[bundle.slug]);
  }
  assert.equal(getBundleUsage(PROMO_BUNDLES[1].items[0]).application, "About 5½ in of growing mix.");
  assert.equal(getBundleUsage(PROMO_BUNDLES[2].items[0]).application, "About 8 in of growing mix in each.");
});

test("unsupported or malformed quantities do not produce a misleading estimate", () => {
  assert.equal(getBundleUsage(undefined), null);
  assert.equal(getBundleUsage({ href: "/products/simons-gold", amount: "Included" }), null);
  assert.equal(getBundleUsage({ href: "/unknown", amount: "3 bags · 3 cu ft" }), null);
});
