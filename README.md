# 3Dmol Viewer for VS Code

Interactive 3D molecular visualization for `.xyz` and `.trj` files, powered by [3Dmol.js](https://3dmol.org/).

## Features

- **Interactive 3D**: Rotate, zoom, and explore molecules directly in VS Code.
- **Theme Sync**: Automatically adapts to your VS Code theme (Light, Dark, or High Contrast).
- **Live Updates**: The viewer updates instantly when you save changes to the file.
- **Seamless Toggle**: Switch between Text and 3D views with a single click on the molecule icon in the editor title bar.

## Usage

1.  Open any `.xyz` or `.trj` file.
2.  The 3D viewer launches automatically (default).
3.  Click the **Molecule Icon** in the editor title bar to toggle between the raw text and the 3D visualization.

## Configuration

- **`3dmolViewer.defaultOpenMode`**: Set to `"viewer"` (default) to open files in 3D mode, or `"text"` to open in the text editor first.

---

This extension uses [`3Dmol.js`](https://3dmol.org/), which bundles code from GLmol, Three.js, and jQuery. The upstream code is distributed under BSD-3-Clause (with GLmol offering a dual MIT/LGPL3 license and Three.js/jQuery using MIT), and we honor those terms by retaining their notices within the `3Dmol.js` distribution. The extension itself is licensed under the MIT License (see [LICENSE](LICENSE)).
