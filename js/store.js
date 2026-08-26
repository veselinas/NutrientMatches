// ============================================================
// DataStore — in-memory model for the three CSV-backed datasets
// ============================================================
// food_nutrients   : food -> set of nutrient keys it is rich in
// nutrient_matching: nutrient x nutrient -> compatible|incompatible|neutral
// meal_ideas       : meal -> ordered list of ingredient (food) keys
//
// All lookups are O(1)/O(small-set) via Maps and Sets, which keeps
// operations cheap even as nutrients/foods/meals grow.

class DataStore {
  constructor() {
    // --- food_nutrients ---
    this.nutrientOrder = [];              // ordered list of nutrient keys (CSV column order)
    this.nutrientDisplay = new Map();     // key -> display label
    this.foods = new Map();               // foodKey -> { display, nutrients: Set<nutrientKey> }
    this.foodOrder = [];                  // ordered list of food keys (CSV row order)

    // --- nutrient_matching ---
    // matrix.get(a).get(b) => 'compatible' | 'incompatible' | 'neutral'
    this.matrix = new Map();

    // --- meal_ideas ---
    this.meals = new Map();               // mealKey -> { display, ingredients: string[] (food keys) }
    this.mealOrder = [];
    this.maxIngredients = 0;

    // Pluggable compatibility rules for special cases (e.g. essential
    // amino acid complementarity for incomplete proteins). Keyed by
    // nutrient key; each rule is a function(store, nutrientKey) that
    // returns a Set of food keys considered "compatible" beyond / instead
    // of the plain nutrient_matching table. See rules.js.
    this.customCompatibilityRules = new Map();
  }

  // ---------- key helpers ----------
  ensureNutrientColumn(rawName) {
    const key = Utils.normalizeKey(rawName);
    if (!key) return null;
    if (!this.nutrientDisplay.has(key)) {
      this.nutrientOrder.push(key);
      this.nutrientDisplay.set(key, rawName.trim());
      // extend matrix with a neutral row/col against existing nutrients
      this.matrix.set(key, new Map());
    }
    return key;
  }

  nutrientLabel(key) {
    return this.nutrientDisplay.get(key) || Utils.prettify(key);
  }
  foodLabel(key) {
    const f = this.foods.get(key);
    return f ? f.display : Utils.prettify(key);
  }
  mealLabel(key) {
    const m = this.meals.get(key);
    return m ? m.display : Utils.prettify(key);
  }

  // ---------- food_nutrients ----------
  addFood(rawName, rawNutrientList) {
    const foodKey = Utils.normalizeKey(rawName);
    if (!foodKey) throw new Error("Food name is required.");
    const nutrientKeys = new Set();
    for (const n of rawNutrientList) {
      const k = this.ensureNutrientColumn(n);
      if (k) nutrientKeys.add(k);
    }
    if (!this.foods.has(foodKey)) this.foodOrder.push(foodKey);
    const existing = this.foods.get(foodKey);
    this.foods.set(foodKey, {
      display: rawName.trim(),
      nutrients: existing ? Utils.union(existing.nutrients, nutrientKeys) : nutrientKeys,
    });
    return foodKey;
  }

  foodsRichIn(nutrientKey) {
    const out = new Set();
    for (const [fk, f] of this.foods) if (f.nutrients.has(nutrientKey)) out.add(fk);
    return out;
  }
  foodsRichInAny(nutrientKeys) {
    const out = new Set();
    for (const [fk, f] of this.foods) {
      for (const nk of nutrientKeys) if (f.nutrients.has(nk)) { out.add(fk); break; }
    }
    return out;
  }
  // Foods that contain NONE of the given nutrients at all — e.g. if
  // calcium and magnesium are both incompatible with the target nutrient,
  // this returns foods with neither calcium nor magnesium (not just foods
  // missing one of the two).
  foodsFreeOfAll(nutrientKeys) {
    const keys = [...nutrientKeys];
    const out = new Set();
    for (const [fk, f] of this.foods) {
      const hasNone = keys.every((nk) => !f.nutrients.has(nk));
      if (hasNone) out.add(fk);
    }
    return out;
  }

