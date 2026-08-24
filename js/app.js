// ============================================================
// App bootstrap
// ============================================================
const App = (() => {
  const store = new DataStore();
  let saveTimer = null;

  function seedSampleData() {
    // A handful of starter entries so the app isn't empty on first
    // run — matches the worked example from the brief. Feel free to
    // delete by starting fresh once you sign in and sync your own data.
    store.addNutrientRelations("Iron", ["Vitamin C"], ["Calcium"]);
    store.addNutrientRelations("Vitamin C", ["Iron"], []);
    store.addNutrientRelations("Calcium", [], ["Iron"]);
    store.addFood("Spinach", ["Iron", "Folate", "Vitamin K"]);
    store.addFood("Apple", ["Vitamin C", "Fiber"]);
    store.addFood("Ricotta Cheese", ["Calcium", "Protein"]);
    store.addFood("Red Bell Pepper", ["Vitamin C"]);
    store.addFood("Lentils", ["Iron", "Lysine", "Leucine", "Isoleucine", "Valine", "Threonine", "Phenylalanine"]);
    store.addFood("Brown Rice", ["Methionine", "Tryptophan", "Histidine"]);
    store.addMeal("Spinach & apple salad", ["Spinach", "Apple", "Red Bell Pepper"]);
    store.addMeal("Lentils & rice bowl", ["Lentils", "Brown Rice"]);
  }

  function loadLocalCache() {
    const keys = window.APP_CONFIG.localStorageKeys;
    const fn = localStorage.getItem(keys.foodNutrients);
    const nm = localStorage.getItem(keys.nutrientMatching);
    const mi = localStorage.getItem(keys.mealIdeas);
    if (!fn && !nm && !mi) return false;
    if (fn) store.loadFromCSV_foodNutrients(fn);
    if (nm) store.loadFromCSV_nutrientMatching(nm);
    if (mi) store.loadFromCSV_mealIdeas(mi);
    return true;
  }

  function saveLocalCache() {
    const keys = window.APP_CONFIG.localStorageKeys;
    localStorage.setItem(keys.foodNutrients, store.toCSV_foodNutrients());
    localStorage.setItem(keys.nutrientMatching, store.toCSV_nutrientMatching());
    localStorage.setItem(keys.mealIdeas, store.toCSV_mealIdeas());
  }

  function scheduleSave() {
    saveLocalCache();
    UI.setSyncStatus(Auth.isSignedIn() ? "Saving to OneDrive\u2026" : "Saved on this device");
    if (!Auth.isSignedIn()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await OneDrive.uploadAll(store);
        UI.setSyncStatus("Synced to OneDrive \u2713");
      } catch (err) {
        console.error(err);
        UI.setSyncStatus("Sync failed \u2014 saved locally instead", true);
      }
    }, 800);
  }

  async function pullFromOneDrive() {
    UI.setSyncStatus("Loading from OneDrive\u2026");
    try {
      const { foodNutrients, nutrientMatching, mealIdeas } = await OneDrive.downloadAll();
      const hasRemoteData = (foodNutrients && foodNutrients.trim()) ||
        (nutrientMatching && nutrientMatching.trim()) || (mealIdeas && mealIdeas.trim());
      if (hasRemoteData) {
        // Remote OneDrive copy is the source of truth once signed in.
        Object.assign(store, new DataStore());
        registerBuiltInRules(store);
        if (foodNutrients) store.loadFromCSV_foodNutrients(foodNutrients);
        if (nutrientMatching) store.loadFromCSV_nutrientMatching(nutrientMatching);
        if (mealIdeas) store.loadFromCSV_mealIdeas(mealIdeas);
        saveLocalCache();
      } else {
        // Nothing in OneDrive yet — push whatever we have locally.
        await OneDrive.uploadAll(store);
      }
      UI.setSyncStatus("Synced to OneDrive \u2713");
      UI.refreshCurrentView();
    } catch (err) {
      console.error(err);
      UI.setSyncStatus("Could not reach OneDrive \u2014 using local copy", true);
    }
  }

  async function init() {
    const hadCache = loadLocalCache();
    if (!hadCache) seedSampleData();
    registerBuiltInRules(store);

    UI.init(store, scheduleSave);

    await Auth.init();
    UI.renderAuthStatus();
    Auth.onChange(async () => {
      UI.renderAuthStatus();
      if (Auth.isSignedIn()) await pullFromOneDrive();
    });
    if (Auth.isSignedIn()) await pullFromOneDrive();
  }

  return { init, store };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.init().catch((err) => console.error("App init failed", err));
});
