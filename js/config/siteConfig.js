/**
 * Single place to configure the page before publishing.
 */

export const ENGINE_CONFIG = {
    // API-key authentication is temporarily disabled: the backend no longer
    // accepts API keys. The key handling is commented out across the site
    // (index.html, js/ui/demo.js, js/api/engineClient.js) and can be
    // re-enabled from those comments later.
    //
    // --- Disabled temporarily ---
    // Paste the generated API secret key here to pre-fill the demo field.
    // Leave empty to let visitors enter their own key in the demo section instead.
    // Never commit a real key to source control.
    // defaultApiKey: '',
};

/** Guidance rows under "What to compare" — the claims the side-by-side lets a reviewer verify. */
export const COMPARISON_CHECKS = [
    'Same graph topology — identical node and edge sets in both panes.',
    'Same algorithm and parameters — the case pins the OGDF layout call.',
    'Same coordinate semantics — positions returned by the runner, drawn unmodified.',
    'Deterministic reruns — the Engine re-binds a fresh Lua state per execution, eliminating side effects.',
];

/**
 * Compatibility matrix: which layout methods actually run on which example graphs.
 * Edit this table — a method missing a graph in its list is disabled for that graph
 * in the demo selects. A method with no entry (or an empty list) allows every graph.
 */
export const METHOD_GRAPH_COMPATIBILITY = {
    'energybased':          ['Cube.graphml', 'Mesh.graphml', 'n100e100.graphml', 'n1000e1000.graphml'],
    'hierarchical':         ['Cube.graphml', 'Mesh.graphml', 'n100e100.graphml', 'n1000e1000.graphml'],
    'hierarchical-ranking': ['Cube.graphml', 'Mesh.graphml', 'n100e100.graphml'],
    'orthogonal':           ['Cube.graphml', 'Mesh.graphml', 'n100e100.graphml'],
    'pivotmds':             ['Cube.graphml', 'Mesh.graphml', 'n100e100.graphml', 'n1000e1000.graphml'],
};

/** Ordered stages the runner reports while a job progresses. */
export const EXECUTION_STAGES = [
    { id: 'queued', label: 'Queued' },
    { id: 'compiling', label: 'Compiling C++' },
    { id: 'running', label: 'Running layout' },
    { id: 'transferring', label: 'Transferring result' },
    { id: 'succeeded', label: 'Done' },
];

export const RESOURCE_LINKS = [
    { label: 'OGDF — Open Graph Drawing Framework', href: 'https://www.ogdf.uni-osnabrueck.de', note: 'C++ framework supplying the layout algorithms' },
    { label: 'sol2', href: 'https://github.com/ThePhD/sol2', note: 'C++/Lua binding library the generated module builds on' },
    { label: 'GAV-VR', href: 'https://github.com/orkhanigidov/gav-vr', note: 'VR graph viewer (Unity/C#)' },
    { label: 'BRIDGE source repository', href: 'https://github.com/orkhanigidov/bridge', note: 'Code + Docker runner + binding generator' },
    { label: 'Thesis PDF', href: 'https://github.com/orkhanigidov/bridge/releases', note: 'Master thesis PDF and test data' },
];

export const THESIS_BIBTEX = `@mastersthesis{igidov2025bridge,
  author    = {Igidov, Orkhan},
  title     = {Connecting {OGDF} to {GAV-VR} -- Design Concept and Realisation},
  school    = {University of Konstanz},
  year      = {2025},
  note      = {Master Thesis, Department of Computer and Information Science, Life Science Informatics},
  type      = {Master's thesis},
  examiner  = {Prof. Dr. Falk Schreiber (1st examiner), Prof. Dr. Oliver Deussen (2nd examiner)},
  supervisor = {Dr. Karsten Klein}
}`;