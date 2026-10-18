/**
 * Engine SVG viewer: sanitizes the Engine's SVG, then renders it
 * with wheel zoom, drag pan, and SVG download — plain viewBox math,
 * no external library.
 * Both panes share the same white canvas; identity comes from the
 * pane chrome (side tag, accent border), so Engine colors render
 * identically on both sides.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM_FACTOR = 0.35; // deepest zoom-in vs base view
const MAX_ZOOM_FACTOR = 1.6;  // deepest zoom-out vs base view

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Parse SVG text into a detached <svg> node, stripped of anything executable. */
function parseEngineSvg(svgText) {
    let doc;
    try {
        doc = new DOMParser().parseFromString(String(svgText), 'image/svg+xml');
    } catch {
        return null;
    }
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        return null;
    }
    // Remove executable / embeddable elements outright.
    svg.querySelectorAll('script, foreignObject, iframe, object, embed, use')
        .forEach((node) => node.remove());
    // Strip event handlers and javascript: URLs from every element.
    for (const el of svg.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            const isUrlAttr = name === 'href' || name === 'xlink:href';
            if (name.startsWith('on') || (isUrlAttr && value.startsWith('javascript:'))) {
                el.removeAttribute(attr.name);
            }
        }
    }
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', SVG_NS);
    return svg;
}

/** Read the SVG's own coordinate system; fall back to a sane default. */
function getBaseView(svg) {
    const raw = svg.getAttribute('viewBox');
    if (raw) {
        const [x, y, w, h] = raw.split(/[\s,]+/).map(Number);
        if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
            return { x, y, w, h };
        }
    }
    const w = parseFloat(svg.getAttribute('width')) || 800;
    const h = parseFloat(svg.getAttribute('height')) || 600;
    return { x: 0, y: 0, w, h };
}

/** Attach wheel-zoom + drag-pan to an SVG via viewBox manipulation. */
function attachViewer(svg, base) {
    const view = { ...base };
    const ratio = base.h / base.w;
    const minW = base.w * MIN_ZOOM_FACTOR;
    const maxW = base.w * MAX_ZOOM_FACTOR;
    const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);

    function zoomAt(px, py, factor) {
        const nw = clamp(view.w * factor, minW, maxW);
        const k = nw / view.w;
        view.x = px - (px - view.x) * k;
        view.y = py - (py - view.y) * k;
        view.w = nw;
        view.h = nw * ratio;
        apply();
    }
    function clientToView(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
            x: view.x + ((clientX - rect.left) / rect.width) * view.w,
            y: view.y + ((clientY - rect.top) / rect.height) * view.h,
        };
    }
    const reset = () => {
        Object.assign(view, base);
        apply();
    };

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const point = clientToView(e.clientX, e.clientY);
        zoomAt(point.x, point.y, e.deltaY < 0 ? 0.88 : 1.14);
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
        drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
        svg.setPointerCapture(e.pointerId);
        svg.classList.add('is-panning');
    });
    svg.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const rect = svg.getBoundingClientRect();
        view.x = drag.vx - ((e.clientX - drag.sx) / rect.width) * view.w;
        view.y = drag.vy - ((e.clientY - drag.sy) / rect.height) * view.h;
        apply();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) =>
        svg.addEventListener(type, () => {
            drag = null;
            svg.classList.remove('is-panning');
        })
    );
    svg.addEventListener('dblclick', reset);

    return {
        zoomIn: () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 0.8),
        zoomOut: () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1.25),
        reset,
    };
}

function buildToolbar(svg, viewer) {
    const bar = document.createElement('div');
    bar.className = 'graph-toolbar';
    const buttons = [
        { label: '+', title: 'Zoom in', action: viewer.zoomIn },
        { label: '−', title: 'Zoom out', action: viewer.zoomOut },
        { label: 'Fit', title: 'Reset view', action: viewer.reset },
        {
            label: 'SVG',
            title: 'Download SVG',
            action: () => {
                const blob = new Blob(
                    [new XMLSerializer().serializeToString(svg)],
                    { type: 'image/svg+xml' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'engine-graph.svg';
                a.click();
                URL.revokeObjectURL(url);
            },
        },
    ];
    for (const { label, title, action } of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'graph-btn';
        btn.title = title;
        btn.textContent = label;
        btn.addEventListener('click', action);
        bar.append(btn);
    }
    return bar;
}

function showEmptyState(panel) {
    const empty = document.createElement('div');
    empty.className = 'graph-empty';
    const note = document.createElement('p');
    note.textContent = 'No graph output yet — execute to see the Engine result.';
    empty.append(note);
    panel.append(empty);
}

/** Public API: render one Engine SVG (or an empty state) into a pane. */
export function renderSvgGraph(panel, svgText) {
    panel.textContent = '';
    const trimmed = String(svgText || '').trim();
    const svg = trimmed ? parseEngineSvg(trimmed) : null;

    if (!svg) {
        showEmptyState(panel);
        return;
    }

    const base = getBaseView(svg);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    const viewer = attachViewer(svg, base);
    panel.append(svg, buildToolbar(svg, viewer));
}