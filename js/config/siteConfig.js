/**
 * Single place to configure the page before publishing.
 */

export const ENGINE_CONFIG = {
    // Paste the generated API secret key here to pre-fill the demo field.
    // Leave empty to let visitors enter their own key in the demo section instead.
    // Never commit a real key to source control.
    defaultApiKey: '',
};

/** Guidance rows under "What to compare" — the claims the side-by-side lets a reviewer verify. */
export const COMPARISON_CHECKS = [
    'Same graph topology — identical node and edge sets in both panes.',
    'Same algorithm and parameters — the case pins the OGDF layout call.',
    'Same coordinate semantics — positions returned by the runner, drawn unmodified.',
    'Deterministic reruns — the Engine re-binds a fresh Lua state per execution, eliminating side effects.',
];

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