  // ---------- nutrient_matching ----------
  setRelation(nutrientKey, otherKey, relation) {
    if (!this.matrix.has(nutrientKey)) this.matrix.set(nutrientKey, new Map());
    if (!this.matrix.has(otherKey)) this.matrix.set(otherKey, new Map());
    this.matrix.get(nutrientKey).set(otherKey, relation);
    this.matrix.get(otherKey).set(nutrientKey, relation); // symmetric
  }

  addNutrientRelations(rawName, compatibleList, incompatibleList) {
    const key = this.ensureNutrientColumn(rawName);
    for (const c of compatibleList) {
      const ck = this.ensureNutrientColumn(c);
      if (ck && ck !== key) this.setRelation(key, ck, "compatible");
    }
    for (const inc of incompatibleList) {
      const ik = this.ensureNutrientColumn(inc);
      if (ik && ik !== key) this.setRelation(key, ik, "incompatible");
    }
    return key;
  }

  relatedNutrients(nutrientKey, relation) {
    const out = new Set();
    const row = this.matrix.get(nutrientKey);
    if (!row) return out;
    for (const [other, rel] of row) if (rel === relation) out.add(other);
    return out;
  }
  compatibleNutrients(nutrientKey) { return this.relatedNutrients(nutrientKey, "compatible"); }
  incompatibleNutrients(nutrientKey) { return this.relatedNutrients(nutrientKey, "incompatible"); }

  // ---------- meal_ideas ----------
  addMeal(rawName, rawIngredientList) {
    const mealKey = Utils.normalizeKey(rawName);
    if (!mealKey) throw new Error("Meal name is required.");
    const ingredientKeys = rawIngredientList
      .map((f) => Utils.normalizeKey(f))
      .filter(Boolean);
    if (!this.meals.has(mealKey)) this.mealOrder.push(mealKey);
    this.meals.set(mealKey, { display: rawName.trim(), ingredients: ingredientKeys });
    this.maxIngredients = Math.max(this.maxIngredients, ingredientKeys.length);
    return mealKey;
  }

  // Meals whose ingredients overlap a given set of "good" food keys.
  // Returns meals sorted by how many of their ingredients are covered.
  suggestMealsFromFoodSet(foodKeySet, minOverlap = 2) {
    const results = [];
    for (const [mk, m] of this.meals) {
      const covered = m.ingredients.filter((ik) => foodKeySet.has(ik));
      if (covered.length >= Math.min(minOverlap, m.ingredients.length)) {
        results.push({ mealKey: mk, display: m.display, covered, total: m.ingredients.length });
      }
    }
    results.sort((a, b) => b.covered.length / b.total - a.covered.length / a.total);
    return results;
  }

  // ---------- compatibility rule hook (extensible) ----------
  registerCompatibilityRule(nutrientKey, ruleFn) {
    this.customCompatibilityRules.set(nutrientKey, ruleFn);
  }
  // Returns { compatibleFoods: Set, incompatibleFoods: Set } for a nutrient,
  // combining the plain nutrient_matching table with any custom rule.
  getFoodCompatibilitySets(nutrientKey) {
    const compatNutrients = this.compatibleNutrients(nutrientKey);
    const incompatNutrients = this.incompatibleNutrients(nutrientKey);
    let compatibleFoods = this.foodsRichInAny(compatNutrients);
    const incompatibleAvoidedFoods = this.foodsFreeOfAll(incompatNutrients);
    // Foods rich in at least one incompatible nutrient — the flip side
    // of incompatibleAvoidedFoods, surfaced as its own "avoid these" list.
    const incompatibleFoods = this.foodsRichInAny(incompatNutrients);
    const customRule = this.customCompatibilityRules.get(nutrientKey);
    if (customRule) {
      const extra = customRule(this, nutrientKey);
      if (extra instanceof Set) compatibleFoods = Utils.union(compatibleFoods, extra);
    }
    return { compatibleFoods, incompatibleAvoidedFoods, incompatibleFoods, compatNutrients, incompatNutrients };
  }
  // ---------- autocomplete ----------
  searchFoods(query) {
    const q = Utils.normalizeKey(query);
    const out = [];
    for (const fk of this.foodOrder) {
      if (!q || fk.includes(q) || this.foodLabel(fk).toLowerCase().includes(query.toLowerCase())) {
        out.push({ key: fk, label: this.foodLabel(fk) });
      }
    }
    return out.slice(0, 25);
  }
  searchNutrients(query) {
    const q = Utils.normalizeKey(query);
    const out = [];
    for (const nk of this.nutrientOrder) {
      if (nk.startsWith("aa_")) continue; // amino acids live in the Protein window instead
      if (!q || nk.includes(q) || this.nutrientLabel(nk).toLowerCase().includes(query.toLowerCase())) {
        out.push({ key: nk, label: this.nutrientLabel(nk) });
      }
    }
    return out.slice(0, 25);
  }

