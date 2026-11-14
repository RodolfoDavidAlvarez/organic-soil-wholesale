import assert from "node:assert/strict";

// Mirror of client/src/lib/callTracking.ts for a lightweight Node check.
function isCallTrackingExcludedPath(pathname, search = "") {
  const path = pathname || "/";
  const source = new URLSearchParams(search).get("source");

  return (
    path.startsWith("/rep/") ||
    path === "/free-worm-castings" ||
    path === "/survey" ||
    path.startsWith("/survey/") ||
    (path === "/newsletter" && source === "july-community-gift") ||
    path === "/qr" ||
    path === "/check-in" ||
    path === "/yard-map" ||
    path === "/checkout" ||
    path === "/order-confirmation" ||
    path.startsWith("/pay-and-pickup") ||
    path.startsWith("/drive-through") ||
    path.startsWith("/admin/outreach")
  );
}

assert.equal(isCallTrackingExcludedPath("/products/mikeys-worm-poop"), false);
assert.equal(isCallTrackingExcludedPath("/"), false);
assert.equal(isCallTrackingExcludedPath("/about"), false);
assert.equal(isCallTrackingExcludedPath("/checkout"), true);
assert.equal(isCallTrackingExcludedPath("/yard-map"), true);
assert.equal(isCallTrackingExcludedPath("/pay-and-pickup/1"), true);
assert.equal(isCallTrackingExcludedPath("/rep/alejandra"), true);
assert.equal(isCallTrackingExcludedPath("/newsletter"), false);
assert.equal(isCallTrackingExcludedPath("/newsletter", "?source=july-community-gift"), true);
assert.equal(isCallTrackingExcludedPath("/free-worm-castings"), true);
assert.equal(isCallTrackingExcludedPath("/survey"), true);
assert.equal(isCallTrackingExcludedPath("/survey/garden-class"), true);
assert.equal(isCallTrackingExcludedPath("/admin/outreach"), true);

console.log("call-tracking path exclusions: ok");
