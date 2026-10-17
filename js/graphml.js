/**
 * Minimal GraphML parser. Namespace-agnostic: reads both the standard
 * <graphml xmlns="…/xmlns"> and the Gravisto/VANTED variant
 * (xmlns="…/xmlns/graphml"). Extracts node geometry, edge bends, and
 * optional node coordinates (x / y / z, e.g. graphics.coordinate.z).
 */

/** Map a GraphML key attr.name to a coordinate axis, or null. */
function coordAxis(attrName) {
    const name = (attrName || '').toLowerCase();
    if (name === 'x' || name.endsWith('coordinate.x')) return 'x';
    if (name === 'y' || name.endsWith('coordinate.y')) return 'y';
    if (name === 'z' || name.endsWith('coordinate.z')) return 'z';
    return null;
}

/** Parse a number, tolerating comma decimals ("1,0"). */
function toNumber(raw) {
    if (raw == null) return NaN;
    const value = Number(String(raw).trim().replace(',', '.'));
    return Number.isFinite(value) ? value : NaN;
}

function setCoordinates(target, element) {
    for (const axis of ['x', 'y', 'z']) {
        const value = toNumber(element.getAttribute(axis));
        if (Number.isFinite(value)) target[axis] = value;
    }
}

function descendants(parent, localName) {
    return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function descendantsIgnoringCase(parent, localName) {
    return Array.from(parent.getElementsByTagName('*'))
        .filter((element) => element.localName.toLowerCase() === localName);
}

function keyField(attrName) {
    const axis = coordAxis(attrName);
    if (axis) return axis;
    const name = (attrName || '').toLowerCase();
    return ['size', 'width', 'height', 'shape', 'nodetype', 'bends', 'edgetype'].includes(name)
        ? name
        : null;
}

function parseBends(data) {
    const points = descendantsIgnoringCase(data, 'point');
    const bendElements = points.length ? [] : descendantsIgnoringCase(data, 'bend');
    const coordinates = points.length ? points : bendElements;
    if (coordinates.length) {
        return coordinates.map((point) => ({
            x: toNumber(point.getAttribute('x')),
            y: toNumber(point.getAttribute('y')),
            z: toNumber(point.getAttribute('z')),
        })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }

    const tuples = [...data.textContent.matchAll(/\(([^)]*)\)/g)];
    if (tuples.length) {
        return tuples.map(([, tuple]) => {
            const values = tuple.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
            return {
                x: toNumber(values[0]),
                y: toNumber(values[1]),
                z: toNumber(values[2]),
            };
        }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }

    const numbers = data.textContent.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    const bends = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
        const x = toNumber(numbers[i]);
        const y = toNumber(numbers[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) bends.push({ x, y });
    }
    return bends;
}

export function parseGraphml(text) {
    const doc = new DOMParser().parseFromString(String(text), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('not well-formed XML');
    }
    const root = doc.documentElement;
    if (!root || root.localName !== 'graphml') {
        throw new Error('root element is not <graphml>');
    }
    const graph = descendants(root, 'graph')[0];
    if (!graph) throw new Error('no <graph> element found');

    const axes = new Map();
    // key id -> supported node or edge field
    for (const key of descendants(root, 'key')) {
        const field = keyField(key.getAttribute('attr.name'));
        if (field) axes.set(key.getAttribute('id'), field);
    }

    const nodes = [];
    for (const node of descendants(graph, 'node')) {
        const id = node.getAttribute('id');
        if (!id) continue;
        const entry = { id };
        for (const data of descendants(node, 'data')) {
            const field = axes.get(data.getAttribute('key'));
            if (['x', 'y', 'z', 'size', 'width', 'height', 'nodetype'].includes(field)) {
                const value = toNumber(data.textContent);
                if (Number.isFinite(value)) entry[field] = value;
            } else if (field === 'shape') {
                entry.shape = data.textContent.trim().toLowerCase();
            }
            for (const coordinate of descendants(data, 'coordinate')) {
                setCoordinates(entry, coordinate);
            }
        }
        setCoordinates(entry, node);
        nodes.push(entry);
    }
    if (!nodes.length) throw new Error('the file contains no <node> elements');

    const ids = new Set(nodes.map((node) => node.id));
    const links = [];
    const graphDirected = graph.getAttribute('edgedefault') === 'directed';
    for (const edge of descendants(graph, 'edge')) {
        const source = edge.getAttribute('source');
        const target = edge.getAttribute('target');
        if (!ids.has(source) || !ids.has(target)) continue;
        const directedAttribute = edge.getAttribute('directed');
        const directed = directedAttribute === 'true'
            ? true
            : directedAttribute === 'false'
                ? false
                : graphDirected;
        const link = { source, target, directed, bends: [] };
        for (const data of descendants(edge, 'data')) {
            const field = axes.get(data.getAttribute('key'));
            if (field === 'bends') link.bends = parseBends(data);
            if (field === 'edgetype') link.type = data.textContent.trim();
        }
        links.push(link);
    }

    return {
        nodes,
        links,
        hasCoords: nodes.some((node) => Number.isFinite(node.x) && Number.isFinite(node.y)),
        hasZ: nodes.some((node) => Number.isFinite(node.z)),
    };
}