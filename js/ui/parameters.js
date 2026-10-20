/**
 * Dynamic parameter form built from ParameterDefinitions.json
 * ({ id: { defaultValue, displayName, minValue?, maxValue?, allowedValues? } }).
 *
 * Field types: allowedValues → select, boolean → checkbox, number with
 * min+max → range (+ readout), other numbers → number, rest → text.
 *
 * Two-way binding with the Lua source:
 *   code → fields   the source is scanned for `_id` globals whose id exists in
 *                   the definitions; a field is shown for each one.
 *   fields → code   changes are reported via `onValueChange(id, value)`;
 *                   demo.js rewrites the `_id` token to a literal. Substituted
 *                   ids stay visible (sticky) until `setLuaSource` is called
 *                   with { resetSubstitutions: true }.
 */
export function createParameterForm(container, { fetchDefinitions, onValueChange } = {}) {
    const notifyValueChange = typeof onValueChange === 'function' ? onValueChange : null;
    const rows = new Map();      // id -> { def, type, input, readout, row }
    let definitions = null;      // null until a successful load or upload
    let visibleIds = new Set();  // ids shown for the current Lua source
    let loadPromise = null;
    let lastLuaSource = '';
    const substitutedIds = new Set(); // ids whose token was replaced by a literal

    function inferType(def) {
        if (Array.isArray(def.allowedValues) && def.allowedValues.length > 0) return 'select';
        if (typeof def.defaultValue === 'boolean') return 'checkbox';
        if (typeof def.defaultValue === 'number') {
            return def.minValue != null && def.maxValue != null ? 'range' : 'number';
        }
        return 'text';
    }

    function readValue(type, input) {
        if (type === 'checkbox') return input.checked;
        if (type === 'range' || type === 'number') {
            const value = Number(input.value);
            return Number.isFinite(value) ? value : null;
        }
        const value = input.value.trim();
        return value === '' ? null : value;
    }

    function clampToRange(def, value) {
        if (typeof value !== 'number') return value;
        if (def.minValue != null) value = Math.max(def.minValue, value);
        if (def.maxValue != null) value = Math.min(def.maxValue, value);
        return value;
    }

    function updateReadout(row) {
        if (row.readout) row.readout.textContent = row.input.value;
    }

    /** Tolerate simple maps: "id": 3 becomes { defaultValue: 3 }. */
    function normalizeEntry(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
            return { defaultValue: value };
        }
        return null;
    }

    /** Accept both a flat { id: def } map and a { "parameters": { id: def } } wrapper. */
    function unwrapDefinitions(data) {
        if (data && typeof data === 'object' && !Array.isArray(data)
            && Object.keys(data).length === 1
            && data.parameters && typeof data.parameters === 'object' && !Array.isArray(data.parameters)) {
            return data.parameters;
        }
        return data;
    }

    function buildRow(id, def) {
        const type = inferType(def);
        const row = document.createElement('div');
        row.className = 'control param-control';
        row.dataset.paramId = id;

        const label = document.createElement('label');
        label.className = 'label';
        label.setAttribute('for', `param-${id}`);
        label.textContent = def.displayName || id;
        row.append(label);

        let input;
        let readout = null;
        if (type === 'select') {
            input = document.createElement('select');
            input.id = `param-${id}`;
            for (const option of def.allowedValues) {
                const element = document.createElement('option');
                element.value = String(option);
                element.textContent = String(option);
                element.selected = String(option) === String(def.defaultValue);
                input.append(element);
            }
            row.append(input);
        } else {
            input = document.createElement('input');
            input.id = `param-${id}`;
            input.type = type;
            if (type === 'checkbox') {
                input.checked = Boolean(def.defaultValue);
                row.append(input);
            } else {
                if (def.minValue != null) input.min = String(def.minValue);
                if (def.maxValue != null) input.max = String(def.maxValue);
                input.step = Number.isInteger(def.defaultValue) ? '1' : '0.1';
                input.value = String(def.defaultValue ?? '');
                if (type === 'range') {
                    const controlRow = document.createElement('div');
                    controlRow.className = 'control-row';
                    readout = document.createElement('span');
                    readout.className = 'control-value';
                    controlRow.append(input, readout);
                    row.append(controlRow);
                } else {
                    row.append(input);
                }
            }
        }

        if (def.description) {
            const note = document.createElement('p');
            note.className = 'param-description';
            note.textContent = def.description;
            row.append(note);
        }

        const entry = { def, type, input, readout, row };
        const handleInput = (event) => {
            updateReadout(entry);
            // Sliders commit live; every other control commits on 'change'
            // (blur, Enter, pick) so half-typed numbers never reach the code.
            if (event.type === 'input' && type !== 'range') return;
            if (!notifyValueChange) return;
            const value = readValue(type, input);
            if (value !== null) notifyValueChange(id, value);
        };
        input.addEventListener('input', handleInput);
        input.addEventListener('change', handleInput);
        updateReadout(entry);
        return entry;
    }

    /**
     * Build rows from parsed JSON. Returns the number of valid parameters;
     * on zero valid entries the previous state is left untouched.
     */
    function renderDefinitions(data) {
        const source = unwrapDefinitions(data);
        const nextRows = [];
        if (source && typeof source === 'object' && !Array.isArray(source)) {
            for (const [id, rawEntry] of Object.entries(source)) {
                const def = normalizeEntry(rawEntry);
                if (def) nextRows.push([id, def]);
            }
        }
        if (nextRows.length === 0) return 0;
        container.textContent = '';
        rows.clear();
        for (const [id, def] of nextRows) {
            const entry = buildRow(id, def);
            rows.set(id, entry);
            container.append(entry.row);
        }
        definitions = Object.fromEntries(nextRows);
        return nextRows.length;
    }

    function loadDefinitions() {
        if (definitions) return Promise.resolve(definitions);
        if (!loadPromise) {
            loadPromise = fetchDefinitions()
                .then((data) => {
                    const count = renderDefinitions(data);
                    if (count === 0) throw new Error('No parameter definitions were found.');
                    applyScan(); // a late fetch still meets the current Lua source
                    return definitions;
                })
                .catch((error) => {
                    loadPromise = null; // allow a retry on the next source change
                    throw error;
                });
        }
        return loadPromise;
    }

    /**
     * Ids from the definitions that the Lua source references as `_id`
     * globals (not part of a longer identifier, so `set_node_sizes(...,
     * _nodeSize)` matches `nodeSize` but not `node_sizes`).
     */
    function scanUsedIds(luaSource) {
        const used = new Set();
        if (!luaSource) return used;
        const globalPattern = /(^|[^A-Za-z0-9_])_([A-Za-z_][A-Za-z0-9_]*)/g;
        for (const match of luaSource.matchAll(globalPattern)) {
            if (rows.has(match[2])) used.add(match[2]);
        }
        return used;
    }

    function applyVisibility() {
        for (const [id, entry] of rows) {
            if (entry.row) entry.row.hidden = !visibleIds.has(id);
        }
        if (container) container.hidden = visibleIds.size === 0;
    }

    function applyScan() {
        const scanned = scanUsedIds(lastLuaSource);
        // Substituted ids stay visible even though their token is no longer in
        // the code — the injected literal replaced it; the field stays editable.
        visibleIds = new Set([...scanned, ...substitutedIds].filter((id) => rows.has(id)));
        applyVisibility();
    }

    return {
        /** Fetch (once) and render the definitions. Safe to call repeatedly. */
        async ensureLoaded() {
            try {
                await loadDefinitions();
                return true;
            } catch {
                if (container) container.hidden = true;
                return false;
            }
        },

        /**
         * Re-scan against a Lua source and show fields for the `_id` globals it
         * references. Pass { resetSubstitutions: true } when the source was
         * replaced wholesale. Resolves to false when definitions are unavailable.
         */
        async setLuaSource(luaSource, { resetSubstitutions = false } = {}) {
            lastLuaSource = luaSource || '';
            if (resetSubstitutions) substitutedIds.clear();
            const loaded = await this.ensureLoaded();
            if (!loaded) return false;
            applyScan();
            return true;
        },

        /** Remember that `_id` was replaced by a literal, keeping the field visible. */
        markSubstituted(id) {
            if (!rows.has(id)) return;
            substitutedIds.add(id);
            visibleIds.add(id);
            applyVisibility();
        },

        /**
         * Replace the definitions from an uploaded ParameterDefinitions.json.
         * Returns the number of parameters applied (0 = invalid file).
         */
        setDefinitions(data) {
            const count = renderDefinitions(data);
            if (count === 0) return 0;
            loadPromise = Promise.resolve(definitions); // a successful upload satisfies future ensureLoaded calls
            applyScan();
            return count;
        },

        /** Current values of the visible (referenced) parameters, range-clamped. */
        getValues() {
            const values = {};
            for (const [id, entry] of rows) {
                if (!visibleIds.has(id)) continue;
                const value = readValue(entry.type, entry.input);
                if (value === null) continue;
                values[id] = clampToRange(entry.def, value);
            }
            return values;
        },

        /** Number of fields currently visible for the scanned script. */
        getVisibleCount() {
            return visibleIds.size;
        },
    };
}