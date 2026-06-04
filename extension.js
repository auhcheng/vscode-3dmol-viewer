const vscode = require('vscode');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.xyz', '.trj', '.cif']);
const VIEWER_VIEW_TYPE = '3dmolViewer.viewer';
const DEFAULT_VIEW_TYPE = 'default';
const ASSOCIATED_PATTERNS = ['*.xyz', '*.trj', '*.cif'];

const ThreeDmolViewerProvider = require('./provider');

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
        vscode.window.showInformationMessage('Select an .xyz, .trj or .cif file, then run “Open in 3Dmol Viewer”.');
        return;
      }

      const extension = path.extname(targetUri.fsPath || '').toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        vscode.window.showWarningMessage('Only .xyz, .trj and .cif files can be opened in the 3Dmol viewer.');
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
    const uri = activeTab ? getUriFromTabInput(activeTab.input) : undefined;

    if (activeTab && uri) {
      const ext = path.extname(uri.fsPath || uri.path || '').toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        // Determine target view type based on current tab type
        const isViewer = isViewerTab(activeTab);
        const targetViewType = isViewer ? DEFAULT_VIEW_TYPE : VIEWER_VIEW_TYPE;

        await openOrSwitchToView(uri, targetViewType);
        return;
      }
    }

    // Fallback if no active tab or not supported
    vscode.window.showInformationMessage('Select an .xyz, .trj or .cif file to toggle the 3D view.');
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

async function openOrSwitchToView(uri, viewType) {
  // Check if the view is already open in any tab group
  const allGroups = vscode.window.tabGroups.all;
  let existingTab = undefined;

  for (const group of allGroups) {
    existingTab = group.tabs.find(t => {
      const tUri = getUriFromTabInput(t.input);
      if (!tUri || tUri.toString() !== uri.toString()) {
        return false;
      }
      if (viewType === VIEWER_VIEW_TYPE) {
        return isViewerTab(t);
      } else {
        return isTextTab(t);
      }
    });
    if (existingTab) break;
  }

  if (existingTab) {
    // If found, reveal it
    const viewColumn = existingTab.group.viewColumn;
    await vscode.window.showTextDocument(uri, { viewColumn, preview: false });
    // Note: showTextDocument might not work perfectly for custom editors if we just pass URI.
    // But since we found the tab, we can try to focus it.
    // Actually, vscode.openWith with the same viewColumn and preview:false should switch to it.
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
      preview: false,
      viewColumn
    });
  } else {
    // If not found, open it in the active group (or beside if preferred, but user said "new tab")
    // "New tab" usually means just opening it.
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
      preview: false
    });
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
