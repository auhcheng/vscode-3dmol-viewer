# 3Dmol Viewer — VS Code extension

This extension uses [`3Dmol.js`](https://3dmol.org/), which bundles code from GLmol, Three.js, and jQuery. The upstream code is distributed under BSD-3-Clause (with GLmol offering a dual MIT/LGPL3 license and Three.js/jQuery using MIT), and we honor those terms by retaining their notices within the `3Dmol.js` distribution. The extension itself is licensed under the MIT License (see [LICENSE](LICENSE)).

## Usage

- Opening any `.xyz` or `.trj` file now launches the 3D viewer directly in the file's editor tab, so there is no extra panel or distracting flash.
- Use the molecule icon (**3Dmol Viewer: Toggle 3D/Text View**) in the editor toolbar—or run the command from the palette—to flip between text and 3D. The same tab is reused each time, so toggling feels instant.
- The viewer automatically tracks theme changes and updates as you edit the source file.
- Prefer the plain text editor? Set **`3Dmol Viewer › Default Open Mode`** to **Text** in the VS Code Settings UI or add `"3dmolViewer.defaultOpenMode": "text"` in your settings file; choose **Viewer** to keep the custom editor as the default.