  // ================= CSV import / export =================
  toCSV_foodNutrients() {
    const header = ["food", ...this.nutrientOrder];
    const rows = this.foodOrder.map((fk) => {
      const f = this.foods.get(fk);
      return [f.display, ...this.nutrientOrder.map((nk) => (f.nutrients.has(nk) ? "1" : "0"))];
    });
    return CSV.stringify(header, rows);
  }

  toCSV_nutrientMatching() {
    const header = ["nutrient", ...this.nutrientOrder];
    const rows = this.nutrientOrder.map((rowKey) => {
      const rowLabel = this.nutrientLabel(rowKey);
      const cells = this.nutrientOrder.map((colKey) => {
        if (colKey === rowKey) return "";
        const rel = this.matrix.get(rowKey)?.get(colKey);
        return rel || "neutral";
      });
      return [rowLabel, ...cells];
    });
    return CSV.stringify(header, rows);
  }

  toCSV_mealIdeas() {
    const header = ["meal", ...Array.from({ length: this.maxIngredients }, (_, i) => `ingredient${i + 1}`)];
    const rows = this.mealOrder.map((mk) => {
      const m = this.meals.get(mk);
      const cells = Array.from({ length: this.maxIngredients }, (_, i) =>
        m.ingredients[i] ? this.foodLabel(m.ingredients[i]) : ""
      );
      return [m.display, ...cells];
    });
    return CSV.stringify(header, rows);
  }

  loadFromCSV_foodNutrients(text) {
    const { header, rows } = CSV.parse(text);
    if (!header.length) return;
    const nutrientCols = header.slice(1).map((h) => this.ensureNutrientColumn(h));
    for (const r of rows) {
      const [foodName, ...cells] = r;
      if (!foodName) continue;
      const rich = [];
      cells.forEach((v, i) => { if (String(v).trim() === "1") rich.push(this.nutrientLabel(nutrientCols[i])); });
      this.addFood(foodName, rich);
    }
  }

  loadFromCSV_nutrientMatching(text) {
    const { header, rows } = CSV.parse(text);
    if (!header.length) return;
    const cols = header.slice(1).map((h) => this.ensureNutrientColumn(h));
    for (const r of rows) {
      const [nutrientName, ...cells] = r;
      if (!nutrientName) continue;
      const rowKey = this.ensureNutrientColumn(nutrientName);
      cells.forEach((v, i) => {
        const rel = String(v).trim().toLowerCase();
        if (rel === "compatible" || rel === "incompatible") this.setRelation(rowKey, cols[i], rel);
      });
    }
  }

  loadFromCSV_mealIdeas(text) {
    const { header, rows } = CSV.parse(text);
    if (!header.length) return;
    for (const r of rows) {
      const [mealName, ...cells] = r;
      if (!mealName) continue;
      const ingredients = cells.map((v) => String(v || "").trim()).filter(Boolean);
      this.addMeal(mealName, ingredients);
    }
  }
}
