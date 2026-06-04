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



  function resolveColor(colorVal) {
    if (colorVal && colorVal.startsWith('var(')) {
      const varName = colorVal.slice(4, -1).trim();
      return getComputedStyle(document.body).getPropertyValue(varName).trim() || colorVal;
    }
    return colorVal;
  }

  function applyTheme() {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--viewer-bg', themeBackground);
    rootStyle.setProperty('--viewer-fg', foregroundColor);

    if (viewer) {
      const colorToSet = resolveColor(themeBackground);
      viewer.setBackgroundColor(colorToSet);
      viewer.render();
    }
  }

  function ensureViewer() {
    if (!viewer) {
      const colorToSet = resolveColor(themeBackground);
      viewer = $3Dmol.createViewer(viewerElement, { backgroundColor: colorToSet });
    }
    viewer.resize();
    viewer.render();
  }

  const UNIT_CUBE_EDGES = [
    [[0, 0, 0], [0, 0, 1]],
    [[0, 0, 0], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0]],
    [[1, 0, 0], [1, 1, 0]],
    [[1, 0, 0], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0]],
    [[0, 1, 0], [0, 1, 1]],
    [[0, 0, 1], [1, 0, 1]],
    [[0, 0, 1], [0, 1, 1]],
    [[1, 1, 1], [0, 1, 1]],
    [[1, 1, 1], [1, 0, 1]],
    [[1, 1, 1], [1, 1, 0]],
  ];

  function getLatticeVectors(cryst) {
    if (!cryst) return null;
    const mat = cryst.matrix;
    let a, b, c;
    if (mat && mat.elements) {
      const el = mat.elements;
      if (el.length === 9) {
        a = [el[0], el[1], el[2]];
        b = [el[3], el[4], el[5]];
        c = [el[6], el[7], el[8]];
      } else if (el.length === 16) {
        a = [el[0], el[1], el[2]];
        b = [el[4], el[5], el[6]];
        c = [el[8], el[9], el[10]];
      }
    }
    if (!a || !b || !c) {
      const la = cryst.a;
      const lb = cryst.b;
      const lc = cryst.c;
      if (la !== undefined && lb !== undefined && lc !== undefined) {
        const alpha = (cryst.alpha || 90) * Math.PI / 180;
        const beta = (cryst.beta || 90) * Math.PI / 180;
        const gamma = (cryst.gamma || 90) * Math.PI / 180;
        
        const ax = la;
        const ay = 0;
        const az = 0;
        
        const bx = lb * Math.cos(gamma);
        const by = lb * Math.sin(gamma);
        const bz = 0;
        
        const cx = lc * Math.cos(beta);
        const cy = lc * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma)) / Math.sin(gamma);
        const cz = Math.sqrt(Math.max(0, lc * lc - cx * cx - cy * cy));
        
        a = [ax, ay, az];
        b = [bx, by, bz];
        c = [cx, cy, cz];
      }
    }
    
    if (a && b && c) {
      return [a, b, c];
    }
    return null;
  }

  function fracToCart(frac, origin, a, b, c) {
    return [
      origin[0] + frac[0] * a[0] + frac[1] * b[0] + frac[2] * c[0],
      origin[1] + frac[0] * a[1] + frac[1] * b[1] + frac[2] * c[1],
      origin[2] + frac[0] * a[2] + frac[1] * b[2] + frac[2] * c[2]
    ];
  }

  function drawCustomUnitCell(model, cryst) {
    const lattice = getLatticeVectors(cryst);
    if (!lattice) return;

    const origin = cryst.origin ? [cryst.origin.x || 0, cryst.origin.y || 0, cryst.origin.z || 0] : [0, 0, 0];
    const [a, b, c] = lattice;

    // Draw three arrows representing lattice vectors
    const axes = [
      { vec: a, color: 'red' },
      { vec: b, color: 'green' },
      { vec: c, color: 'blue' }
    ];

    for (const axis of axes) {
      viewer.addArrow({
        start: { x: origin[0], y: origin[1], z: origin[2] },
        end: {
          x: origin[0] + axis.vec[0],
          y: origin[1] + axis.vec[1],
          z: origin[2] + axis.vec[2]
        },
        radius: 0.2,
        radiusRatio: 2,
        mid: 0.92,
        color: axis.color
      });
    }

    // Draw unit cell box using cylinders
    const resolvedFg = resolveColor(foregroundColor);
    for (const edge of UNIT_CUBE_EDGES) {
      const startCart = fracToCart(edge[0], origin, a, b, c);
      const endCart = fracToCart(edge[1], origin, a, b, c);

      viewer.addCylinder({
        start: { x: startCart[0], y: startCart[1], z: startCart[2] },
        end: { x: endCart[0], y: endCart[1], z: endCart[2] },
        radius: 0.05,
        color: resolvedFg,
        fromCap: 'round',
        toCap: 'round'
      });
    }
  }

  function render(content, fileName) {
    ensureViewer();
    try {
      viewer.stopAnimate();
    } catch (err) {
      console.warn('animate stop failed', err);
    }
    viewer.removeAllModels();
    viewer.removeAllShapes();
    const ext = (fileName || '').split('.').pop().toLowerCase();
    const format = ext === 'cif' ? 'cif' : 'xyz';
    try {
      viewer.addModelsAsFrames(content, format);
    } catch (frameErr) {
      console.warn('addModelsAsFrames failed, falling back to addModel', frameErr);
      viewer.addModel(content, format);
    }

    if (format === 'cif') {
      try {
        const model = viewer.getModel(0);
        if (model) {
          const cryst = typeof model.getCrystData === 'function' ? model.getCrystData() : (model.modelData && model.modelData.cryst);
          if (cryst) {
            drawCustomUnitCell(model, cryst);
          }
        }
      } catch (cellErr) {
        console.warn('failed to draw custom unit cell', cellErr);
      }
    }

    viewer.setStyle({}, { stick: { radius: 0.2 }, sphere: { scale: 0.2 } });
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
