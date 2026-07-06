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
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'media',
  'notifications'
]);
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

const TOOLBAR_SCRIPT = `
(() => {
  const hostId = 'chatgpt-desktop-refresh-host';

  if (document.getElementById(hostId)) {
    return;
  }

  const host = document.createElement('div');
  host.id = hostId;
  host.style.position = 'fixed';
  host.style.top = '64px';
  host.style.right = '72px';
  host.style.zIndex = '2147483647';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = [
    '.toolbar {',
    '  display: inline-flex;',
    '  gap: 8px;',
    '}',
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

  function cleanText(text) {
    return (text || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  function escapeMarkdown(text) {
    return cleanText(text).replace(/([\\\\*_{}[\\]()#+\\-.!|>])/g, '\\\\$1');
  }

  function createIcon(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }

    return svg;
  }

  function createButton(title, label, paths, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', label);
    button.appendChild(createIcon(paths));
    button.addEventListener('click', onClick);

    return button;
  }

  function nodeToMarkdown(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();

    if (['script', 'style', 'button', 'nav', 'aside'].includes(tagName)) {
      return '';
    }

    if (tagName === 'br') {
      return '\\n';
    }

    if (tagName === 'pre') {
      const code = node.querySelector('code');
      const codeText = cleanText((code || node).innerText || '');
      const languageClass = Array.from((code && code.classList) || [])
        .find((className) => className.startsWith('language-'));
      const language = languageClass ? languageClass.replace('language-', '') : '';
      const fence = String.fromCharCode(96).repeat(3);

      return '\\n\\n' + fence + language + '\\n' + codeText + '\\n' + fence + '\\n\\n';
    }

    if (tagName === 'code') {
      const markdownTick = String.fromCharCode(96);

      return markdownTick + cleanText(node.innerText || '') + markdownTick;
    }

    const childMarkdown = () => Array.from(node.childNodes)
      .map((child) => nodeToMarkdown(child, depth))
      .join('');

    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName[1]);
      return '\\n\\n' + '#'.repeat(level) + ' ' + cleanText(childMarkdown()) + '\\n\\n';
    }

    if (['p', 'div', 'section', 'article'].includes(tagName)) {
      return '\\n\\n' + cleanText(childMarkdown()) + '\\n\\n';
    }

    if (tagName === 'blockquote') {
      return cleanText(childMarkdown())
        .split('\\n')
        .map((line) => '> ' + line)
        .join('\\n') + '\\n\\n';
    }

    if (tagName === 'ul' || tagName === 'ol') {
      const ordered = tagName === 'ol';

      return '\\n' + Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((child, index) => {
          const marker = ordered ? String(index + 1) + '.' : '-';
          return '  '.repeat(depth) + marker + ' ' + cleanText(nodeToMarkdown(child, depth + 1));
        })
        .join('\\n') + '\\n\\n';
    }

    if (tagName === 'li') {
      return childMarkdown();
    }

    if (tagName === 'a') {
      const text = cleanText(childMarkdown() || node.innerText || node.href);

      if (!node.href || node.href.startsWith('javascript:')) {
        return text;
      }

      return '[' + text + '](' + node.href + ')';
    }

    if (tagName === 'strong' || tagName === 'b') {
      return '**' + cleanText(childMarkdown()) + '**';
    }

    if (tagName === 'em' || tagName === 'i') {
      return '_' + cleanText(childMarkdown()) + '_';
    }

    return childMarkdown();
  }

  function getConversationTitle() {
    const title = document.title
      .replace(/\\s*[-|] ChatGPT\\s*$/i, '')
      .replace(/^ChatGPT\\s*[-|]\\s*/i, '')
      .trim();

    return title || 'ChatGPT conversation';
  }

  function getMessageMarkdown() {
    const messages = Array.from(document.querySelectorAll('[data-message-author-role]'));

    if (messages.length === 0) {
      const main = document.querySelector('main') || document.body;
      return cleanText(nodeToMarkdown(main));
    }

    return messages.map((message) => {
      const role = message.getAttribute('data-message-author-role') || 'message';
      const heading = role === 'assistant' ? 'Assistant' : role === 'user' ? 'User' : role;
      const content = cleanText(nodeToMarkdown(message));

      return '## ' + heading + '\\n\\n' + content;
    }).join('\\n\\n');
  }

  function downloadMarkdown() {
    const exportedAt = new Date().toISOString();
    const title = getConversationTitle();
    const markdown = [
      '# ' + escapeMarkdown(title),
      '',
      'Exported: ' + exportedAt,
      'Source: ' + window.location.href,
      '',
      getMessageMarkdown(),
      ''
    ].join('\\n');
    const fileStem = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'chatgpt-conversation';
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileStem + '-' + exportedAt.slice(0, 10) + '.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const downloadButton = createButton(
    'Download conversation as Markdown',
    'Download conversation as Markdown',
    ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    downloadMarkdown
  );
  const refreshButton = createButton(
    'Refresh',
    'Refresh ChatGPT',
    ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
    () => {
    window.location.reload();
    }
  );

  toolbar.append(downloadButton, refreshButton);

  shadow.append(style, toolbar);
  document.documentElement.appendChild(host);
})();
`;

function injectToolbar(win) {
  win.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {
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
    injectToolbar(win);
  });

  win.loadURL(START_URL);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => (
    ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingOrigin || webContents?.getURL())
  ));

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
