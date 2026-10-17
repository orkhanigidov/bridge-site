import { parseGraphml } from './graphml.js';

const ACCENT = '#0f766e';
const LINK = '#a8a29e';
const NODE_PALETTE = ['#0f766e', '#2563eb', '#b45309', '#7c3aed', '#be123c', '#0f766e'];
const INITIAL_MESSAGE = 'Run the Engine to explore its GraphML result.';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

function createControls(stage, graph, metaEl, hasCoordinates) {
    const toolbar = document.createElement('div');
    toolbar.className = 'graph3d-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Graph visualization controls');

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'graph3d-search';
    search.placeholder = 'Find a node';
    search.setAttribute('aria-label', 'Find a node by ID');
    search.autocomplete = 'off';

    const addButton = ({ label, title, run, pressed }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-btn';
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
        button.addEventListener('click', run);
        toolbar.append(button);
        return button;
    };

    const details = document.createElement('div');
    details.className = 'graph3d-node-info';
    details.setAttribute('role', 'status');
    details.setAttribute('aria-live', 'polite');

    let nodes = [];
    let links = [];
    let coordinateLayout = hasCoordinates;
    let searchMatches = [];
    let hasSearchQuery = false;
    let showLabels = true;
    let showEdges = true;
    let focusedNode = null;
    const nodeColor = (node) => {
        if (focusedNode && node.id === focusedNode.id) return '#d97706';
        if (hasSearchQuery && !searchMatches.includes(node.id)) return '#cbd5e1';
        if (Number.isFinite(node.nodetype)) {
            const type = Math.abs(Math.trunc(node.nodetype)) % (NODE_PALETTE.length - 1);
            return NODE_PALETTE[type];
        }
        return ACCENT;
    };

    const updateSearch = () => {
        const query = search.value.trim().toLocaleLowerCase();
        hasSearchQuery = Boolean(query);
        searchMatches = query
            ? nodes.filter((node) => node.id.toLocaleLowerCase().includes(query)).map((node) => node.id)
            : [];
        graph.nodeColor(nodeColor);
        details.textContent = query
            ? `${searchMatches.length} matching ${searchMatches.length === 1 ? 'node' : 'nodes'}`
            : '';
    };

    const focusNode = (node) => {
        if (!node) return;
        focusedNode = node;
        updateSearch();
        const { x = 0, y = 0, z = 0 } = node;
        const distance = Math.max(60, Math.hypot(x, y, z) * 0.35);
        graph.cameraPosition(
            { x: x + distance, y: y + distance * 0.65, z: z + distance },
            { x, y, z },
            800,
        );
        const type = Number.isFinite(node.nodetype) ? ` · type ${node.nodetype}` : '';
        const degree = node.degree || 0;
        details.textContent = `${node.id} · ${degree} ${degree === 1 ? 'connection' : 'connections'}${type}`;
    };

    search.addEventListener('input', updateSearch);
    search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            search.value = '';
            focusedNode = null;
            updateSearch();
        } else if (event.key === 'Enter' && searchMatches.length) {
            focusNode(nodes.find((node) => node.id === searchMatches[0]));
        }
    });
    toolbar.append(search);
    const zoomBy = (factor) => {
        const camera = graph.cameraPosition();
        const target = camera.lookAt || { x: 0, y: 0, z: 0 };
        graph.cameraPosition({
            x: target.x + (camera.x - target.x) * factor,
            y: target.y + (camera.y - target.y) * factor,
            z: target.z + (camera.z - target.z) * factor,
        }, target, 250);
    };
    addButton({
        label: '−',
        title: 'Zoom out',
        run: () => zoomBy(1.25),
    });
    addButton({
        label: '+',
        title: 'Zoom in',
        run: () => zoomBy(0.8),
    });
    addButton({
        label: 'Fit',
        title: 'Fit all nodes in view',
        run: () => graph.zoomToFit(500, 48),
    });
    if (hasCoordinates) {
        const layoutButton = addButton({
            label: 'Coordinates',
            title: 'Switch to force-directed layout',
            pressed: true,
            run: (event) => {
                coordinateLayout = !coordinateLayout;
                for (const node of nodes) {
                    if (coordinateLayout) {
                        node.x = node.graphmlX;
                        node.y = node.graphmlY;
                        node.z = node.graphmlZ;
                        node.fx = node.graphmlX;
                        node.fy = node.graphmlY;
                        node.fz = node.graphmlZ;
                    } else {
                        delete node.fx;
                        delete node.fy;
                        delete node.fz;
                    }
                }
                event.currentTarget.textContent = coordinateLayout ? 'Coordinates' : 'Force';
                event.currentTarget.title = coordinateLayout
                    ? 'Switch to force-directed layout'
                    : 'Restore original GraphML coordinates';
                event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
                event.currentTarget.setAttribute('aria-pressed', String(coordinateLayout));
                focusedNode = null;
                graph.graphData({ nodes, links });
                graph.d3ReheatSimulation();
                graph.zoomToFit(650, 48);
            },
        });
        layoutButton.classList.add('graph3d-toggle');
    }
    const labelsButton = addButton({
        label: 'Labels',
        title: 'Toggle node hover labels',
        pressed: showLabels,
        run: (event) => {
            showLabels = !showLabels;
            event.currentTarget.setAttribute('aria-pressed', String(showLabels));
            graph.nodeLabel(showLabels ? (node) => escapeHtml(node.id) : () => '');
        },
    });
    labelsButton.classList.add('graph3d-toggle');
    const edgesButton = addButton({
        label: 'Edges',
        title: 'Toggle graph edges',
        pressed: showEdges,
        run: (event) => {
            showEdges = !showEdges;
            event.currentTarget.setAttribute('aria-pressed', String(showEdges));
            graph.linkVisibility(showEdges);
        },
    });
    edgesButton.classList.add('graph3d-toggle');
    addButton({
        label: '⛶',
        title: 'Toggle fullscreen',
        run: async () => {
            try {
                if (document.fullscreenElement === stage) {
                    await document.exitFullscreen();
                } else {
                    await stage.requestFullscreen();
                }
            } catch (error) {
                metaEl.textContent = `Could not change fullscreen mode: ${error.message}`;
            }
        },
    });
    stage.append(toolbar, details);

    return {
        setNodes(nextNodes, nextLinks) {
            nodes = nextNodes;
            links = nextLinks;
            search.value = '';
            focusedNode = null;
            updateSearch();
        },
        setHoveredNode(node) {
            if (!node) {
                details.textContent = search.value.trim()
                    ? `${searchMatches.length} matching ${searchMatches.length === 1 ? 'node' : 'nodes'}`
                    : '';
                return;
            }
            const type = Number.isFinite(node.nodetype) ? ` · type ${node.nodetype}` : '';
            const degree = node.degree || 0;
            details.textContent = `${node.id} · ${degree} ${degree === 1 ? 'connection' : 'connections'}${type}`;
        },
        focusNode,
        dispose() {
            toolbar.remove();
            details.remove();
        },
    };
}

