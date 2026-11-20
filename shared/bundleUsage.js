// Coverage uses the catalog's total volume, before settling. See docs/marketing/bundle-videos.
const guidance = {
  "/products/plantpal": {
    purpose: "A ready-to-use potting mix for raised beds, pots and planters. Fill, plant and water it in.",
    nextUse: "Top up as the soil settles between growing seasons.",
  },
  "/products/simons-gold": {
    purpose: "Dairy compost that adds organic matter and slowly releases nutrients into your soil.",
    depth: 1,
    weightPerBag: 50,
    nextUse: "Plan for spring and fall top-ups, as needed.",
  },
  "/products/mikeys-worm-poop": {
    purpose: "Worm castings that support soil life around growing roots. Mix them into the planting area or sprinkle them around established plants.",
    depth: 0.5,
    weightPerBag: 45,
    nextUse: "Use at planting; topdress again as plants need it.",
  },
  "/products/natures-blanket-premium": {
    purpose: "Spread this mulch over the soil to hold in moisture and limit weeds. As it breaks down, it returns nutrients to the soil.",
    depth: 2,
    nextUse: "Top up when the layer thins. Keep stems clear.",
  },
};

export function getBundleUsage(item) {
  const guide = guidance[item?.href];
  const quantities = item?.amount.match(/^(\d+) bags? · ([\d.]+) cu ft/);
  if (!guide || !quantities) return null;
  const bags = Number(quantities[1]);
  const volume = Number(quantities[2]);
  if (bags <= 0 || volume <= 0) return null;
  const perBag = `${volume / bags} cu ft per bag${guide.weightPerBag ? ` · approx. ${guide.weightPerBag} lb` : ""}`;
  if (item.href === "/products/plantpal") {
    const beds = volume >= 32 ? 2 : 1;
    const depth = Math.floor((volume * 12 / (beds * 32)) * 2) / 2;
    const depthText = String(depth).replace(".5", "½");
    return {
      ...guide, bags, volume, perBag,
      coverage: `${beds === 1 ? "One" : "Two"} 4×8 ${beds === 1 ? "bed" : "beds"}`,
      application: `About ${depthText} in of growing mix${beds > 1 ? " in each" : ""}.`,
    };
  }
  const area = Math.floor(volume * 12 / guide.depth);
  return {
    ...guide, bags, volume, perBag,
    coverage: `Covers about ${area} sq ft`,
    application: `At ${guide.depth === 0.5 ? "½" : guide.depth} in deep${guide.depth === 2 ? "." : " as a topdressing."}`,
  };
}
