/*
 * ChatGPT Desktop Wrapper
 * Developer: Stephan Coertzen <coertzen.jfs@gmail.com>
 * License: MIT
 */
const { app, BrowserWindow, shell, session } = require('electron');

const START_URL = 'https://chatgpt.com';
const APP_HOST_SUFFIXES = ['chatgpt.com', 'openai.com'];
const AUTH_HOSTS = ['accounts.google.com'];
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const ALLOWED_PERMISSIONS = new Set(['media', 'notifications']);
const WINDOW_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false
};

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isAppUrl(url) {
  const parsedUrl = parseUrl(url);

  if (!parsedUrl || parsedUrl.protocol !== 'https:') {
    return false;
  }

  return APP_HOST_SUFFIXES.some((hostSuffix) => (
    parsedUrl.hostname === hostSuffix || parsedUrl.hostname.endsWith(`.${hostSuffix}`)
  ));
}

function isAuthUrl(url) {
  const parsedUrl = parseUrl(url);

  return Boolean(
    parsedUrl &&
    parsedUrl.protocol === 'https:' &&
    AUTH_HOSTS.includes(parsedUrl.hostname)
  );
}

function isTrustedInAppUrl(url) {
  return isAppUrl(url) || isAuthUrl(url);
}

function isSafeExternalUrl(url) {
  const parsedUrl = parseUrl(url);

  return Boolean(parsedUrl && EXTERNAL_PROTOCOLS.has(parsedUrl.protocol));
}

function openExternalIfSafe(url) {
  if (!isSafeExternalUrl(url)) {
    return;
  }

  shell.openExternal(url);
}

function openTrustedWindow(url, openerWebContents) {
  const parentWindow = BrowserWindow.fromWebContents(openerWebContents);
  const authWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    parent: parentWindow || undefined,
    autoHideMenuBar: true,
    webPreferences: WINDOW_WEB_PREFERENCES
  });

  configureWebContents(authWindow.webContents);
  authWindow.loadURL(url);
}

function guardNavigation(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (isTrustedInAppUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalIfSafe(url);
  });

  webContents.on('will-redirect', (event, url) => {
    if (isTrustedInAppUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalIfSafe(url);
  });
}

function guardWindowOpen(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedInAppUrl(url)) {
      openTrustedWindow(url, webContents);
      return { action: 'deny' };
    }

    openExternalIfSafe(url);
    return { action: 'deny' };
  });
}

function configureWebContents(webContents) {
  guardWindowOpen(webContents);
  guardNavigation(webContents);
}

const REFRESH_BUTTON_SCRIPT = `
(() => {
  const hostId = 'chatgpt-desktop-refresh-host';

  if (document.getElementById(hostId)) {
    return;
  }

  const host = document.createElement('div');
  host.id = hostId;
  host.style.position = 'fixed';
  host.style.top = '12px';
  host.style.right = '14px';
  host.style.zIndex = '2147483647';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = [
    'button {',
    '  align-items: center;',
    '  background: rgba(255, 255, 255, 0.92);',
    '  border: 1px solid rgba(0, 0, 0, 0.16);',
    '  border-radius: 8px;',
    '  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);',
    '  color: #111827;',
    '  cursor: pointer;',
    '  display: inline-flex;',
    '  height: 36px;',
    '  justify-content: center;',
    '  padding: 0;',
    '  width: 36px;',
    '}',
    'button:hover { background: #ffffff; }',
    'button:active { transform: translateY(1px); }',
    'button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }',
    'svg { height: 18px; width: 18px; }',
    '@media (prefers-color-scheme: dark) {',
    '  button {',
    '    background: rgba(31, 41, 55, 0.92);',
    '    border-color: rgba(255, 255, 255, 0.2);',
    '    color: #f9fafb;',
    '  }',
    '  button:hover { background: #374151; }',
    '}'
  ].join('\\n');

  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'Refresh';
  button.setAttribute('aria-label', 'Refresh ChatGPT');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  for (const d of ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  button.appendChild(svg);
  button.addEventListener('click', () => {
    window.location.reload();
  });

  shadow.append(style, button);
  document.documentElement.appendChild(host);
})();
`;

function injectRefreshButton(win) {
  win.webContents.executeJavaScript(REFRESH_BUTTON_SCRIPT).catch(() => {
    // The page can briefly reject injection while navigating; the next load retries it.
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      preload: require('path').join(__dirname, 'preload.js'),
      ...WINDOW_WEB_PREFERENCES
    }
  });

  win.webContents.on('did-create-window', (childWindow) => {
    configureWebContents(childWindow.webContents);
  });

  configureWebContents(win.webContents);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F5') {
      event.preventDefault();
      win.webContents.reload();
    }
  });

  win.webContents.on('dom-ready', () => {
    injectRefreshButton(win);
  });

  win.loadURL(START_URL);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();

    callback(ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