function prepareGraphData(parsed) {
    const nodes = parsed.nodes.map((node) => ({
        ...node,
        graphmlX: node.x,
        graphmlY: node.y,
        graphmlZ: node.z,
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    for (const link of parsed.links) {
        degree.set(link.source, (degree.get(link.source) || 0) + 1);
        degree.set(link.target, (degree.get(link.target) || 0) + 1);
    }
    for (const node of nodes) node.degree = degree.get(node.id) || 0;

    const hasCoordinates = nodes.every((node) =>
        Number.isFinite(node.x) && Number.isFinite(node.y));
    if (hasCoordinates) {
        for (const node of nodes) {
            node.z = Number.isFinite(node.z) ? node.z : 0;
            node.graphmlZ = node.z;
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
        }
    } else {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        nodes.forEach((node, index) => {
            const y = 1 - 2 * (index / Math.max(1, nodes.length - 1));
            const radius = Math.sqrt(Math.max(0, 1 - y * y)) * 40;
            const angle = goldenAngle * index;
            node.x = Math.cos(angle) * radius;
            node.y = y * 40;
            node.z = Math.sin(angle) * radius;
        });
    }

    const links = parsed.links
        .filter((link) => byId.has(link.source) && byId.has(link.target))
        .map((link) => ({
            ...link,
            source: byId.get(link.source),
            target: byId.get(link.target),
        }));
    return { nodes, links, hasCoordinates };
}

export function initGraph3d({ container, meta }) {
    const stage = document.querySelector(container);
    const metaEl = document.querySelector(meta);
    if (!stage || !metaEl) {
        console.warn('[graph3d] pane-B elements not found — check index.html.');
        return { render() { }, clear() { } };
    }

    let graph = null;
    let controls = null;
    let resizeObserver = null;

    function ensureGraph() {
        if (graph) return graph;
        if (typeof window.ForceGraph3D !== 'function') {
            throw new Error('The 3D graph library did not load. Check the network connection and refresh.');
        }

        graph = new window.ForceGraph3D(stage)
            .width(stage.clientWidth || 640)
            .height(stage.clientHeight || 420)
            .backgroundColor('rgba(255,255,255,0)')
            .showNavInfo(false)
            .enableNodeDrag(true)
            .nodeId('id')
            .nodeLabel((node) => escapeHtml(node.id))
            .nodeColor(() => ACCENT)
            .nodeVal((node) => Math.max(1, Math.min(10, 2 + (node.degree || 0) * 0.35)))
            .nodeRelSize(4)
            .linkColor(() => LINK)
            .linkLabel((link) => {
                const source = typeof link.source === 'object' ? link.source.id : link.source;
                const target = typeof link.target === 'object' ? link.target.id : link.target;
                return `${escapeHtml(source)} → ${escapeHtml(target)}` +
                    `${link.type ? ` · ${escapeHtml(link.type)}` : ''}`;
            })
            .linkOpacity(0.48)
            .linkWidth(0.8)
            .linkDirectionalArrowLength((link) => link.directed ? 3 : 0)
            .linkDirectionalArrowColor(() => LINK)
            .linkDirectionalArrowRelPos(1)
            .linkCurvature(0.08)
            .d3VelocityDecay(0.32)
            .warmupTicks(40)
            .cooldownTicks(120);
        graph.onNodeClick((node) => controls?.focusNode(node));
        graph.onNodeHover((node) => controls?.setHoveredNode(node));
        graph.onEngineStop(() => graph.zoomToFit(500, 48));
        resizeObserver = new ResizeObserver(() => {
            if (stage.clientWidth && stage.clientHeight) {
                graph.width(stage.clientWidth).height(stage.clientHeight);
            }
        });
        resizeObserver.observe(stage);
        return graph;
    }

    function clear(message = INITIAL_MESSAGE) {
        controls?.dispose();
        controls = null;
        if (graph) graph.graphData({ nodes: [], links: [] });
        stage.classList.remove('has-node-hover');
        metaEl.textContent = message;
    }

    metaEl.textContent = INITIAL_MESSAGE;

    return {
        clear,
        render(name, graphmlText) {
            clear();
            if (!graphmlText || !graphmlText.trim()) {
                metaEl.textContent = 'The Engine response did not include GraphML data — ' +
                    'check the field mapped to "graphml" in js/api/runnerClient.js.';
                return;
            }
            try {
                const parsed = parseGraphml(graphmlText);
                const data = prepareGraphData(parsed);
                const renderer = ensureGraph();
                controls = createControls(stage, renderer, metaEl, data.hasCoordinates);
                controls.setNodes(data.nodes, data.links);
                renderer
                    .nodeColor((node) => node.nodetype == null
                        ? ACCENT
                        : NODE_PALETTE[Math.abs(Math.trunc(node.nodetype)) % (NODE_PALETTE.length - 1)])
                    .graphData(data);
                const nodeCount = `${data.nodes.length} ${data.nodes.length === 1 ? 'node' : 'nodes'}`;
                const edgeCount = `${data.links.length} ${data.links.length === 1 ? 'edge' : 'edges'}`;
                metaEl.textContent = `${name} · ${nodeCount} · ${edgeCount} · ` +
                    (data.hasCoordinates
                        ? 'GraphML coordinates preserved · 3D navigation enabled'
                        : '3D force-directed layout');
            } catch (error) {
                metaEl.textContent = error.message.includes('WebGLRenderer')
                    ? `Could not render ${name}: WebGL is unavailable in this browser or device. ${error.message}`
                    : `Could not render ${name}: ${error.message}`;
            }
        },
    };
}
