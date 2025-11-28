const vscode = require('vscode');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.xyz', '.trj']);
const VIEWER_VIEW_TYPE = '3dmolViewer.viewer';
const DEFAULT_VIEW_TYPE = 'default';
const ASSOCIATED_PATTERNS = ['*.xyz', '*.trj'];

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const provider = new ThreeDmolViewerProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEWER_VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    })
  );

  const openHandler = async (resource) => {
    try {
      const targetUri = getTargetUri(resource);
      if (!targetUri) {
        vscode.window.showInformationMessage('Select an .xyz or .trj file, then run “Open in 3Dmol Viewer”.');
        return;
      }

      const extension = path.extname(targetUri.fsPath || '').toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        vscode.window.showWarningMessage('Only .xyz and .trj files can be opened in the 3Dmol viewer.');
        return;
      }

      await vscode.commands.executeCommand('vscode.openWith', targetUri, VIEWER_VIEW_TYPE, {
        preview: false
      });
    } catch (err) {
      console.error(err);
      vscode.window.showErrorMessage(`Unable to open viewer: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleView = async () => {
    const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;

    if (isViewerTab(activeTab)) {
      const uri = getUriFromTabInput(activeTab.input);
      if (uri) {
        await replaceWithView(uri, DEFAULT_VIEW_TYPE, isViewerTab);
        return;
      }
    }

    const uriFromTab = activeTab ? getUriFromTabInput(activeTab.input) : undefined;
    const uri = uriFromTab || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
    if (uri) {
      const ext = path.extname(uri.fsPath || uri.path || '').toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        await replaceWithView(uri, VIEWER_VIEW_TYPE, isTextTab);
        return;
      }
    }

    vscode.window.showInformationMessage('Select an .xyz or .trj file to toggle the 3D view.');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('3dmolViewer.open', openHandler),
    vscode.commands.registerCommand('3dmolViewer.openFromEditor', openHandler),
    vscode.commands.registerCommand('3dmolViewer.toggleView', toggleView)
  );

  syncDefaultOpenModeSetting().catch((err) => {
    console.error('Failed to sync default open mode setting', err);
  });
  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('3dmolViewer.defaultOpenMode')) {
      syncDefaultOpenModeSetting().catch((err) => {
        console.error('Failed to sync default open mode after configuration change', err);
      });
    }
  });
  context.subscriptions.push(configListener);
}

class ThreeDmolViewerProvider {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} webviewPanel
   */
  resolveCustomTextEditor(document, webviewPanel) {
    const webview = webviewPanel.webview;

    webview.options = {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };

    const fileName = path.basename(document.uri.fsPath || document.uri.path);
    let isReady = false;

    const sendContentToWebview = () => {
      if (!isReady) {
        return;
      }
      const content = document.getText();
      if (!content.trim()) {
        webview.postMessage({ type: 'error', error: 'The selected file appears to be empty.' });
        return;
      }
      webview.postMessage({
        type: 'load',
        fileName,
        content
      });
    };

    const messageListener = webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message.type !== 'string') {
        return;
      }
      if (message.type === 'ready') {
        isReady = true;
        postTheme(webview);
        sendContentToWebview();
        return;
      }
    });

    const themeListener = vscode.window.onDidChangeActiveColorTheme(() => {
      postTheme(webview);
    });

    const docListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === document) {
        sendContentToWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      messageListener.dispose();
      themeListener.dispose();
      docListener.dispose();
    });

    const initialThemeColors = getThemeColors();
    webview.html = getWebviewContent(webview, this.context.extensionUri, fileName, initialThemeColors);
    postTheme(webview);
  }
}

/**
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @param {string} fileName
 */
function getWebviewContent(webview, extensionUri, fileName, initialThemeColors = getThemeColors()) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'viewer.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
  const nonce = getNonce();

  const htmlPath = vscode.Uri.joinPath(extensionUri, 'media', 'index.html');
  const fs = require('fs');
  let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

  const { backgroundColor, foregroundColor } = initialThemeColors;

  htmlContent = htmlContent
    .replace(/{{cspSource}}/g, webview.cspSource)
    .replace(/{{nonce}}/g, nonce)
    .replace(/{{scriptUri}}/g, scriptUri)
    .replace(/{{styleUri}}/g, styleUri)
    .replace(/{{backgroundColor}}/g, backgroundColor)
    .replace(/{{foregroundColor}}/g, foregroundColor);

  return htmlContent;
}

function getTargetUri(resource) {
  if (resource instanceof vscode.Uri) {
    return resource;
  }
  const activeDoc = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (activeDoc) {
    return activeDoc.uri;
  }
  return undefined;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function postTheme(webview) {
  const colors = getThemeColors();
  webview.postMessage({
    type: 'theme',
    ...colors
  });
}

function getThemeColors(theme = vscode.window.activeColorTheme) {
  const fallback = {
    backgroundColor: '#05070b',
    foregroundColor: '#e0e4ea'
  };
  if (!theme) {
    return fallback;
  }
  const kind = theme.kind;
  const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
  const isLight = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return {
    backgroundColor: isDark ? '#05070b' : '#f5f6f8',
    foregroundColor: isDark ? '#e0e4ea' : '#1f2430'
  };
}

function getUriFromTabInput(input) {
  if (!input) {
    return undefined;
  }
  if (typeof vscode.TabInputText !== 'undefined' && input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (typeof vscode.TabInputCustom !== 'undefined' && input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  return undefined;
}

function isViewerTab(tab) {
  if (!tab || typeof vscode.TabInputCustom === 'undefined') {
    return false;
  }
  return tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VIEWER_VIEW_TYPE;
}

function isTextTab(tab) {
  if (!tab || typeof vscode.TabInputText === 'undefined') {
    return false;
  }
  return tab.input instanceof vscode.TabInputText;
}

function findTabsForUri(uri, predicate) {
  if (!uri || !vscode.window.tabGroups) {
    return [];
  }
  const matches = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const tabUri = getUriFromTabInput(tab.input);
      if (tabUri && tabUri.toString() === uri.toString()) {
        if (!predicate || predicate(tab)) {
          matches.push(tab);
        }
      }
    }
  }
  return matches;
}

async function replaceWithView(uri, viewType, tabsToClosePredicate) {
  const tabsToClose = findTabsForUri(uri, tabsToClosePredicate);
  await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
    preview: false
  });
  if (tabsToClose.length) {
    try {
      await vscode.window.tabGroups.close(tabsToClose, true);
    } catch (err) {
      console.error('Failed to close tabs after toggling view', err);
    }
  }
}

async function syncDefaultOpenModeSetting() {
  const config = vscode.workspace.getConfiguration('3dmolViewer');
  const mode = config.get('defaultOpenMode', 'viewer');
  const workbenchConfig = vscode.workspace.getConfiguration('workbench');
  const existing = normalizeEditorAssociations(workbenchConfig.get('editorAssociations'));
  let changed = false;

  if (mode === 'viewer') {
    for (const pattern of ASSOCIATED_PATTERNS) {
      if (existing[pattern] === 'default') {
        delete existing[pattern];
        changed = true;
      }
    }
  } else {
    for (const pattern of ASSOCIATED_PATTERNS) {
      if (existing[pattern] !== 'default') {
        existing[pattern] = 'default';
        changed = true;
      }
    }
  }

  if (changed) {
    await workbenchConfig.update('editorAssociations', existing, vscode.ConfigurationTarget.Global);
  }
}

function normalizeEditorAssociations(value) {
  if (!value) {
    return {};
  }
  if (Array.isArray(value)) {
    const map = {};
    for (const entry of value) {
      if (entry && typeof entry.filenamePattern === 'string' && typeof entry.viewType === 'string') {
        map[entry.filenamePattern] = entry.viewType;
      }
    }
    return map;
  }
  if (typeof value === 'object') {
    return { ...value };
  }
  return {};
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
