// ============================================================
// Auth — MSAL login-redirect wrapper (works the same on desktop
// Safari/Chrome and iOS Safari, since it's a full-page redirect
// rather than a popup, which iOS often blocks).
// ============================================================
const Auth = (() => {
  let msalApp = null;
  let account = null;
  const listeners = new Set();

  function onChange(fn) { listeners.add(fn); }
  function emitChange() { for (const fn of listeners) fn(account); }

  async function init() {
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: window.APP_CONFIG.msal.clientId,
        authority: window.APP_CONFIG.msal.authority,
        redirectUri: window.APP_CONFIG.msal.redirectUri,
        navigateToLoginRequestUrl: false,
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
      },
    });

    await msalApp.initialize();

    // Completes the flow if we just came back from the redirect.
    const result = await msalApp.handleRedirectPromise().catch((err) => {
      console.error("MSAL redirect error", err);
      return null;
    });

    if (result && result.account) {
      account = result.account;
    } else {
      const existing = msalApp.getAllAccounts();
      if (existing.length > 0) account = existing[0];
    }
    if (account) msalApp.setActiveAccount(account);
    emitChange();
    return account;
  }

  function login() {
    return msalApp.loginRedirect({ scopes: window.APP_CONFIG.graphScopes });
  }

  function logout() {
    account = null;
    return msalApp.logoutRedirect();
  }

  function isSignedIn() { return !!account; }
  function getAccount() { return account; }

  // Try a silent token first (cached / refreshed quietly); only fall
  // back to a redirect if that's impossible, since a redirect tears
  // down the current page state.
  async function getAccessToken() {
    if (!account) throw new Error("Not signed in.");
    try {
      const res = await msalApp.acquireTokenSilent({
        scopes: window.APP_CONFIG.graphScopes,
        account,
      });
      return res.accessToken;
    } catch (err) {
      if (err instanceof msal.InteractionRequiredAuthError) {
        await msalApp.acquireTokenRedirect({ scopes: window.APP_CONFIG.graphScopes });
        return null; // page will navigate away
      }
      throw err;
    }
  }

  return { init, login, logout, isSignedIn, getAccount, getAccessToken, onChange };
})();
