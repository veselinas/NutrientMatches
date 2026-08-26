// ============================================================
// Custom compatibility rules
// ============================================================
// Amino acid nutrient columns are expected to be named with an "aa_"
// prefix in your dataset (e.g. "aa_lysine", "aa_leucine", ...). That
// prefix is how the UI knows to treat them specially: they're hidden
// from the regular nutrient dropdown/food-view blocks, and instead
// summarised in a single "Protein" window (see ui.js) that shows
// whether a food is a complete protein on its own, or which other
// foods would complete it.

const ESSENTIAL_AMINO_ACIDS = [
  "aa_histidine", "aa_isoleucine", "aa_leucine", "aa_lysine",
  "aa_methionine", "aa_phenylalanine", "aa_threonine", "aa_tryptophan", "aa_valine",
];

function isAminoAcidKey(key) {
  return typeof key === "string" && key.startsWith("aa_");
}

// "aa_histidine" -> "Histidine"
function formatAminoAcidLabel(key) {
  return Utils.prettify(key.replace(/^aa_/, ""));
}

function registerBuiltInRules(store) {
  // For any nutrient that is itself an essential amino acid, treat a
  // food as "compatible" if combining it with the target food's amino
  // acid profile would cover all 9 essential amino acids (i.e. it's a
  // complementary incomplete-protein partner). Kept for completeness /
  // extensibility even though the UI no longer routes amino acids
  // through the regular nutrient view.
  for (const aminoKey of ESSENTIAL_AMINO_ACIDS) {
    store.registerCompatibilityRule(aminoKey, (s /*, nutrientKey */) => {
      return completeProteinPartners(s);
    });
  }
}

// Returns the set of essential-amino-acid keys actually present in this
// store's nutrient list (so it degrades gracefully if the user hasn't
// entered all 9 yet).
function presentAminoAcidKeys(store) {
  return ESSENTIAL_AMINO_ACIDS.filter((k) => store.nutrientDisplay.has(k));
}

// All aa_-prefixed nutrient keys a given food is rich in (not limited
// to the tracked essential 9 — any amino acid column the food has).
function foodAminoAcidKeys(store, foodKey) {
  const food = store.foods.get(foodKey);
  if (!food) return [];
  return [...food.nutrients].filter(isAminoAcidKey);
}

// A food counts as a "complete protein" once it covers every essential
// amino acid column currently tracked in the store. Returns null if no
// amino acid columns are tracked yet (can't judge either way).
function isCompleteProtein(store, foodKey) {
  const tracked = presentAminoAcidKeys(store);
  if (tracked.length === 0) return null;
  const food = store.foods.get(foodKey);
  if (!food) return null;
  return tracked.every((a) => food.nutrients.has(a));
}

// A food is only useful for pairing if it's missing at least one
// tracked amino acid (otherwise it's already a complete protein on
// its own). Returns the set of food keys that, unioned with ANY other
// single food in the store, would cover every tracked essential amino
// acid — used as the "compatible" set for amino-acid nutrients.
function completeProteinPartners(store) {
  const tracked = presentAminoAcidKeys(store);
  const partners = new Set();
  if (tracked.length === 0) return partners;
  const foodEntries = [...store.foods.entries()];
  for (let i = 0; i < foodEntries.length; i++) {
    for (let j = 0; j < foodEntries.length; j++) {
      if (i === j) continue;
      const [, a] = foodEntries[i];
      const [bKey, b] = foodEntries[j];
      const covered = tracked.every((amino) => a.nutrients.has(amino) || b.nutrients.has(amino));
      if (covered) partners.add(bKey);
    }
  }
  return partners;
}

// Public helper used by the food view's Protein window: which foods,
// added to this one, would cover every tracked essential amino acid.
function findCompleteProteinPairs(store, foodKey) {
  const tracked = presentAminoAcidKeys(store);
  if (tracked.length === 0) return [];
  const target = store.foods.get(foodKey);
  if (!target) return [];
  const missing = tracked.filter((a) => !target.nutrients.has(a));
  if (missing.length === 0) return []; // already a complete protein
  const out = [];
  for (const [otherKey, other] of store.foods) {
    if (otherKey === foodKey) continue;
    if (missing.every((a) => other.nutrients.has(a))) {
      out.push({ key: otherKey, label: store.foodLabel(otherKey) });
    }
  }
  return out;
}
