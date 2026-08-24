# Nutrient Matches

A small web app that visualises which foods and nutrients pair well
together to maximise nutrient absorption (e.g. iron + vitamin C, avoiding
calcium), with data synced to your own OneDrive.

## What's included

```
nutrient-matches/
  index.html
  css/styles.css
  js/
    config.js    — your Azure AD client id + app settings
    utils.js     — key normalisation, set helpers
    csv.js       — CSV parse/stringify
    store.js     — the three datasets + query logic
    rules.js     — pluggable "custom compatibility" extension point
                   (ships with an essential-amino-acid / complementary-
                   protein example)
    auth.js      — MSAL login-redirect wrapper
    onedrive.js  — Microsoft Graph read/write for the 3 CSVs
    venn.js      — SVG Venn diagram rendering
    ui.js        — header/footer/modals/search/views
    app.js       — bootstraps everything, local-cache + sync logic
```

## 1. Register an Azure AD app (one-time, ~5 minutes)

1. Go to [portal.azure.com](https://portal.azure.com) → **App registrations** → **New registration**.
2. Name it anything (e.g. "Nutrient Matches"). Under **Supported account types**
   choose **"Accounts in any organizational directory and personal Microsoft
   accounts"** if you want to sign in with a personal `outlook.com` /
   `hotmail.com` OneDrive account, or the org-only option if it's a work account.
3. Leave Redirect URI blank for now — Save.
4. Go to **Authentication** → **Add a platform** → **Single-page application**.
   Add a Redirect URI that exactly matches the URL you'll host this app at,
   e.g.:
   - `http://localhost:5500/` while testing locally
   - `https://yourname.github.io/nutrient-matches/` once deployed
5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions** → search for and add **`Files.ReadWrite.AppFolder`**.
   This scope only ever gives the app access to its own dedicated OneDrive
   folder (`Apps/Nutrient Matches`) — never the rest of your drive.
6. Copy the **Application (client) ID** from the Overview page.

## 2. Configure the app

Open `js/config.js` and replace:

```js
window.MSAL_CLIENT_ID = "REPLACE_WITH_YOUR_AZURE_AD_CLIENT_ID";
```

with the client ID you copied.

## 3. Host it

This is a static site — any static host works, and it needs no build step:

- **Locally**: `cd nutrient-matches && python3 -m http.server 5500`, then open
  `http://localhost:5500/` (must match the redirect URI you registered).
- **GitHub Pages / Netlify / Vercel / Azure Static Web Apps**: just deploy the
  folder as-is, and register that exact URL as the redirect URI in step 1.4.

Once hosted at a real URL, open it on your iPhone's Safari too — "Sign in
with Microsoft" uses a full-page redirect (not a popup), which is what
iOS Safari allows; add it to your Home Screen for an app-like feel.

## How the data works

- **food_nutrients** — one row per food, one column per nutrient, `1`/`0`
  for "rich in this nutrient or not". Nutrient columns are created
  automatically the first time you mention a new nutrient name (in "Add
  nutrient" or "Add food"); names are matched consistently regardless of
  capitalisation or spacing ("Vitamin D" and "vitamin_d" are the same
  column).
- **nutrient_matching** — a nutrient × nutrient grid of `compatible` /
  `incompatible` / `neutral`, edited via "Add nutrient" (comma-separated
  compatible/incompatible lists).
- **meal_ideas** — one row per meal, one column per ingredient slot
  (`ingredient1`, `ingredient2`, …), edited via "Add meal".

Signing in pulls your existing OneDrive copy of these three CSVs (or
creates them if this is the first time); every add-nutrient/food/meal
action re-saves all three, both to a local cache (so the app still works
offline / before you sign in) and, once signed in, to OneDrive shortly
after (debounced, so rapid edits don't spam the API).

## Using it

- Pick **Nutrient** or **Food** from the dropdown, then type into the
  search box — suggestions come from the matching dataset.
- **Nutrient selected**: a 3-circle diagram shows foods rich in that
  nutrient, foods rich in a compatible ("booster") nutrient, and foods
  that avoid the incompatible ("blocker") nutrients. Click any circle or
  overlap bubble to list exactly which foods are in it.
- **Food selected**: one 2-circle diagram per nutrient the food is rich
  in, showing which other foods boost its absorption vs. which avoid
  blocking it.
- Both views surface **meal ideas** drawn from your saved meals whose
  ingredients overlap the best-matching foods.

## Extending it

- **New compatibility logic** (e.g. combining incomplete proteins so all
  9 essential amino acids are covered): see `js/rules.js`. It already
  ships a working example — `registerCompatibilityRule` lets you attach
  custom set logic to any nutrient key without touching the core store.
- **Meal suggestions from Venn intersections**: `DataStore.suggestMealsFromFoodSet`
  and the "meal ideas" panels in `ui.js` are the hook — the sets handed to
  them are exactly the regions computed for the diagrams, so any new
  region logic automatically flows through to suggestions.
