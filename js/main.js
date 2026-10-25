import { ENGINE_CONFIG } from './config/siteConfig.js';
import { createEngineClient } from './api/engineClient.js';
import { initDemo } from './ui/demo.js';
import { renderResourceContent } from './ui/resourceContent.js';
import { initCopyButtons } from './ui/clipboard.js';
import { initScrollReveal } from './ui/scrollReveal.js';
import { initVideoEmbed } from './ui/videoEmbed.js';
import { createGraph3dViewer } from './graph/graph3dViewer.js';

const engineClient = createEngineClient();
const graph3dViewer = createGraph3dViewer({
    stageSelector: '#graph3d-stage',
    metaSelector: '#graph3d-meta',
});
initDemo(document, engineClient, ENGINE_CONFIG, graph3dViewer);
renderResourceContent({
    linksContainer: document.querySelector('#links-list'),
    bibtexCode: document.querySelector('#bibtex-code'),
});
initCopyButtons();
initVideoEmbed(document);
initScrollReveal(document);