/**
 * Minimal GraphML parser. Namespace-agnostic: reads both the standard
 * <graphml xmlns="…/xmlns"> and the Gravisto/VANTED variant
 * (xmlns="…/xmlns/graphml"). Extracts node geometry, edge bends, and
 * optional node coordinates (x / y / z, e.g. graphics.coordinate.z).
 */

/** Map a GraphML key attr.name to a coordinate axis, or null. */
function getCoordinateAxis(attrName) {
    const name = (attrName || '').toLowerCase();
    if (name === 'x' || name.endsWith('coordinate.x')) return 'x';
    if (name === 'y' || name.endsWith('coordinate.y')) return 'y';
    if (name === 'z' || name.endsWith('coordinate.z')) return 'z';
    return null;
}

/** Parse a number, tolerating comma decimals ("1,0"). */
function parseNumber(raw) {
    if (raw == null) return NaN;
    const value = Number(String(raw).trim().replace(',', '.'));
    return Number.isFinite(value) ? value : NaN;
}

function assignCoordinates(target, element) {
    for (const axis of ['x', 'y', 'z']) {
        const value = parseNumber(element.getAttribute(axis));
        if (Number.isFinite(value)) target[axis] = value;
    }
}

function findDescendants(parent, localName) {
    return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function findDescendantsIgnoringCase(parent, localName) {
    return Array.from(parent.getElementsByTagName('*'))
        .filter((element) => element.localName.toLowerCase() === localName);
}

function getKeyField(attrName) {
    const axis = getCoordinateAxis(attrName);
    if (axis) return axis;
    const name = (attrName || '').toLowerCase();
    return ['size', 'width', 'height', 'shape', 'nodetype', 'bends', 'edgetype'].includes(name)
        ? name
        : null;
}

function parseBendCoordinates(data) {
    const points = findDescendantsIgnoringCase(data, 'point');
    const bendElements = points.length ? [] : findDescendantsIgnoringCase(data, 'bend');
    const coordinates = points.length ? points : bendElements;
    if (coordinates.length) {
        return coordinates.map((point) => ({
            x: parseNumber(point.getAttribute('x')),
            y: parseNumber(point.getAttribute('y')),
            z: parseNumber(point.getAttribute('z')),
        })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }

    const tuples = [...data.textContent.matchAll(/\(([^)]*)\)/g)];
    if (tuples.length) {
        return tuples.map(([, tuple]) => {
            const values = tuple.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
            return {
                x: parseNumber(values[0]),
                y: parseNumber(values[1]),
                z: parseNumber(values[2]),
            };
        }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    }

    const numbers = data.textContent.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    const bends = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
        const x = parseNumber(numbers[i]);
        const y = parseNumber(numbers[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) bends.push({ x, y });
    }
    return bends;
}

export function parseGraphML(text) {
    const doc = new DOMParser().parseFromString(String(text), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('not well-formed XML');
    }
    const root = doc.documentElement;
    if (!root || root.localName !== 'graphml') {
        throw new Error('root element is not <graphml>');
    }
    const graphElement = findDescendants(root, 'graph')[0];
    if (!graphElement) throw new Error('no <graph> element found');

    const fieldsByKeyId = new Map();
    // key id -> supported node or edge field
    for (const key of findDescendants(root, 'key')) {
        const field = getKeyField(key.getAttribute('attr.name'));
        if (field) fieldsByKeyId.set(key.getAttribute('id'), field);
    }

    const nodes = [];
    for (const node of findDescendants(graphElement, 'node')) {
        const id = node.getAttribute('id');
        if (!id) continue;
        const parsedNode = { id };
        for (const data of findDescendants(node, 'data')) {
            const field = fieldsByKeyId.get(data.getAttribute('key'));
            if (['x', 'y', 'z', 'size', 'width', 'height', 'nodetype'].includes(field)) {
                const value = parseNumber(data.textContent);
                if (Number.isFinite(value)) parsedNode[field] = value;
            } else if (field === 'shape') {
                parsedNode.shape = data.textContent.trim().toLowerCase();
            }
            for (const coordinate of findDescendants(data, 'coordinate')) {
                assignCoordinates(parsedNode, coordinate);
            }
        }
        assignCoordinates(parsedNode, node);
        nodes.push(parsedNode);
    }
    if (!nodes.length) throw new Error('the file contains no <node> elements');

    const nodeIds = new Set(nodes.map((node) => node.id));
    const links = [];
    const graphIsDirected = graphElement.getAttribute('edgedefault') === 'directed';
    for (const edge of findDescendants(graphElement, 'edge')) {
        const source = edge.getAttribute('source');
        const target = edge.getAttribute('target');
        if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
        const directedValue = edge.getAttribute('directed');
        const directed = directedValue === 'true'
            ? true
            : directedValue === 'false'
                ? false
                : graphIsDirected;
        const link = { source, target, directed, bends: [] };
        for (const data of findDescendants(edge, 'data')) {
            const field = fieldsByKeyId.get(data.getAttribute('key'));
            if (field === 'bends') link.bends = parseBendCoordinates(data);
            if (field === 'edgetype') link.type = data.textContent.trim();
        }
        links.push(link);
    }

    return {
        nodes,
        links,
        hasAnyCoordinates: nodes.some((node) => Number.isFinite(node.x) && Number.isFinite(node.y)),
        hasAnyZCoordinates: nodes.some((node) => Number.isFinite(node.z)),
    };
}