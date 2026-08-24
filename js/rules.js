// ============================================================
// Custom compatibility rules
// ============================================================
// The default compatibility logic (see DataStore.getFoodCompatibilitySets)
// just reads the nutrient_matching table. Some nutrients need smarter
// logic — the canonical example from the brief is essential amino acids:
// two "incomplete" protein foods can be combined if, together, their
// amino acid profiles cover all 9 essential amino acids, even if no
// single compatible/incompatible pair is marked in nutrient_matching.
//
// This file is intentionally a thin, editable extension point: add the
// amino acid nutrient columns you use in your food_nutrients dataset
// (they just need to be entered like any other nutrient, e.g.
// "Lysine", "Leucine", ...) and list their keys below.

const ESSENTIAL_AMINO_ACIDS = [
  "histidine", "isoleucine", "leucine", "lysine",
  "methionine", "phenylalanine", "threonine", "tryptophan", "valine",
];

function registerBuiltInRules(store) {
  // For any nutrient that is itself an essential amino acid, treat a
  // food as "compatible" if combining it with the target food's amino
  // acid profile would cover all 9 essential amino acids (i.e. it's a
  // complementary incomplete-protein partner).
  for (const aminoKey of ESSENTIAL_AMINO_ACIDS) {
    store.registerCompatibilityRule(aminoKey, (s /*, nutrientKey */) => {
      return completeProteinPartners(s);
    });
  }
}

// Returns the set of amino-acid keys actually present in this store's
// nutrient list (so it degrees gracefully if the user hasn't entered
// all 9 yet).
function presentAminoAcidKeys(store) {
  return ESSENTIAL_AMINO_ACIDS.filter((k) => store.nutrientDisplay.has(k));
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
      const [aKey, a] = foodEntries[i];
      const [bKey, b] = foodEntries[j];
      const covered = tracked.every((amino) => a.nutrients.has(amino) || b.nutrients.has(amino));
      if (covered) partners.add(bKey);
    }
  }
  return partners;
}

// Public helper used by the UI's "Find complementary proteins" action.
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
