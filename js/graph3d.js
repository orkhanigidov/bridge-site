import { parseGraphml } from './graphml.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT = '#0f766e';
const LINK = '#a8a29e';
const VIEW_W = 1000;
const VIEW_H = 600;
const PAD = 48;
let nextMarkerId = 0;

function buildForceGraphData(parsed) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const nodes = parsed.nodes.map((node, i) => {
        const y = 1 - (i / Math.max(parsed.nodes.length - 1, 1)) * 2;
        const radius = Math.sqrt(Math.max(1 - y * y, 0));
        const angle = golden * i;
        return {
            id: node.id,
            x: Math.cos(angle) * radius * 40,
            y: y * 40,
            z: Math.sin(angle) * radius * 40,
        };
    });
    return { nodes, links: parsed.links };
}

function renderGraphSvg(stage, parsed) {
    const allPoints = [
        ...parsed.nodes,
        ...parsed.links.flatMap((link) => link.bends || []),
    ];
    const bounds = (axis) => ({
        min: Math.min(...allPoints.map((item) => Number.isFinite(item[axis]) ? item[axis] : 0)),
        max: Math.max(...allPoints.map((item) => Number.isFinite(item[axis]) ? item[axis] : 0)),
    });
    const boundsX = bounds('x');
    const boundsY = bounds('y');
    const boundsZ = bounds('z');
    const center = {
        x: (boundsX.min + boundsX.max) / 2,
        y: (boundsY.min + boundsY.max) / 2,
        z: (boundsZ.min + boundsZ.max) / 2,
    };
    const initialRotateX = boundsZ.max !== boundsZ.min ? 24 : 0;
    const initialRotateY = boundsZ.max !== boundsZ.min ? -24 : 0;
    let rotateX = initialRotateX;
    let rotateY = initialRotateY;
    let orbitMode = false;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    const byId = new Map(parsed.nodes.map((node) => [node.id, node]));
    const svg = document.createElementNS(SVG_NS, 'svg');
    const interactionController = new AbortController();
    svg.classList.add('graph2d-canvas');
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'GraphML layout rendered from node coordinates');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-describedby', 'graph3d-meta');

    const clipId = `graph-clip-${++nextMarkerId}`;
    const markerId = `graph-arrow-${++nextMarkerId}`;
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipRect = document.createElementNS(SVG_NS, 'rect');
    clipRect.setAttribute('width', String(VIEW_W));
    clipRect.setAttribute('height', String(VIEW_H));
    clip.append(clipRect);
    defs.append(clip);
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS(SVG_NS, 'path');
    arrow.setAttribute('d', 'M 0 0 L 8 4 L 0 8 Z');
    arrow.setAttribute('class', 'graph2d-arrow');
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    edgeLayer.setAttribute('class', 'graph3d-edges');
    edgeLayer.setAttribute('clip-path', `url(#${clipId})`);
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    nodeLayer.setAttribute('class', 'graph3d-nodes');
    nodeLayer.setAttribute('clip-path', `url(#${clipId})`);
    svg.append(edgeLayer, nodeLayer);

    const edgeElements = [];
    for (const link of parsed.links) {
        const source = byId.get(link.source);
        const target = byId.get(link.target);
        if (!source || !target) continue;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'graph2d-edge');
        if (link.type) {
            path.setAttribute('data-edge-type', link.type);
            const title = document.createElementNS(SVG_NS, 'title');
            title.textContent = link.type;
            path.append(title);
        }
        if (link.directed) path.setAttribute('marker-end', `url(#${markerId})`);
        edgeLayer.append(path);
        edgeElements.push({ path, source, target, points: [source, ...(link.bends || []), target] });
    }

    const nodeElements = [];
    for (const node of parsed.nodes) {
        const width = node.width || node.size || 0;
        const height = node.height || node.size || 0;
        const isEllipse = ['ellipse', 'oval', 'circle'].includes(node.shape);
        const shape = document.createElementNS(SVG_NS, isEllipse ? 'ellipse' : 'rect');
        shape.setAttribute('class', 'graph2d-node');
        if (Number.isFinite(node.nodetype)) {
            shape.setAttribute('data-node-type', String(node.nodetype));
        }
        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent = `${node.id}${node.shape ? ` · ${node.shape}` : ''}` +
            `${Number.isFinite(node.nodetype) ? ` · type ${node.nodetype}` : ''}`;
        shape.append(title);
        nodeLayer.append(shape);
        nodeElements.push({ node, shape, width, height, isEllipse });
    }
    stage.querySelector('.graph2d-canvas')?.remove();
    stage.querySelector('.graph2d-controls')?.remove();
    stage.append(svg);

    const rotate = (item) => {
        const x = (Number.isFinite(item.x) ? item.x : 0) - center.x;
        const y = (Number.isFinite(item.y) ? item.y : 0) - center.y;
        const z = (Number.isFinite(item.z) ? item.z : 0) - center.z;
        const angleY = rotateY * Math.PI / 180;
        const angleX = rotateX * Math.PI / 180;
        const rotatedX = x * Math.cos(angleY) + z * Math.sin(angleY);
        const rotatedZ = -x * Math.sin(angleY) + z * Math.cos(angleY);
        return {
            x: rotatedX,
            y: y * Math.cos(angleX) - rotatedZ * Math.sin(angleX),
            z: y * Math.sin(angleX) + rotatedZ * Math.cos(angleX),
        };
    };

    function renderProjection() {
        const rotated = allPoints.map(rotate);
        const radius = Math.max(1, ...rotated.map((point) =>
            Math.hypot(point.x, point.y, point.z)));
        const cameraDistance = radius * 3;
        const project = (item) => {
            const point = rotate(item);
            const perspective = cameraDistance / Math.max(cameraDistance * 0.25, cameraDistance - point.z);
            return {
                x: point.x * perspective,
                y: point.y * perspective,
                z: point.z,
                perspective,
            };
        };
        const projected = allPoints.map(project);
        const minX = Math.min(...projected.map((point) => point.x));
        const maxX = Math.max(...projected.map((point) => point.x));
        const minY = Math.min(...projected.map((point) => point.y));
        const maxY = Math.max(...projected.map((point) => point.y));
        const maxNodeWidth = Math.max(0, ...nodeElements.map((item) => item.width));
        const maxNodeHeight = Math.max(0, ...nodeElements.map((item) => item.height));
        const maxPerspective = Math.max(1, ...projected.map((point) => point.perspective));
        const perspectiveScale = Math.min(
            Math.max(1, VIEW_W - 2 * PAD - maxNodeWidth * maxPerspective) / (maxX - minX || 1),
            Math.max(1, VIEW_H - 2 * PAD - maxNodeHeight * maxPerspective) / (maxY - minY || 1),
        );
        const scale = perspectiveScale * zoom;
        const offsetX = (VIEW_W - (maxX - minX) * scale) / 2 - minX * scale;
        const offsetY = (VIEW_H - (maxY - minY) * scale) / 2 - minY * scale;
        const nodeBounds = nodeElements.map(({ node, width, height }) => {
            const point = project(node);
            const halfWidth = (width ? width * point.perspective : 12 * point.perspective) / 2;
            const halfHeight = (height ? height * point.perspective : 12 * point.perspective) / 2;
            return {
                minX: offsetX + point.x * scale - halfWidth,
                maxX: offsetX + point.x * scale + halfWidth,
                minY: offsetY + point.y * scale - halfHeight,
                maxY: offsetY + point.y * scale + halfHeight,
            };
        });
        const contentBounds = {
            minX: Math.min(minX * scale + offsetX, ...nodeBounds.map((b) => b.minX)) - 8,
            maxX: Math.max(maxX * scale + offsetX, ...nodeBounds.map((b) => b.maxX)) + 8,
            minY: Math.min(minY * scale + offsetY, ...nodeBounds.map((b) => b.minY)) - 8,
            maxY: Math.max(maxY * scale + offsetY, ...nodeBounds.map((b) => b.maxY)) + 8,
        };
        const clampPan = (pan, min, max, size, padding) => {
            return Math.max(padding - min, Math.min(size - padding - max, pan));
        };
        panX = clampPan(panX, contentBounds.minX, contentBounds.maxX, VIEW_W, PAD);
        panY = clampPan(panY, contentBounds.minY, contentBounds.maxY, VIEW_H, PAD);
        const toScreen = (item) => {
            const point = project(item);
            return {
                x: offsetX + point.x * scale + panX,
                y: offsetY + point.y * scale + panY,
                z: point.z,
                perspective: point.perspective,
            };
        };

        const orderedEdges = edgeElements.map((edge) => ({
            ...edge,
            depth: edge.points.reduce((total, item) => total + rotate(item).z, 0) / edge.points.length,
        })).sort((a, b) => a.depth - b.depth);
        for (const { path, source, target, points } of orderedEdges) {
            edgeLayer.append(path);
            const screenPoints = points.map(toScreen);
            const sourceNode = byId.get(source.id);
            const targetNode = byId.get(target.id);
            const trimEndpoint = (point, neighbor, node) => {
                const dx = point.x - neighbor.x;
                const dy = point.y - neighbor.y;
                const distance = Math.hypot(dx, dy) || 1;
                const nodeWidth = node.width || node.size || 12 / scale;
                const nodeHeight = node.height || node.size || 12 / scale;
                const radius = Math.min(
                    Math.abs(dx) ? (nodeWidth * scale / 2) / Math.abs(dx / distance) : Infinity,
                    Math.abs(dy) ? (nodeHeight * scale / 2) / Math.abs(dy / distance) : Infinity,
                );
                return { x: point.x - (dx / distance) * radius, y: point.y - (dy / distance) * radius };
            };
            screenPoints[0] = trimEndpoint(screenPoints[0], screenPoints[1], sourceNode);
            screenPoints[screenPoints.length - 1] = trimEndpoint(
                screenPoints[screenPoints.length - 1],
                screenPoints[screenPoints.length - 2],
                targetNode,
            );
            path.setAttribute('d', screenPoints
                .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
                .join(' '));
            path.style.opacity = String(0.55 + 0.45 * Math.min(1,
                (screenPoints.reduce((sum, point) => sum + (point.perspective || 1), 0) /
                    screenPoints.length) / 1.5));
        }
        const orderedNodes = nodeElements.map((item) => ({
            ...item,
            projected: toScreen(item.node),
        })).sort((a, b) => a.projected.z - b.projected.z);
        for (const { node, shape, width, height, isEllipse, projected: point } of orderedNodes) {
            nodeLayer.append(shape);
            const { x, y } = point;
            const screenWidth = width ? width * scale * point.perspective : 12 * point.perspective;
            const screenHeight = height ? height * scale * point.perspective : 12 * point.perspective;
            if (isEllipse) {
                shape.setAttribute('cx', String(x));
                shape.setAttribute('cy', String(y));
                shape.setAttribute('rx', String(screenWidth / 2));
                shape.setAttribute('ry', String(screenHeight / 2));
            } else {
                shape.setAttribute('x', String(x - screenWidth / 2));
                shape.setAttribute('y', String(y - screenHeight / 2));
                shape.setAttribute('width', String(screenWidth));
                shape.setAttribute('height', String(screenHeight));
            }
            shape.style.opacity = String(0.7 + 0.3 * Math.min(1, point.perspective / 1.5));
        }
    }

    let dragging = null;
    const applyView = renderProjection;
    const setOrbit = (enabled) => {
        orbitMode = enabled;
        controls.querySelector('[data-orbit]').setAttribute('aria-pressed', String(enabled));
        svg.classList.toggle('is-orbit-mode', enabled);
        applyView();
    };
    const resetView = () => {
        zoom = 1;
        panX = 0;
        panY = 0;
        rotateX = initialRotateX;
        rotateY = initialRotateY;
        orbitMode = false;
        controls.querySelector('[data-orbit]').setAttribute('aria-pressed', 'false');
        svg.classList.remove('is-orbit-mode');
        applyView();
    };
    const zoomBy = (factor) => {
        zoom = Math.max(0.25, Math.min(8, zoom * factor));
        applyView();
    };

    const controls = document.createElement('div');
    controls.className = 'graph2d-controls';
    const actions = [
        { label: '−', title: 'Zoom out', run: () => zoomBy(1 / 1.2) },
        { label: '+', title: 'Zoom in', run: () => zoomBy(1.2) },
        { label: 'Fit', title: 'Reset view', run: resetView },
        { label: '3D', title: 'Toggle 3D orbit mode; drag moves the graph by default', orbit: true },
        { label: '⛶', title: 'Toggle fullscreen', fullscreen: true },
    ];
    for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-btn';
        button.title = action.title;
        button.textContent = action.label;
        if (action.orbit) {
            button.dataset.orbit = '';
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', () => {
                const enabled = button.getAttribute('aria-pressed') !== 'true';
                setOrbit(enabled);
            });
        } else if (action.fullscreen) {
            button.addEventListener('click', async () => {
                try {
                    if (document.fullscreenElement === stage) {
                        await document.exitFullscreen();
                    } else if (stage.requestFullscreen) {
                        await stage.requestFullscreen();
                    } else {
                        metaEl.textContent = 'Fullscreen is not supported in this browser.';
                    }
                } catch (error) {
                    metaEl.textContent = `Could not change fullscreen mode: ${error.message}`;
                }
            });
        } else {
            button.addEventListener('click', action.run);
        }
        controls.append(button);
    }
    stage.append(controls);

    svg.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        dragging = { x: event.clientX, y: event.clientY };
        svg.classList.add('is-orbiting');
    }, { signal: interactionController.signal });
    window.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const dx = event.clientX - dragging.x;
        const dy = event.clientY - dragging.y;
        if (orbitMode) {
            rotateY += dx * 0.5;
            rotateX = Math.max(-75, Math.min(75, rotateX - dy * 0.5));
        } else {
            const rect = stage.getBoundingClientRect();
            panX += dx * VIEW_W / rect.width;
            panY += dy * VIEW_H / rect.height;
        }
        dragging = { x: event.clientX, y: event.clientY };
        applyView();
    }, { signal: interactionController.signal });
    const stopOrbit = () => {
        dragging = null;
        svg.classList.remove('is-orbiting');
    };
    window.addEventListener('pointerup', stopOrbit, { signal: interactionController.signal });
    window.addEventListener('pointercancel', stopOrbit, { signal: interactionController.signal });
    svg.addEventListener('wheel', (event) => {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false, signal: interactionController.signal });
    svg.addEventListener('dblclick', resetView, { signal: interactionController.signal });
    svg.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 30 : 10;
        if (event.key === '+' || event.key === '=') zoomBy(1.2);
        else if (event.key === '-') zoomBy(1 / 1.2);
        else if (event.key === '0') resetView();
        else if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            if (orbitMode) {
                if (event.key === 'ArrowLeft') rotateY -= step;
                if (event.key === 'ArrowRight') rotateY += step;
                if (event.key === 'ArrowUp') rotateX = Math.min(75, rotateX + step);
                if (event.key === 'ArrowDown') rotateX = Math.max(-75, rotateX - step);
            } else {
                if (event.key === 'ArrowLeft') panX += step;
                if (event.key === 'ArrowRight') panX -= step;
                if (event.key === 'ArrowUp') panY += step;
                if (event.key === 'ArrowDown') panY -= step;
            }
            applyView();
        }
    }, { signal: interactionController.signal });
    applyView();
    return () => interactionController.abort();
}

