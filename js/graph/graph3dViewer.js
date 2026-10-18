import { parseGraphML } from './graphMLParser.js';

const ACCENT_COLOR = '#0f766e';
const LINK_COLOR = '#57534e';
const NODE_PALETTE = ['#0f766e', '#2563eb', '#b45309', '#7c3aed', '#be123c', '#0f766e'];
const INITIAL_MESSAGE = 'Run the Engine to explore its GraphML result.';
const THREE = window.THREE;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

function getNodeColor(node, focusedNode = null, hasSearchQuery = false, searchMatches = []) {
    if (focusedNode && node.id === focusedNode.id) return '#d97706';
    if (hasSearchQuery && !searchMatches.includes(node.id)) return '#cbd5e1';
    if (Number.isFinite(node.nodetype)) {
        const type = Math.abs(Math.trunc(node.nodetype)) % (NODE_PALETTE.length - 1);
        return NODE_PALETTE[type];
    }
    return ACCENT_COLOR;
}

function getNodeValue(node) {
    return Math.max(1, Math.min(10, 2 + (node.degree || 0) * 0.35));
}

function getNodeRadius(node) {
    return 4 * Math.cbrt(getNodeValue(node));
}

function getLinkVector({ source, target }) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    return { dx, dy, dz, length: Math.hypot(dx, dy, dz) };
}

function getArrowLength(link) {
    if (!link.directed) return 0;
    return Math.min(14, Math.max(6, getLinkVector(link).length * 0.24));
}

function getArrowPosition(link) {
    if (!link.directed) return 1;
    const { source, target } = link;
    const { dx, dy, dz, length } = getLinkVector(link);
    if (!length) return 1;

    const direction = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / length;
    const targetFaceDistance = getNodeRadius(target) / direction;
    const exposedLength = length - getNodeRadius(source) - getNodeRadius(target) - getArrowLength(link);
    if (exposedLength <= 0) return 1;

    return Math.max(0, Math.min(1,
        (length - targetFaceDistance - getNodeRadius(source) - getArrowLength(link)) / exposedLength));
}

function getNodeDetails(node) {
    const degree = node.degree || 0;
    const type = Number.isFinite(node.nodetype) ? ` · type ${node.nodetype}` : '';
    return `${node.id} · ${degree} ${degree === 1 ? 'connection' : 'connections'}${type}`;
}

function getMatchCount(count) {
    return `${count} matching ${count === 1 ? 'node' : 'nodes'}`;
}

function getGraphBounds(nodes) {
    return ['x', 'y', 'z'].map((axis) => {
        const values = nodes.map((node) => Number.isFinite(node[axis]) ? node[axis] : 0);
        return {
            min: Math.min(...values),
            max: Math.max(...values),
        };
    });
}

