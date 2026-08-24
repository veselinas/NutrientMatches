// ============================================================
// Nutrient Matches — configuration
// ============================================================
// 1. Register an app in Azure AD (portal.azure.com -> App registrations
//    -> New registration). Choose "Accounts in any organizational
//    directory and personal Microsoft accounts" if you want personal
//    OneDrive accounts to work too.
// 2. Under Authentication, add a "Single-page application" platform
//    with a Redirect URI equal to the exact URL this app is hosted at
//    (e.g. https://yourname.github.io/nutrient-matches/ or
//    http://localhost:5500/ while testing locally).
// 3. Under API permissions, add Microsoft Graph delegated permission
//    "Files.ReadWrite.AppFolder" (lets the app read/write only its own
//    hidden OneDrive folder — no broad access to the rest of the drive).
// 4. Copy the "Application (client) ID" into MSAL_CLIENT_ID below.

// 3. Under API permissions, add Microsoft Graph delegated permission
//    "Files.ReadWrite" (needed because the app now writes to a
//    specifically-named OneDrive folder rather than the sandboxed
//    "AppFolder" — that folder's name is tied to the Azure app's own
//    display name, which we don't want to touch).
// 4. Copy the "Application (client) ID" into MSAL_CLIENT_ID below.

window.MSAL_CLIENT_ID = "9ade85d2-93c6-4e1c-a9a2-bdd0e3f9b1b5";

window.APP_CONFIG = {
  msal: {
    clientId: window.MSAL_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    // Redirect back to wherever this page is currently served from,
    // stripped of any query string / hash — works for both
    // localhost testing and a deployed URL, on laptop or iPhone.
    redirectUri: window.location.origin + window.location.pathname,
  },
  // Name of the OneDrive folder (created under the root) that holds
  // the three CSVs. Independent of the app's display name.
  oneDriveFolder: "App_NutrientMatches",
  // Broad Files.ReadWrite scope is required now that we write to a
  // named folder rather than the sandboxed AppFolder.
  graphScopes: ["Files.ReadWrite"],
  graphBase: "https://graph.microsoft.com/v1.0",
  files: {
    foodNutrients: "food_nutrients.csv",
    nutrientMatching: "nutrient_matching.csv",
    mealIdeas: "meal_ideas.csv",
  },
  // Local cache keys (used for instant load + offline resume between
  // OneDrive syncs).
  localStorageKeys: {
    foodNutrients: "nm_food_nutrients",
    nutrientMatching: "nm_nutrient_matching",
    mealIdeas: "nm_meal_ideas",
  },
};
