// ============================================================
// OneDrive sync — stores the three CSVs inside the app's own
// hidden "Apps/NutrientMatches" folder (special/approot), reached
// via Microsoft Graph. Requires only the Files.ReadWrite.AppFolder
// scope, so the app never sees the rest of the user's drive.
// ============================================================
const OneDrive = (() => {
  const base = window.APP_CONFIG.graphBase;

  async function authedFetch(path, options = {}) {
    const token = await Auth.getAccessToken();
    if (!token) return null; // redirect in flight
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    return res;
  }

  async function downloadFile(fileName) {
    const res = await authedFetch(
      `/me/drive/special/approot:/${encodeURIComponent(fileName)}:/content`
    );
    if (!res) return null;
    if (res.status === 404) return ""; // doesn't exist yet — treat as empty
    if (!res.ok) throw new Error(`Failed to download ${fileName}: ${res.status}`);
    return res.text();
  }

  async function uploadFile(fileName, csvText) {
    // PUT ...:/content creates the file (and the AppFolder itself) if
    // it doesn't already exist, and overwrites it otherwise.
    const res = await authedFetch(
      `/me/drive/special/approot:/${encodeURIComponent(fileName)}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: csvText,
      }
    );
    if (!res) return null;
    if (!res.ok) throw new Error(`Failed to upload ${fileName}: ${res.status}`);
    return res.json();
  }

  async function downloadAll() {
    const f = window.APP_CONFIG.files;
    const [foodNutrients, nutrientMatching, mealIdeas] = await Promise.all([
      downloadFile(f.foodNutrients),
      downloadFile(f.nutrientMatching),
      downloadFile(f.mealIdeas),
    ]);
    return { foodNutrients, nutrientMatching, mealIdeas };
  }

  async function uploadAll(store) {
    const f = window.APP_CONFIG.files;
    await Promise.all([
      uploadFile(f.foodNutrients, store.toCSV_foodNutrients()),
      uploadFile(f.nutrientMatching, store.toCSV_nutrientMatching()),
      uploadFile(f.mealIdeas, store.toCSV_mealIdeas()),
    ]);
  }

  return { downloadAll, uploadAll };
})();