function createNodeLabel(node, size) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas for node labels.');

    const fontSize = 48;
    context.font = `600 ${fontSize}px sans-serif`;
    const text = String(node.id);
    const textWidth = Math.ceil(context.measureText(text).width);
    canvas.width = Math.min(1024, Math.max(128, textWidth + 32));
    canvas.height = 72;
    context.font = `600 ${fontSize}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = 9;
    context.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = '#1f2937';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const labelHeight = size * 0.85;
    const labelWidth = labelHeight * canvas.width / canvas.height;
    sprite.scale.set(labelWidth, labelHeight, 1);
    const direction = node.labelDirection || { x: 1, y: 0 };
    if (Math.abs(direction.x) >= Math.abs(direction.y)) {
        const side = direction.x < 0 ? -1 : 1;
        sprite.position.x = side * (size / 2 + labelWidth / 2 + size * 0.15);
    } else {
        const side = direction.y < 0 ? -1 : 1;
        sprite.position.y = side * (size / 2 + labelHeight / 2 + size * 0.15);
    }
    sprite.renderOrder = 1;
    return { sprite, texture, material };
}

function createControls(stage, graph, metaEl, fitView) {
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
    let searchMatches = [];
    let hasSearchQuery = false;
    let showLabels = false;
    let showEdges = true;
    let focusedNode = null;
    const nodeColor = (node) => getNodeColor(node, focusedNode, hasSearchQuery, searchMatches);
    const updateNodeColors = () => {
        for (const node of nodes) {
            node.graphBoxMaterial?.color.set(nodeColor(node));
        }
    };
    const updateNodeLabels = () => {
        graph.nodeLabel(showLabels ? (node) => escapeHtml(node.id) : () => '');
        for (const node of nodes) {
            if (node.graphLabelSprite) node.graphLabelSprite.visible = showLabels;
        }
    };

    const updateSearch = () => {
        const query = search.value.trim().toLocaleLowerCase();
        hasSearchQuery = Boolean(query);
        searchMatches = query
            ? nodes.filter((node) => node.id.toLocaleLowerCase().includes(query)).map((node) => node.id)
            : [];
        graph.nodeColor(nodeColor);
        updateNodeColors();
        details.textContent = query ? getMatchCount(searchMatches.length) : '';
    };

    const focusNode = (node) => {
        if (!node) return;
        focusedNode = node;
        updateSearch();
        const { x = 0, y = 0, z = 0 } = node;
        const graphNodes = graph.graphData().nodes.filter((graphNode) => !graphNode.isBend);
        const distance = Math.max(
            getNodeRadius(node) * 5,
            ...graphNodes.map((graphNode) => Math.hypot(
                graphNode.x - x,
                graphNode.y - y,
                graphNode.z - z,
            ) * 0.2),
        );
        graph.cameraPosition(
            { x: x + distance, y: y + distance * 0.65, z: z + distance },
            { x, y, z },
            800,
        );
        details.textContent = getNodeDetails(node);
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
        title: 'Fit the graph without changing its view direction',
        run: () => fitView(false),
    });
    addButton({
        label: 'Fix',
        title: 'Reset rotation, center, and fit the graph',
        run: () => {
            search.value = '';
            focusedNode = null;
            updateSearch();
            fitView(true);
        },
    });
    const labelsButton = addButton({
        label: 'Labels',
        title: 'Show or hide node names',
        pressed: showLabels,
        run: (event) => {
            showLabels = !showLabels;
            event.currentTarget.setAttribute('aria-pressed', String(showLabels));
            updateNodeLabels();
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
        setNodes(nextNodes) {
            nodes = nextNodes;
            search.value = '';
            focusedNode = null;
            updateNodeLabels();
            updateSearch();
        },
        labelsVisible: () => showLabels,
        setHoveredNode(node) {
            if (!node) {
                details.textContent = search.value.trim() ? getMatchCount(searchMatches.length) : '';
                return;
            }
            details.textContent = getNodeDetails(node);
        },
        focusNode,
        dispose() {
            toolbar.remove();
            details.remove();
        },
    };
}

function prepareGraphData(parsed) {
    const nodes = parsed.nodes.map((node) => ({ ...node }));
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
            node.y = -node.y;
            node.z = Number.isFinite(node.z) ? node.z : 0;
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

    const links = [];
    const usedIds = new Set(byId.keys());
    let bendId = 0;
    for (const link of parsed.links) {
        const source = byId.get(link.source);
        const target = byId.get(link.target);
        if (!source || !target) continue;

        const bends = hasCoordinates ? (link.bends || []) : [];
        const route = [source];
        bends.forEach((bend, index) => {
            const progress = (index + 1) / (bends.length + 1);
            const z = Number.isFinite(bend.z)
                ? bend.z
                : source.z + (target.z - source.z) * progress;
            let id;
            do {
                id = `__graphml_bend_${bendId++}`;
            } while (usedIds.has(id));
            usedIds.add(id);
            const bendNode = {
                id,
                isBend: true,
                x: bend.x,
                y: hasCoordinates ? -bend.y : bend.y,
                z,
            };
            if (hasCoordinates) {
                bendNode.fx = bendNode.x;
                bendNode.fy = bendNode.y;
                bendNode.fz = bendNode.z;
            }
            nodes.push(bendNode);
            route.push(bendNode);
        });
        route.push(target);

        for (let index = 1; index < route.length; index++) {
            links.push({
                ...link,
                source: route[index - 1],
                target: route[index],
                graphMLSource: link.source,
                graphMLTarget: link.target,
                directed: link.directed && index === route.length - 1,
            });
        }
    }
    const labelDirections = new Map();
    for (const link of links) {
        if (link.target.isBend) continue;
        const direction = labelDirections.get(link.target.id) || { x: 0, y: 0 };
        direction.x += link.target.x - link.source.x;
        direction.y += link.target.y - link.source.y;
        labelDirections.set(link.target.id, direction);
    }
    for (const node of nodes) {
        const direction = labelDirections.get(node.id);
        if (!direction || (direction.x === 0 && direction.y === 0)) continue;
        const length = Math.hypot(direction.x, direction.y);
        node.labelDirection = {
            x: -direction.y / length,
            y: direction.x / length,
        };
    }
    if (hasCoordinates) {
        const center = {};
        for (const axis of ['x', 'y', 'z']) {
            const values = nodes.map((node) => node[axis]);
            center[axis] = (Math.min(...values) + Math.max(...values)) / 2;
        }
        for (const node of nodes) {
            for (const axis of ['x', 'y', 'z']) {
                node[axis] -= center[axis];
                node[`f${axis}`] = node[axis];
            }
        }
    }
    return {
        nodes,
        links,
        nodeCount: parsed.nodes.length,
        edgeCount: parsed.links.length,
        hasCoordinates,
    };
}

export function createGraph3dViewer({ stageSelector, metaSelector }) {
    const stage = document.querySelector(stageSelector);
    const metaEl = document.querySelector(metaSelector);
    if (!stage || !metaEl) {
        console.warn('[graph3d] pane-B elements not found — check index.html.');
        return { render() {}, clear() {} };
    }

    let graph = null;
    let controls = null;
    let resizeObserver = null;
    let fitPending = false;
    let fitOnEngineStop = false;

    function fitGraph(resetOrientation = true) {
        if (!graph || !stage.clientWidth || !stage.clientHeight) return false;
        const { nodes } = graph.graphData();
        if (!nodes.length) return false;
        const bounds = getGraphBounds(nodes);
        const center = bounds.map(({ min, max }) => (min + max) / 2);
        const radius = Math.max(1, Math.hypot(
            ...bounds.map(({ min, max }) => (max - min) / 2),
        ));
        const navigation = graph.controls();
        navigation.minDistance = Math.max(1, radius * 0.05);
        navigation.maxDistance = Math.max(100, radius * 100);
        navigation.enableDamping = true;
        navigation.dampingFactor = 0.08;
        navigation.rotateSpeed = 0.7;
        navigation.zoomSpeed = 0.8;

        if (resetOrientation) {
            const camera = graph.camera();
            const verticalHalfFov = ((camera.fov || 60) * Math.PI) / 360;
            const horizontalHalfFov = Math.atan(
                Math.tan(verticalHalfFov) * stage.clientWidth / stage.clientHeight,
            );
            const fitDistance = (radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))) * 1.2;
            const wasDampingEnabled = navigation.enableDamping;
            navigation.enableDamping = false;
            navigation.update();
            camera.up.set(0, 1, 0);
            graph.cameraPosition({
                x: center[0],
                y: center[1],
                z: center[2] + fitDistance,
            }, {
                x: center[0],
                y: center[1],
                z: center[2],
            }, 0);
            navigation.update();
            navigation.saveState();
            navigation.enableDamping = wasDampingEnabled;
            return true;
        }
        graph.zoomToFit(500, 56);
        return true;
    }

    function ensureGraph() {
        if (graph) return graph;
        if (typeof window.ForceGraph3D !== 'function') {
            throw new Error('The 3D graph library did not load. Check the network connection and refresh.');
        }
        if (!THREE) {
            throw new Error('Three.js did not load. Check the network connection and refresh.');
        }

        graph = new window.ForceGraph3D(stage, { controlType: 'orbit' })
            .width(stage.clientWidth || 640)
            .height(stage.clientHeight || 420)
            .backgroundColor('rgba(255,255,255,0)')
            .showNavInfo(false)
            .enableNodeDrag(false)
            .nodeId('id')
            .nodeLabel((node) => escapeHtml(node.id))
            .nodeVisibility((node) => !node.isBend)
            .nodeThreeObject((node) => {
                if (node.isBend) return undefined;
                const size = 2 * getNodeRadius(node);
                const material = new THREE.MeshStandardMaterial({
                    color: getNodeColor(node),
                    roughness: 0.55,
                    metalness: 0.05,
                });
                const geometry = new THREE.BoxGeometry(size, size, size);
                const { sprite, texture, material: labelMaterial } = createNodeLabel(node, size);
                const object = new THREE.Group();
                object.add(new THREE.Mesh(geometry, material), sprite);
                sprite.visible = controls?.labelsVisible() ?? false;
                node.graphBoxMaterial = material;
                node.graphBoxGeometry = geometry;
                node.graphLabelSprite = sprite;
                node.graphLabelTexture = texture;
                node.graphLabelMaterial = labelMaterial;
                return object;
            })
            .nodeThreeObjectExtend(false)
            .nodeColor(() => ACCENT_COLOR)
            .nodeVal(getNodeValue)
            .nodeRelSize(4)
            .linkColor(() => LINK_COLOR)
            .linkLabel((link) => {
                const source = link.graphMLSource ||
                    (typeof link.source === 'object' ? link.source.id : link.source);
                const target = link.graphMLTarget ||
                    (typeof link.target === 'object' ? link.target.id : link.target);
                return `${escapeHtml(source)} → ${escapeHtml(target)}` +
                    `${link.type ? ` · ${escapeHtml(link.type)}` : ''}`;
            })
            .linkOpacity(0.82)
            .linkWidth(1.2)
            .linkDirectionalArrowLength(getArrowLength)
            .linkDirectionalArrowColor(() => LINK_COLOR)
            .linkDirectionalArrowRelPos(getArrowPosition)
            .linkCurvature(0)
            .d3VelocityDecay(0.32)
            .warmupTicks(40)
            .cooldownTicks(120);
        graph.onNodeClick((node) => controls?.focusNode(node));
        graph.onNodeHover((node) => controls?.setHoveredNode(node));
        graph.onEngineStop(() => {
            if (fitOnEngineStop && fitGraph(true)) fitOnEngineStop = false;
        });
        resizeObserver = new ResizeObserver(() => {
            if (stage.clientWidth && stage.clientHeight) {
                graph.width(stage.clientWidth).height(stage.clientHeight);
                if (fitPending && fitGraph(true)) fitPending = false;
            }
        });
        resizeObserver.observe(stage);
        return graph;
    }

    function clear(message = INITIAL_MESSAGE) {
        controls?.dispose();
        controls = null;
        fitPending = false;
        fitOnEngineStop = false;
        if (graph) {
            for (const node of graph.graphData().nodes) {
                node.graphBoxGeometry?.dispose();
                node.graphBoxMaterial?.dispose();
                node.graphLabelTexture?.dispose();
                node.graphLabelMaterial?.dispose();
            }
            graph.graphData({ nodes: [], links: [] });
        }
        stage.classList.remove('has-node-hover');
        metaEl.textContent = message;
    }

    metaEl.textContent = INITIAL_MESSAGE;

    return {
        clear,
        render(name, graphMLText) {
            clear();
            if (!graphMLText || !graphMLText.trim()) {
                metaEl.textContent = 'The Engine response did not include GraphML data — ' +
                    'check the field mapped to "graphml" in js/api/engineClient.js.';
                return;
            }
            try {
                const parsed = parseGraphML(graphMLText);
                const data = prepareGraphData(parsed);
                const renderer = ensureGraph();
                controls = createControls(stage, renderer, metaEl, fitGraph);
                controls.setNodes(data.nodes);
                renderer.enableNodeDrag(!data.hasCoordinates);
                fitPending = true;
                fitOnEngineStop = !data.hasCoordinates;
                renderer
                    .nodeColor((node) => getNodeColor(node))
                    .graphData(data);
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (fitPending && fitGraph(true)) fitPending = false;
                }));
                const nodeCount = `${data.nodeCount} ${data.nodeCount === 1 ? 'node' : 'nodes'}`;
                const edgeCount = `${data.edgeCount} ${data.edgeCount === 1 ? 'edge' : 'edges'}`;
                metaEl.textContent = `${name} · ${nodeCount} · ${edgeCount} · ` +
                    (data.hasCoordinates
                        ? 'GraphML coordinates preserved · 3D navigation enabled'
                        : '3D force-directed layout');
            } catch (error) {
                metaEl.textContent = error.message.includes('WebGLRenderer')
                    ? `Could not render ${name}: WebGL is unavailable in this browser or device. ` +
                        error.message
                    : `Could not render ${name}: ${error.message}`;
            }
        },
    };
}
