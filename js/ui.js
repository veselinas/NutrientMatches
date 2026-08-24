// ============================================================
// UI — wires the DOM: header/footer, add-modals, search bar,
// and the main Venn-diagram views.
// ============================================================
const UI = (() => {
  let store = null;
  let onDataChanged = () => {}; // called after any add-* action, for saving

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

  // ---------------- search bar + autocomplete ----------------
  let currentSelection = { mode: "nutrient", key: null };

  function initSearchBar() {
    const modeSelect = document.getElementById("mode-select");
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

    modeSelect.addEventListener("change", () => {
      input.value = "";
      suggestions.hidden = true;
      renderEmptyState();
    });

    input.addEventListener("input", Utils.debounce(runSearch, 120));
    input.addEventListener("focus", runSearch);
    document.addEventListener("click", (e) => {
      if (!suggestions.contains(e.target) && e.target !== input) suggestions.hidden = true;
    });

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
    else renderFoodView(currentSelection.key);
  }

  // ---------------- nutrient view: 3-circle venn ----------------
  function renderNutrientView(nutrientKey) {
    const main = document.getElementById("main-content");
    const label = store.nutrientLabel(nutrientKey);
    const richFoods = store.foodsRichIn(nutrientKey);
    const { compatibleFoods, incompatibleAvoidedFoods, compatNutrients, incompatNutrients } =
      store.getFoodCompatibilitySets(nutrientKey);

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
      <div id="venn-holder" class="venn-holder"></div>
      <div id="region-detail" class="region-detail"></div>
      <div id="meal-suggestions" class="meal-suggestions"></div>
    `;

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

    // Best-matched foods for meal ideas: the target-nutrient-rich foods
    // themselves, plus the complementary pairing foods that both boost
    // absorption and avoid blockers.
    renderMealSuggestions(document.getElementById("meal-suggestions"), Utils.union(regions.ab, richFoods));
  }

  // ---------------- food view: one 2-circle venn per nutrient ----------------
  function renderFoodView(foodKey) {
    const main = document.getElementById("main-content");
    const food = store.foods.get(foodKey);
    if (!food) { renderEmptyState(); return; }
    const label = food.display;
    const nutrientKeys = [...food.nutrients];

    main.innerHTML = `
      <div class="view-header">
        <h2>${Utils.escapeHtml(label)}</h2>
        <p class="view-sub">Rich in: ${listOrDash(food.nutrients, (k) => store.nutrientLabel(k))}</p>
      </div>
      <div id="food-venn-list"></div>
      <div id="meal-suggestions-food" class="meal-suggestions"></div>
    `;

    const listEl = document.getElementById("food-venn-list");
    let allBest = new Set();

    if (nutrientKeys.length === 0) {
      listEl.innerHTML = `<p class="empty-state">No nutrients recorded for this food yet. Use "Add nutrient" / edit via "Add food" to add some.</p>`;
    }

    for (const nk of nutrientKeys) {
      const nLabel = store.nutrientLabel(nk);
      const { compatibleFoods, incompatibleAvoidedFoods, compatNutrients, incompatNutrients } =
        store.getFoodCompatibilitySets(nk);
      const block = document.createElement("div");
      block.className = "nutrient-block";
      block.innerHTML = `<h3>${Utils.escapeHtml(nLabel)}</h3>
        <p class="hint">
          Boosted by: ${listOrDash(compatNutrients, (k) => store.nutrientLabel(k))} &middot;
          Blocked by: ${listOrDash(incompatNutrients, (k) => store.nutrientLabel(k))}
        </p>
        <div class="venn-holder" data-nk="${nk}"></div>
        <div class="region-detail" data-detail-for="${nk}"></div>`;
      listEl.appendChild(block);

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

      // Extension hook: complementary incomplete-protein pairing.
      if (typeof ESSENTIAL_AMINO_ACIDS !== "undefined" && ESSENTIAL_AMINO_ACIDS.includes(nk)) {
        const partners = findCompleteProteinPairs(store, foodKey);
        if (partners.length) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-ghost btn-small";
          btn.textContent = "Find complementary proteins";
          btn.onclick = () => renderRegionDetailInto(
            detail, "protein-pairs", new Set(partners.map((p) => p.key)),
            "Pairs with this food to cover all essential amino acids"
          );
          block.appendChild(btn);
        }
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
