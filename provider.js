const vscode = require('vscode');
const path = require('path');

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
        // Set custom title for the webview panel
        webviewPanel.title = `${fileName}[3Dmol]`;

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

module.exports = ThreeDmolViewerProvider;
