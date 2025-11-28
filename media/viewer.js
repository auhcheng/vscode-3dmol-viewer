(() => {
  const vscode = acquireVsCodeApi();
  const viewerElement = document.getElementById('viewer');
  let viewer = null;

  const readInitialThemeValue = (variableName, fallback) => {
    try {
      const styles = getComputedStyle(document.body || document.documentElement);
      const value = styles.getPropertyValue(variableName);
      return (value && value.trim()) || fallback;
    } catch (err) {
      console.warn('Failed to read initial theme value for', variableName, err);
      return fallback;
    }
  };

  let themeBackground = readInitialThemeValue('--viewer-bg', '#0c111a');
  let foregroundColor = readInitialThemeValue('--viewer-fg', '#e0e4ea');
  const revealUI = () => document.body && document.body.classList.add('viewer-ready');



  function applyTheme() {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--viewer-bg', themeBackground);
    rootStyle.setProperty('--viewer-fg', foregroundColor);

    if (viewer) {
      // 3Dmol requires a concrete color string (hex/rgb), it can't handle CSS variables directly.
      // So we need to resolve the variable to a value.
      // We create a temporary element to resolve the background color because getComputedStyle
      // on body might not catch the variable if it's not applied yet or if it's inherited.
      // However, since we set --viewer-bg on root, we can try to read that, 
      // OR better: just let the browser resolve the variable we just passed in (themeBackground).

      // If themeBackground is a var(...), we need to resolve it.
      let colorToSet = themeBackground;
      if (themeBackground.startsWith('var(')) {
        // Create a temp element to resolve the color
        const temp = document.createElement('div');
        temp.style.display = 'none';
        temp.style.color = themeBackground; // Use color property to resolve
        document.body.appendChild(temp);
        colorToSet = getComputedStyle(temp).color;
        document.body.removeChild(temp);
      }

      viewer.setBackgroundColor(colorToSet);
      viewer.render();
    }
  }

  function ensureViewer() {
    if (!viewer) {
      let colorToSet = themeBackground;
      if (themeBackground.startsWith('var(')) {
        const temp = document.createElement('div');
        temp.style.display = 'none';
        temp.style.color = themeBackground;
        document.body.appendChild(temp);
        colorToSet = getComputedStyle(temp).color;
        document.body.removeChild(temp);
      }
      viewer = $3Dmol.createViewer(viewerElement, { backgroundColor: colorToSet });
    }
    viewer.resize();
    viewer.render();
  }

  function render(content, fileName) {
    ensureViewer();
    try {
      viewer.stopAnimate();
    } catch (err) {
      console.warn('animate stop failed', err);
    }
    viewer.removeAllModels();
    try {
      viewer.addModelsAsFrames(content, 'xyz');
    } catch (frameErr) {
      console.warn('addModelsAsFrames failed, falling back to addModel', frameErr);
      viewer.addModel(content, 'xyz');
    }
    viewer.setStyle({}, { stick: { radius: 0.2 }, sphere: { scale: 0.25 } });
    viewer.zoomTo();
    const model = viewer.getModel(0);
    const hasFrames = model && typeof model.getNumFrames === 'function' && model.getNumFrames() > 1;
    if (hasFrames) {
      viewer.animate({ interval: 120, loop: true });
    }
    viewer.render();
    revealUI();
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string') {
      return;
    }
    if (message.type === 'theme') {
      if (message.backgroundColor) {
        themeBackground = message.backgroundColor;
      }
      if (message.foregroundColor) {
        foregroundColor = message.foregroundColor;
      }
      applyTheme();
      return;
    }
    if (message.type === 'load') {
      try {
        render(message.content, message.fileName);
      } catch (err) {
        console.error('render failed', err);
        revealUI();
      }
    } else if (message.type === 'error') {
      console.error(message.error || 'Error');
      revealUI();
    }
  });

  window.addEventListener('resize', () => {
    if (viewer) {
      viewer.resize();
      viewer.render();
    }
  });

  vscode.postMessage({ type: 'ready' });
  applyTheme();
  // In case the viewer never loads (e.g., due to CSP issues), unhide after a short delay.
  setTimeout(revealUI, 500);
})();
