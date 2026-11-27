import assert from "node:assert/strict";
import test from "node:test";
import { formatDisplayLabel } from "../shared/formatDisplayLabel.js";

test("canonical bag and tote keys become the product-page labels", () => {
  assert.equal(formatDisplayLabel(1001, "1CF Bag"), "40 lb Bag (1 cu ft)");
  assert.equal(formatDisplayLabel(1001, "Tote"), "Super Sack");
  assert.equal(formatDisplayLabel(1000, "1CF Bag"), "1 cu ft Bag (~50 lb)");
  assert.equal(formatDisplayLabel(111, "Tote"), "Super Sack");
  assert.equal(formatDisplayLabel(1001, "9lb Bag"), "9 lb Bag");
  assert.equal(formatDisplayLabel(1001, "Pallet (144 x 9lb)"), "Pallet (144 x 9lb)");
});
