// ============================================================
// UI — wires the DOM: header/footer, add-modals, search bar,
// and the main Venn-diagram views.
// ============================================================
const UI = (() => {
  let store = null;
  let onDataChanged = () => {}; // called after any add-* action, for saving

  // "Macro" mode's second dropdown is a fixed list rather than a search
  // box. candidates are tried in order against the store's actual
  // nutrient keys (so British/American spelling differences, e.g.
  // "fibre" vs "fiber", both resolve if either is present).
  const MACRO_OPTIONS = [
    { value: "water", label: "Water", candidates: ["water"] },
    { value: "fat", label: "Fat", candidates: ["fat"] }, // handled specially: one list per *_fat column
    { value: "fiber", label: "Fibre", candidates: ["fibre", "fiber"] },
    { value: "gut_bacteria", label: "Gut Bacteria", candidates: ["gut_bacteria"] },
    { value: "antioxidants", label: "Antioxidants", candidates: ["antioxidants", "antioxidant"] },
  ];

  function resolveNutrientKey(candidates) {
    for (const c of candidates) {
      const k = Utils.normalizeKey(c);
      if (store.nutrientDisplay.has(k)) return k;
    }
    return Utils.normalizeKey(candidates[0]);
  }

  function init(dataStore, changedCallback) {
    store = dataStore;
    onDataChanged = changedCallback || onDataChanged;
    initFooterButtons();
    initSearchBar();
    renderEmptyState();
  }

  // ---------------- header / auth status ----------------
  function renderAuthStatus() {
    const el = document.getElementById("auth-status");
    const btn = document.getElementById("auth-button");
    if (Auth.isSignedIn()) {
      const acc = Auth.getAccount();
      el.textContent = acc.username || acc.name || "Signed in";
      btn.textContent = "Sign out";
      btn.onclick = () => Auth.logout();
    } else {
      el.textContent = "Not signed in \u2014 data stays on this device";
      btn.textContent = "Sign in with Microsoft";
      btn.onclick = () => Auth.login();
    }
  }

  function setSyncStatus(text, isError = false) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("sync-error", isError);
  }

  // ---------------- generic modal ----------------
  function openModal(title, bodyHtml, onSubmit) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <form class="modal" id="modal-form">
          <div class="modal-head">
            <h2>${Utils.escapeHtml(title)}</h2>
            <button type="button" class="modal-close" id="modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>`;
    const close = () => { root.innerHTML = ""; };
    document.getElementById("modal-close").onclick = close;
    document.getElementById("modal-cancel").onclick = close;
    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") close();
    });
    document.getElementById("modal-form").addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        onSubmit(new FormData(e.target));
        close();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

  function nutrientDatalist() {
    return `<datalist id="nutrient-options">${store.nutrientOrder
      .map((k) => `<option value="${Utils.escapeHtml(store.nutrientLabel(k))}">`)
      .join("")}</datalist>`;
  }
  function foodDatalist() {
    return `<datalist id="food-options">${store.foodOrder
      .map((k) => `<option value="${Utils.escapeHtml(store.foodLabel(k))}">`)
      .join("")}</datalist>`;
  }

  function splitList(str) {
    return String(str || "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  // ---------------- footer buttons ----------------
  function initFooterButtons() {
    document.getElementById("btn-add-nutrient").onclick = () => {
      openModal(
        "Add nutrient",
        `<label>Nutrient name
           <input name="name" required placeholder="e.g. Vitamin C" />
         </label>
         <label>Compatible nutrients <span class="hint">comma separated</span>
           <input name="compatible" list="nutrient-options" placeholder="e.g. Iron" />
         </label>
         <label>Incompatible nutrients <span class="hint">comma separated</span>
           <input name="incompatible" list="nutrient-options" placeholder="e.g. Calcium" />
         </label>
         ${nutrientDatalist()}`,
        (fd) => {
          store.addNutrientRelations(
            fd.get("name"),
            splitList(fd.get("compatible")),
            splitList(fd.get("incompatible"))
          );
          onDataChanged();
          refreshCurrentView();
        }
      );
    };

    document.getElementById("btn-add-food").onclick = () => {
      openModal(
        "Add food",
        `<label>Food name
           <input name="name" required placeholder="e.g. Spinach" />
         </label>
         <label>Rich in nutrients <span class="hint">comma separated</span>
           <input name="nutrients" list="nutrient-options" placeholder="e.g. Iron, Folate" />
         </label>
         ${nutrientDatalist()}`,
        (fd) => {
          store.addFood(fd.get("name"), splitList(fd.get("nutrients")));
          onDataChanged();
          refreshCurrentView();
        }
      );
    };

    document.getElementById("btn-add-meal").onclick = () => {
      openModal(
        "Add meal",
        `<label>Meal name
           <input name="name" required placeholder="e.g. Spinach & apple salad" />
         </label>
         <label>Ingredients <span class="hint">comma separated, foods</span>
           <input name="ingredients" list="food-options" required placeholder="e.g. Spinach, Apple" />
         </label>
         ${foodDatalist()}`,
        (fd) => {
          store.addMeal(fd.get("name"), splitList(fd.get("ingredients")));
          onDataChanged();
        }
      );
    };
  }

  // ---------------- search bar: text+autocomplete (nutrient/food) or fixed dropdown (macro) ----------------
  let currentSelection = { mode: "nutrient", key: null };

  function textSearchMarkup(placeholder) {
    return `
      <input id="search-input" type="text" autocomplete="off" placeholder="${Utils.escapeHtml(placeholder)}" aria-label="Search" />
      <ul id="search-suggestions" role="listbox" hidden></ul>`;
  }

  function macroSelectMarkup() {
    return `
      <select id="macro-select" aria-label="Macro category">
        <option value="" selected disabled>Choose a macro\u2026</option>
        ${MACRO_OPTIONS.map((o) => `<option value="${o.value}">${Utils.escapeHtml(o.label)}</option>`).join("")}
      </select>`;
  }

  function bindTextSearch(modeSelect) {
    const input = document.getElementById("search-input");
    const suggestions = document.getElementById("search-suggestions");
    const runSearch = () => {
      const q = input.value;
      const results = modeSelect.value === "food" ? store.searchFoods(q) : store.searchNutrients(q);
      if (!results.length) { suggestions.innerHTML = ""; suggestions.hidden = true; return; }
      suggestions.innerHTML = results
        .map((r) => `<li role="option" data-key="${r.key}">${Utils.escapeHtml(r.label)}</li>`)
        .join("");
      suggestions.hidden = false;
    };
    input.addEventListener("input", Utils.debounce(runSearch, 120));
    input.addEventListener("focus", runSearch);
    suggestions.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-key]");
      if (!li) return;
      const key = li.getAttribute("data-key");
      input.value = li.textContent;
      suggestions.hidden = true;
      currentSelection = { mode: modeSelect.value, key };
      renderSelection();
    });
  }

  function bindMacroSelect() {
    const select = document.getElementById("macro-select");
    select.addEventListener("change", () => {
      if (!select.value) return;
      currentSelection = { mode: "macro", key: select.value };
      renderSelection();
    });
  }

  function initSearchBar() {
    const modeSelect = document.getElementById("mode-select");
    const wrap = document.getElementById("search-input-wrap");

    const rebuildWrap = () => {
      if (modeSelect.value === "macro") {
        wrap.innerHTML = macroSelectMarkup();
        bindMacroSelect();
      } else {
        wrap.innerHTML = textSearchMarkup(
          modeSelect.value === "food" ? "Start typing a food, e.g. Spinach\u2026" : "Start typing a nutrient, e.g. Iron\u2026"
        );
        bindTextSearch(modeSelect);
      }
    };

    modeSelect.addEventListener("change", () => {
      currentSelection = { mode: modeSelect.value, key: null };
      rebuildWrap();
      renderEmptyState();
    });

    rebuildWrap();

    document.addEventListener("click", (e) => {
      const suggestions = document.getElementById("search-suggestions");
      const input = document.getElementById("search-input");
      if (suggestions && input && !suggestions.contains(e.target) && e.target !== input) suggestions.hidden = true;
    });
  }

  function refreshCurrentView() {
    if (currentSelection.key) renderSelection();
  }

  function renderEmptyState() {
    document.getElementById("main-content").innerHTML = `
      <div class="empty-state">
        <p>Choose <strong>food</strong> or <strong>nutrient</strong>, then start typing to see
        which combinations help you absorb more of it \u2014 and which ones get in the way.</p>
      </div>`;
  }

  function renderSelection() {
    if (currentSelection.mode === "nutrient") renderNutrientView(currentSelection.key);
    else if (currentSelection.mode === "macro") renderMacroView(currentSelection.key);
    else renderFoodView(currentSelection.key);
  }

  // ---------------- macro view: plain rich-in lists ----------------
  function macroListBlockHtml(label, foodKeySet) {
    return `
      <div class="nutrient-block">
        <h3>${Utils.escapeHtml(label)} <span class="count-badge">${foodKeySet.size}</span></h3>
        ${foodKeySet.size
          ? `<ul class="food-list">${[...foodKeySet]
              .map((k) => `<li>${Utils.escapeHtml(store.foodLabel(k))}</li>`)
              .join("")}</ul>`
          : `<p class="hint">No foods recorded as rich in ${Utils.escapeHtml(label.toLowerCase())} yet.</p>`}
      </div>`;
  }

  function renderMacroView(macroValue) {
    const main = document.getElementById("main-content");
    const opt = MACRO_OPTIONS.find((o) => o.value === macroValue);
    if (!opt) { renderEmptyState(); return; }

    if (macroValue === "fat") {
      renderFatView(main);
      return;
    }

    const nutrientKey = resolveNutrientKey(opt.candidates);
    const richFoods = store.foodsRichIn(nutrientKey);
    main.innerHTML = `
      <div class="view-header"><h2>${Utils.escapeHtml(opt.label)}</h2></div>
      ${macroListBlockHtml(`Rich in ${opt.label}`, richFoods)}
    `;
  }

  // "Fat" is special: every nutrient column named "fat" or ending in
  // "_fat" (e.g. saturated_fat) is its own type, each gets its own list.
  function renderFatView(main) {
    const fatKeys = store.nutrientOrder.filter((k) => k === "fat" || k.endsWith("_fat"));
    main.innerHTML = `<div class="view-header"><h2>Fat</h2></div><div id="fat-blocks"></div>`;
    const holder = document.getElementById("fat-blocks");
    if (fatKeys.length === 0) {
      holder.innerHTML = `<p class="empty-state">No fat-type nutrients recorded yet (columns named "fat" or ending in "_fat", e.g. saturated_fat).</p>`;
      return;
    }
    for (const fk of fatKeys) {
      holder.insertAdjacentHTML("beforeend", macroListBlockHtml(store.nutrientLabel(fk), store.foodsRichIn(fk)));
    }
  }

  // ---------------- nutrient view: foods-rich-in list + 2-circle venn ----------------
  function renderNutrientView(nutrientKey) {
    const main = document.getElementById("main-content");
    const label = store.nutrientLabel(nutrientKey);
    const richFoods = store.foodsRichIn(nutrientKey);
    const { compatibleFoods, incompatibleAvoidedFoods, incompatibleFoods, compatNutrients, incompatNutrients } =
      store.getFoodCompatibilitySets(nutrientKey);
    const noInteractions = compatNutrients.size === 0 && incompatNutrients.size === 0;

    main.innerHTML = `
      <div class="view-header">
        <h2>${Utils.escapeHtml(label)}</h2>
        <p class="view-sub">
          Boosted by: ${listOrDash(compatNutrients, (k) => store.nutrientLabel(k))} &middot;
          Blocked by: ${listOrDash(incompatNutrients, (k) => store.nutrientLabel(k))}
        </p>
      </div>
      <div class="nutrient-block">
        <h3>Rich in ${Utils.escapeHtml(label)} <span class="count-badge">${richFoods.size}</span></h3>
        ${richFoods.size
          ? `<ul class="food-list">${[...richFoods]
              .map((k) => `<li>${Utils.escapeHtml(store.foodLabel(k))}</li>`)
              .join("")}</ul>`
          : `<p class="hint">No foods recorded as rich in this nutrient yet.</p>`}
      </div>
      ${noInteractions
        ? allClearHtml()
        : `<div id="venn-holder" class="venn-holder"></div>
           <div id="region-detail" class="region-detail"></div>
           ${incompatibleBlockHtml(incompatibleFoods, `Foods to avoid pairing with ${label}`)}`}
      <div id="meal-suggestions" class="meal-suggestions"></div>
    `;

    let bestPairings = richFoods;
    if (!noInteractions) {
      const regions = Venn.render2(document.getElementById("venn-holder"), {
        aLabel: "Absorption boosters",
        bLabel: "Absorption blockers avoided",
        aSet: compatibleFoods,
        bSet: incompatibleAvoidedFoods,
        onRegionClick: (region, set) => renderRegionDetail(region, set, {
          onlyA: "Boosters only",
          onlyB: "Blockers avoided only",
          ab: `Best pairing for ${label}`,
        }[region]),
      });
      bestPairings = Utils.union(regions.ab, richFoods);
    }

    // Best-matched foods for meal ideas: the target-nutrient-rich foods
    // themselves, plus (when relevant) the complementary pairing foods
    // that both boost absorption and avoid blockers.
    renderMealSuggestions(document.getElementById("meal-suggestions"), bestPairings);
  }

  // ---------------- food view: one 2-circle venn per (non-amino) nutrient ----------------
  function renderFoodView(foodKey) {
    const main = document.getElementById("main-content");
    const food = store.foods.get(foodKey);
    if (!food) { renderEmptyState(); return; }
    const label = food.display;
    // Amino acids get their own consolidated Protein window instead of
    // a regular per-nutrient block.
    const nutrientKeys = [...food.nutrients].filter((k) => !isAminoAcidKey(k));
    const aminoKeys = foodAminoAcidKeys(store, foodKey);

    main.innerHTML = `
      <div class="view-header">
        <h2>${Utils.escapeHtml(label)}</h2>
        <p class="view-sub">Rich in: ${listOrDash(new Set(nutrientKeys), (k) => store.nutrientLabel(k))}</p>
      </div>
      <div id="food-venn-list"></div>
      <div id="meal-suggestions-food" class="meal-suggestions"></div>
    `;

    const listEl = document.getElementById("food-venn-list");
    let allBest = new Set();

    if (nutrientKeys.length === 0 && aminoKeys.length === 0) {
      listEl.innerHTML = `<p class="empty-state">No nutrients recorded for this food yet. Use "Add nutrient" / edit via "Add food" to add some.</p>`;
    }

    for (const nk of nutrientKeys) {
      const nLabel = store.nutrientLabel(nk);
      const { compatibleFoods, incompatibleAvoidedFoods, incompatibleFoods, compatNutrients, incompatNutrients } =
        store.getFoodCompatibilitySets(nk);
      const noInteractions = compatNutrients.size === 0 && incompatNutrients.size === 0;
      const block = document.createElement("div");
      block.className = "nutrient-block";
      block.innerHTML = `<h3>${Utils.escapeHtml(nLabel)}</h3>
        <p class="hint">
          Boosted by: ${listOrDash(compatNutrients, (k) => store.nutrientLabel(k))} &middot;
          Blocked by: ${listOrDash(incompatNutrients, (k) => store.nutrientLabel(k))}
        </p>
        ${noInteractions
          ? allClearHtml()
          : `<div class="venn-holder" data-nk="${nk}"></div>
             <div class="region-detail" data-detail-for="${nk}"></div>
             ${incompatibleBlockHtml(incompatibleFoods, `Foods to avoid pairing with ${nLabel}`)}`}`;
      listEl.appendChild(block);

      if (!noInteractions) {
        const holder = block.querySelector(".venn-holder");
        const detail = block.querySelector(`[data-detail-for="${nk}"]`);
        const regions = Venn.render2(holder, {
          aLabel: "Boosts absorption",
          bLabel: "Blockers avoided",
          aSet: compatibleFoods,
          bSet: incompatibleAvoidedFoods,
          onRegionClick: (region, set) => renderRegionDetailInto(detail, region, set, {
            onlyA: "Boosts absorption only",
            onlyB: "Avoids blockers only",
            ab: `Best pairing for ${nLabel}`,
          }[region]),
        });
        allBest = Utils.union(allBest, regions.ab);
      }
    }

    if (aminoKeys.length > 0) {
      listEl.insertAdjacentHTML("beforeend", proteinWindowHtml(store, foodKey));
      const complete = isCompleteProtein(store, foodKey);
      if (!complete) {
        const partners = findCompleteProteinPairs(store, foodKey);
        allBest = Utils.union(allBest, new Set(partners.map((p) => p.key)));
      }
    }

    renderMealSuggestions(
      document.getElementById("meal-suggestions-food"),
      Utils.union(allBest, new Set([foodKey]))
    );
  }

  function listOrDash(set, labelFn) {
    if (!set || set.size === 0) return "\u2014";
    return [...set].map((k) => `<span class="chip">${Utils.escapeHtml(labelFn(k))}</span>`).join(" ");
  }

  function incompatibleBlockHtml(foodKeySet, title) {
    const items = [...foodKeySet].map((k) => `<li>${Utils.escapeHtml(store.foodLabel(k))}</li>`);
    return `
      <div class="incompatible-block">
        <h4>${Utils.escapeHtml(title)} <span class="count-badge count-badge-danger">${foodKeySet.size}</span></h4>
        ${items.length ? `<ul class="food-list">${items.join("")}</ul>` : `<p class="hint">None recorded.</p>`}
      </div>`;
  }

    // Shown instead of the venn diagram + incompatible-foods block when a
  // nutrient has no compatible or incompatible nutrients at all.
  function allClearHtml(message = "No known boosters or blockers") {
    return `
      <div class="all-clear">
        <svg viewBox="0 0 120 120" class="all-clear-icon" aria-hidden="true">
          <circle cx="60" cy="60" r="52" class="all-clear-circle" />
          <path d="M36 62 L52 78 L86 40" class="all-clear-check" />
        </svg>
        <p class="hint">${Utils.escapeHtml(message)}</p>
      </div>`;
  }

  // Single consolidated window replacing individual per-amino-acid
  // blocks: shows whether a food is a complete protein, and if not,
  // which amino acids it does have plus which foods would complete it.
  function proteinWindowHtml(store, foodKey) {
    const aminoKeys = foodAminoAcidKeys(store, foodKey);
    if (aminoKeys.length === 0) return "";
    const complete = isCompleteProtein(store, foodKey);
    const presentChips = aminoKeys
      .map((k) => `<span class="chip">${Utils.escapeHtml(formatAminoAcidLabel(k))}</span>`)
      .join(" ");

    if (complete) {
      return `
        <div class="nutrient-block protein-block">
          <h3>Protein</h3>
          <p class="hint">Amino acids present: ${presentChips}</p>
          ${allClearHtml("Complete protein \u2014 covers all essential amino acids")}
        </div>`;
    }

    const partners = findCompleteProteinPairs(store, foodKey);
    const items = partners.map((p) => `<li>${Utils.escapeHtml(p.label)}</li>`);
    return `
      <div class="nutrient-block protein-block">
        <h3>Protein</h3>
        <p class="hint">Amino acids present: ${presentChips}</p>
        <div class="protein-pairs-block">
          <h4>Combine with to complete the protein <span class="count-badge count-badge-positive">${partners.length}</span></h4>
          ${items.length ? `<ul class="food-list">${items.join("")}</ul>` : `<p class="hint">No matching foods recorded yet.</p>`}
        </div>
      </div>`;
  }

  function renderRegionDetail(region, foodKeySet, title) {
    renderRegionDetailInto(document.getElementById("region-detail"), region, foodKeySet, title);
  }
  function renderRegionDetailInto(container, region, foodKeySet, title) {
    if (!container) return;
    const items = [...foodKeySet].map((k) => `<li>${Utils.escapeHtml(store.foodLabel(k))}</li>`);
    container.innerHTML = `
      <h4>${Utils.escapeHtml(title)} <span class="count-badge">${foodKeySet.size}</span></h4>
      ${items.length ? `<ul class="food-list">${items.join("")}</ul>` : `<p class="hint">No foods here yet.</p>`}
    `;
  }

  // ---------------- meal suggestions (from Venn intersection) ----------------
  function renderMealSuggestions(container, foodKeySet) {
    if (!container) return;
    const suggestions = store.suggestMealsFromFoodSet(foodKeySet, 2);
    if (!suggestions.length) {
      container.innerHTML = `<h3>Meal ideas</h3><p class="hint">No saved meals match this combination yet \u2014 add one with "Add meal".</p>`;
      return;
    }
    container.innerHTML = `<h3>Meal ideas from this match</h3>
      <ul class="meal-list">
        ${suggestions
          .slice(0, 6)
          .map(
            (s) => `<li><strong>${Utils.escapeHtml(s.display)}</strong>
              <span class="hint">${s.covered.length}/${s.total} matched ingredients</span></li>`
          )
          .join("")}
      </ul>`;
  }

  return { init, renderAuthStatus, setSyncStatus, refreshCurrentView };
})();