export function initGraph3d({ container, meta }) {
    const stage = document.querySelector(container);
    const metaEl = document.querySelector(meta);
    if (!stage || !metaEl) {
        console.warn('[graph3d] pane-B elements not found — check index.html.');
        return { render() { } };
    }

    let Graph = null;
    let ticks = 0;
    let dispose2d = () => { };

    function ensureForceGraph() {
        if (Graph) return Graph;
        if (typeof window.ForceGraph3D !== 'function') return null;

        Graph = new window.ForceGraph3D(stage)
            .width(stage.clientWidth || 640)
            .height(stage.clientHeight || 420)
            .backgroundColor('rgba(0,0,0,0)')
            .showNavInfo(false)
            .nodeColor(() => ACCENT)
            .nodeLabel((node) => node.id)
            .linkColor(() => LINK)
            .linkOpacity(0.35);
        Graph.onEngineTick(() => { if (ticks++ < 30) Graph.zoomToFit(0, 40); });
        Graph.onEngineStop(() => Graph.zoomToFit(600, 40));
        new ResizeObserver(() => {
            if (stage.clientWidth && stage.clientHeight) {
                Graph.width(stage.clientWidth).height(stage.clientHeight);
            }
        }).observe(stage);
        return Graph;
    }

    function clear(message = 'Waiting for the Engine to return GraphML…') {
        dispose2d();
        dispose2d = () => { };
        stage.querySelector('.graph2d-canvas')?.remove();
        stage.querySelector('.graph2d-controls')?.remove();
        if (Graph) Graph.graphData({ nodes: [], links: [] });
        const canvas = stage.querySelector('canvas');
        if (canvas) canvas.style.display = 'none';
        metaEl.textContent = message;
    }

    metaEl.textContent = 'Run the Engine — drag to move; 3D toggles orbit. Use +/− to zoom, Fit to reset, ⛶ for fullscreen.';

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
                const hasCoordinates = parsed.nodes.length > 0 &&
                    parsed.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
                if (hasCoordinates) {
                    dispose2d = renderGraphSvg(stage, parsed);
                    metaEl.textContent = `${name} — ${parsed.nodes.length} nodes · ${parsed.links.length} edges · ` +
                        'GraphML coordinates · drag to move, 3D toggles orbit';
                    return;
                }

                const graph = ensureForceGraph();
                const canvas = stage.querySelector('canvas');
                if (!graph || !canvas) {
                    throw new Error('GraphML has no x/y coordinates and the 3D fallback is unavailable.');
                }
                canvas.style.display = 'block';
                const data = buildForceGraphData(parsed);
                ticks = 0;
                graph.nodeVal(parsed.nodes.length > 60 ? 1 : 2).graphData(data);
                metaEl.textContent = `${name} — ${parsed.nodes.length} nodes · ${parsed.links.length} edges · ` +
                    '3D force layout (GraphML has no x/y coordinates)';
            } catch (error) {
                metaEl.textContent = `Could not render ${name}: ${error.message}`;
            }
        },
    };
}
