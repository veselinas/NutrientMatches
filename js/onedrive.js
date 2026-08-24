// ============================================================
// OneDrive sync — stores the three CSVs inside a top-level OneDrive
// folder named via APP_CONFIG.oneDriveFolder ("App_NutrientMatches"
// by default), reached via Microsoft Graph. Requires the broader
// Files.ReadWrite scope (see config.js) since this is a regular
// named folder, not the sandboxed AppFolder.
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
    const folder = encodeURIComponent(window.APP_CONFIG.oneDriveFolder);
    const res = await authedFetch(
      `/me/drive/root:/${folder}/${encodeURIComponent(fileName)}:/content`
    );
    if (!res) return null;
    if (res.status === 404) return ""; // doesn't exist yet — treat as empty
    if (!res.ok) throw new Error(`Failed to download ${fileName}: ${res.status}`);
    return res.text();
  }

  async function uploadFile(fileName, csvText) {
    // PUT ...:/content creates the folder and the file if they don't
    // already exist (Graph creates missing intermediate path segments
    // automatically), and overwrites the file otherwise.
    const folder = encodeURIComponent(window.APP_CONFIG.oneDriveFolder);
    const res = await authedFetch(
      `/me/drive/root:/${folder}/${encodeURIComponent(fileName)}:/content`,
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
