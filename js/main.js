import { RUNNER } from './config/site.js';
import { createRunnerClient } from './api/runnerClient.js';
import { initDemo } from './ui/demo.js';
import { initContent } from './ui/content.js';
import { initCopyButtons } from './ui/clipboard.js';
import { initScrollReveal } from './ui/animations.js';
import { initGraph3d } from './graph3d.js';

const client = createRunnerClient();
const pane3d = initGraph3d({
    container: '#graph3d-stage',
    meta: '#graph3d-meta',
});
initDemo(document, client, RUNNER, pane3d);
initContent({
    linksList: document.querySelector('#links-list'),
    bibtexCode: document.querySelector('#bibtex-code'),
});
initCopyButtons();
initScrollReveal(document);