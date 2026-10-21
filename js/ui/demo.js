/**
 * Demo state machine: execute a script on the Engine (one synchronous request),
 * then show what the Engine returned — the SVGs of both paths on pane A and the
 * GraphML files (rendered from their original coordinates) on pane B.
 */
import {
    COMPARISON_CHECKS,
    EXECUTION_STAGES,
} from '../config/siteConfig.js';
import { initCodeTabs } from './codeTabs.js';
import { renderSvgGraph } from './svgGraphViewer.js';
import { createParameterForm } from './parameters.js';

const EXECUTION_PATH_LABELS = { cpp: 'C++ direct', lua: 'Lua · via BRIDGE' };

export function initDemo(root, engineClient, engineConfig, graph3dViewer) {
    const elements = {
        apiKeyInput: root.querySelector('#api-key'),
        loadResourcesButton: root.querySelector('#load-resources'),
        methodSelect: root.querySelector('#method-select'),
        graphSelect: root.querySelector('#graph-select'),
        sourceDirect: root.querySelector('#source-direct'),
        sourceBridge: root.querySelector('#source-bridge'),
        executeButton: root.querySelector('#run-custom'),
        svgOutput: root.querySelector('#svg-output'),
        svgSwitch: root.querySelector('#svg-switch'),
        graphMLSwitch: root.querySelector('#graphml-switch'),
        parametersContainer: root.querySelector('#layout-parameters'),
        parametersModal: root.querySelector('#parameters-modal'),
        openParametersButton: root.querySelector('#open-parameters'),
        closeParametersButton: root.querySelector('#close-parameters'),
        parametersCount: root.querySelector('#parameters-count'),
        parametersEmpty: root.querySelector('#parameters-empty'),
        parametersFileInput: root.querySelector('#file-parameters'),
        paramFileStatus: root.querySelector('#param-file-status'),
        editorModal: root.querySelector('#editor-modal'),
        editorModalSource: root.querySelector('#editor-modal-source'),
        editorModalTitle: root.querySelector('#editor-modal-title'),
        closeEditorButton: root.querySelector('#close-editor'),
        statusMessage: root.querySelector('#status-message'),
        statusJob: root.querySelector('#status-job'),
        checksList: root.querySelector('#checks-list'),
        stagesList: root.querySelector('#stages-list'),
        stagesSummary: root.querySelector('#stages-summary'),
        panelCase: root.querySelector('#panel-case'),
    };

    const codeTabs = initCodeTabs({
        tabDirect: root.querySelector('#tab-cxx'),
        tabBridge: root.querySelector('#tab-lua'),
        codeView: root.querySelector('#code-view'),
    });

    const PARAM_DEFS_STORAGE_KEY = 'bridge_parameter_definitions';

    // Field edits write literals back into the Lua source, anchored on the `_id` token.
    const parameterAnchors = new Map(); // id -> { literal, offset } of the last injection

    // Definitions: last uploaded file from localStorage, else the example file.
    const parameterForm = createParameterForm(elements.parametersContainer, {
        fetchDefinitions: async () => {
            // Try to load from localStorage first
            const stored = localStorage.getItem(PARAM_DEFS_STORAGE_KEY);
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch {
                    localStorage.removeItem(PARAM_DEFS_STORAGE_KEY);
                }
            }

            // Else fetch the example file (relative path: works under a subpath too).
            try {
                const response = await fetch('examples/parameter-definitions.json', { cache: 'no-store' });
                if (!response.ok) throw new Error();
                
                // Use text() first to handle UTF-8 BOM if it exists
                const text = await response.text();
                return JSON.parse(text.replace(/^\uFEFF/, ''));
            } catch {
                throw new Error('No parameter definitions available. Please upload a ParameterDefinitions.json file.');
            }
        },
        onValueChange: (id, value) => {
            if (!writeParameterValue(id, value)) {
                // Values live only in the Lua source; a failed write loses them.
                setStatus(`Could not write _${id} into the Lua code — the change will not take effect.`);
            }
        },
    });

    function updateParamFileStatus(name) {
        if (elements.paramFileStatus) {
            elements.paramFileStatus.textContent = name || 'No file loaded';
        }
    }

    // Keep the toolbar badge and modal empty state in sync with the visible fields.
    function syncParametersUI() {
        const count = parameterForm.getVisibleCount();
        if (elements.parametersCount) {
            elements.parametersCount.textContent = String(count);
            elements.parametersCount.hidden = count === 0;
        }
        if (elements.parametersEmpty) elements.parametersEmpty.hidden = count > 0;
    }

    if (elements.openParametersButton) {
        elements.openParametersButton.addEventListener('click', () => {
            syncParametersUI();
            elements.parametersModal?.showModal();
        });
    }
    elements.closeParametersButton?.addEventListener('click', () => elements.parametersModal?.close());
    // Click on the backdrop closes the modal.
    elements.parametersModal?.addEventListener('click', (event) => {
        if (event.target === elements.parametersModal) elements.parametersModal.close();
    });

    // Debounced re-scan of the Lua textarea while the user types.
    let parameterScanTimer = 0;

    /** Lua literal for a parameter value: numbers and booleans bare, strings
     *  as bare identifiers (e.g. BeautifulAndFast) — the engine resolves
     *  enum-style names itself, so no quotes are written into the code. */
    function formatLuaLiteral(value) {
        if (typeof value === 'string') return value;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    }

    /** Write a value into the Lua textarea, anchored on the `_id` token (or on
     *  the literal injected before, matched nearest its recorded offset — so a
     *  number that also occurs elsewhere is never touched). True on success. */
    function writeParameterValue(id, value) {
        if (value === null || value === undefined) return false;
        const literal = formatLuaLiteral(value);
        let source = elements.sourceBridge.value;
        let injectedAt = -1;

        const tokenPattern = new RegExp(`(^|[^A-Za-z0-9_])_${id}(?![A-Za-z0-9_])`);
        const tokenMatch = tokenPattern.exec(source);
        if (tokenMatch) {
            const tokenStart = tokenMatch.index + tokenMatch[1].length;
            source = source.slice(0, tokenStart) + literal
                + source.slice(tokenStart + id.length + 1);
            injectedAt = tokenStart;
        } else {
            const anchor = parameterAnchors.get(id);
            if (!anchor) return false;
            if (anchor.literal === literal) return true; // already that value
            let best = -1;
            let bestDistance = Infinity;
            for (let at = source.indexOf(anchor.literal); at !== -1; at = source.indexOf(anchor.literal, at + 1)) {
                const distance = Math.abs(at - anchor.offset);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = at;
                }
            }
            if (best === -1) return false;
            source = source.slice(0, best) + literal + source.slice(best + anchor.literal.length);
            injectedAt = best;
        }

        elements.sourceBridge.value = source;
        codeTabs.setSource('bridge', source);
        parameterAnchors.set(id, { literal, offset: injectedAt });
        parameterForm.markSubstituted(id);
        return true;
    }

    /** Write the current values of visible parameters into the Lua source. */
    function injectVisibleDefaults() {
        const values = parameterForm.getValues();
        for (const [id, value] of Object.entries(values)) {
            writeParameterValue(id, value);
        }
    }

    const state = {
        isCustomCode: false,
        svgs: { cpp: '', lua: '' },
        graphML: { cpp: '', lua: '' },
        activeSvg: 'cpp',
        activeGraphML: 'lua',
        graphName: '',
    };

    const API_KEY_STORAGE_KEY = 'bridge_api_secret';
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedApiKey) {
        elements.apiKeyInput.value = savedApiKey;
    } else if (engineConfig.defaultApiKey) {
        elements.apiKeyInput.value = engineConfig.defaultApiKey;
    }

    elements.apiKeyInput.addEventListener('input', () => {
        localStorage.setItem(API_KEY_STORAGE_KEY, elements.apiKeyInput.value);
    });

    /* ---- static panels ---- */

    for (const check of COMPARISON_CHECKS) {
        const row = document.createElement('div');
        row.className = 'check-row';
        const marker = document.createElement('span');
        marker.className = 'check-marker';
        const text = document.createElement('span');
        text.textContent = check;
        row.append(marker, text);
        elements.checksList.append(row);
    }

    const stageRows = new Map();
    for (const stage of EXECUTION_STAGES) {
        const row = document.createElement('div');
        row.className = 'check-row stage-row is-pending';
        const marker = document.createElement('span');
        marker.className = 'check-marker';
        const text = document.createElement('span');
        text.textContent = stage.label;
        row.append(marker, text);
        elements.stagesList.append(row);
        stageRows.set(stage.id, row);
    }

    function renderStages(completedStageIds, failedStageId) {
        const order = EXECUTION_STAGES.map((stage) => stage.id);
        const failedIdx = failedStageId ? order.indexOf(failedStageId) : -1;
        let activeIdx = -1;
        for (let i = 0; i < order.length; i++) {
            if (!completedStageIds.has(order[i])) {
                activeIdx = i;
                break;
            }
        }
        for (const [stageId, row] of stageRows) {
            const idx = order.indexOf(stageId);
            row.classList.remove('is-pending', 'is-active', 'is-done', 'is-failed');
            if (failedIdx >= 0 && idx === failedIdx) row.classList.add('is-failed');
            else if (completedStageIds.has(stageId)) row.classList.add('is-done');
            else if (idx === activeIdx && !failedStageId) row.classList.add('is-active');
            else row.classList.add('is-pending');
        }
    }

    /* ---- status and busy state ---- */

    const setStatus = (message, jobState = '') => {
        elements.statusMessage.textContent = message;
        elements.statusJob.hidden = !jobState;
        elements.statusJob.textContent = jobState;
    };

    const setBusy = (busy) => {
        elements.loadResourcesButton.disabled = busy;
        elements.executeButton.disabled = busy;
        elements.executeButton.textContent = busy ? 'Executing…' : 'Execute script';
    };

    /* ---- output panels and path switches ---- */

    function renderSvgOutput(svgText) {
        renderSvgGraph(elements.svgOutput, svgText);
    }

    function setActiveButton(switchEl, view) {
        if (!switchEl) return;
        for (const button of switchEl.querySelectorAll('button')) {
            button.classList.toggle('is-active', button.dataset.view === view);
        }
    }

    function bindSwitch(switchEl, onPick) {
        if (!switchEl) return;
        switchEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-view]');
            if (!button || button.classList.contains('is-active')) return;
            setActiveButton(switchEl, button.dataset.view);
            onPick(button.dataset.view);
        });
    }

    // A switch is only meaningful when the Engine returned both variants.
    function refreshSwitches() {
        if (elements.svgSwitch) elements.svgSwitch.hidden = !(state.svgs.cpp && state.svgs.lua);
        if (elements.graphMLSwitch) elements.graphMLSwitch.hidden = !(state.graphML.cpp && state.graphML.lua);
    }

    function renderSvgPane() {
        renderSvgOutput(state.svgs[state.activeSvg] || '');
    }

    bindSwitch(elements.svgSwitch, (view) => {
        state.activeSvg = view;
        renderSvgPane();
    });
    bindSwitch(elements.graphMLSwitch, (view) => {
        state.activeGraphML = view;
        const text = state.graphML[view];
        if (text) {
            graph3dViewer?.render(`${state.graphName || 'graph'} · ${EXECUTION_PATH_LABELS[view]}`, text);
        }
    });

    /* ---- case loading ---- */

    /** Resolve `__input__`/`__output__`/`__output_svg__` to real file literals:
     *  the selected GraphML, `<name>-layout.graphml`, `<name>-layout.svg`. */
    function substituteGraphPaths(source, graphName) {
        if (!source || !graphName) return source;
        const baseName = graphName.replace(/\.graphml$/i, '');
        return source
            .replaceAll('__output_svg__', `"${baseName}-layout.svg"`)
            .replaceAll('__output__', `"${baseName}-layout.graphml"`)
            .replaceAll('__input__', `"${graphName}"`);
    }

    async function loadSelectedSource() {
        const method = elements.methodSelect.value;
        const graphFile = elements.graphSelect.value;
        if (!method || !graphFile) return;

        // Only warn if the user has pasted custom code. If the code was loaded
        // from a layout method, we allow switching without confirmation.
        if (state.isCustomCode && (elements.sourceDirect.value.trim() || elements.sourceBridge.value.trim())) {
            const confirmed = confirm('You have custom code. Replacing it with the layout method source will delete your changes. Continue?');
            if (!confirmed) return;
        }

        try {
            setBusy(true);
            setStatus(`Fetching source for ${method} with ${graphFile}...`);

            // Example sources — never serve a stale cached copy.
            const cppCode = await fetch(`examples/cpp/${method}.cpp`, { cache: 'no-store' }).then(r => r.text()).catch(() => '');
            const luaCode = await fetch(`examples/lua/${method}.lua`, { cache: 'no-store' }).then(r => r.text()).catch(() => '');

            // Resolve __input__/__output__ against the selected GraphML file.
            elements.sourceDirect.value = substituteGraphPaths(cppCode, graphFile);
            elements.sourceBridge.value = substituteGraphPaths(luaCode, graphFile);

            // Predefined source: no longer custom code.
            state.isCustomCode = false;

            codeTabs.setSource('direct', elements.sourceDirect.value);
            codeTabs.setSource('bridge', elements.sourceBridge.value);
            // Fresh script: forget field→code injections from the previous one.
            parameterAnchors.clear();
            // Show fields only for the `_id` parameters this script references.
            const parametersShown = await parameterForm.setLuaSource(elements.sourceBridge.value, { resetSubstitutions: true });
            if (parametersShown) injectVisibleDefaults();
            syncParametersUI();

            if (!state.graphML.lua && !state.graphML.cpp) {
                try {
                    const rawGraphML = await fetch(`examples/graphml/${graphFile}`, { cache: 'no-store' }).then(r => r.text());
                    if (rawGraphML) {
                        graph3dViewer?.render(`${graphFile} · Input GraphML`, rawGraphML);
                    }
                } catch {
                }
            }
            setBusy(false);
            setStatus(parametersShown
                ? `Source code loaded — ${parameterForm.getVisibleCount()} parameters under “Layout Parameters”.`
                : 'Source code loaded. Parameter fields need ParameterDefinitions.json — upload it under the selects.');
        } catch (error) {
            setBusy(false);
            setStatus(`Error fetching source: ${error.message}`);
        }
    }

    elements.methodSelect.addEventListener('change', async () => {
        // If a graph is already selected, load the source and show parameters immediately
        if (elements.graphSelect.value) {
            await loadSelectedSource();
        }
    });
    elements.graphSelect.addEventListener('change', async () => {
        // If a method is already selected, load the source and show parameters immediately
        if (elements.methodSelect.value) {
            await loadSelectedSource();
        }
    });

    async function loadResources() {
        try {
            setBusy(true);
            setStatus('Loading resources from the examples folder…');
            
            // Fixed example list served from the repo.
            const methods = [
                'energybased',
                'hierarchical',
                'hierarchical-ranking',
                'orthogonal',
                'pivotmds'
            ];
            const files = [
                'Cube.graphml',
                'Mesh.graphml',
                'n1000e1000.graphml',
                'n100e100.graphml'
            ];

            elements.methodSelect.textContent = '';
            const methodPlaceholder = document.createElement('option');
            methodPlaceholder.value = '';
            methodPlaceholder.textContent = 'Pick a layout method…';
            elements.methodSelect.append(methodPlaceholder);

            for (const name of methods) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                elements.methodSelect.append(option);
            }

            elements.graphSelect.textContent = '';
            const graphPlaceholder = document.createElement('option');
            graphPlaceholder.value = '';
            graphPlaceholder.textContent = 'Pick an input graph…';
            elements.graphSelect.append(graphPlaceholder);
            for (const name of files) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                elements.graphSelect.append(option);
            }

            // Show the panels now that the API key is provided
            const apiKeyField = elements.apiKeyInput.closest('.api-key-field');
            if (apiKeyField) apiKeyField.hidden = true;

            if (elements.panelCase) elements.panelCase.hidden = false;
            
            const parametersLoaded = await parameterForm.ensureLoaded();
            if (parametersLoaded) updateParamFileStatus('Example defaults');
            syncParametersUI();

            if (!elements.methodSelect.value) {
                elements.methodSelect.value = 'hierarchical';
            }
            if (!elements.graphSelect.value) {
                elements.graphSelect.value = 'Mesh.graphml';
            }
            await loadSelectedSource();

            setBusy(false);
            setStatus('Resources loaded from examples. Pick a layout method and graph to compare, or adjust parameters.');
        } catch (error) {
            setBusy(false);
            setStatus(`Could not load resources: ${error.message}`);
        }
    }

    elements.loadResourcesButton.addEventListener('click', () => loadResources());

    // Auto-load resources if API secret is already present
    if (elements.apiKeyInput.value) {
        loadResources();
    }

    // Initial parameter status from localStorage
    if (localStorage.getItem(PARAM_DEFS_STORAGE_KEY)) {
        updateParamFileStatus('Stored definitions');
    }

    /* ---- manual ParameterDefinitions.json upload ---- */

    elements.parametersFileInput.addEventListener('change', async () => {
        const file = elements.parametersFileInput.files?.[0];
        if (!file) return;
        try {
            // The repo's ParameterDefinitions.json starts with a UTF-8 BOM, which
            // JSON.parse rejects ("Unexpected token '\ufeff'") — strip it first.
            const text = (await file.text()).replace(/^\uFEFF/, '');
            const applied = parameterForm.setDefinitions(JSON.parse(text));
            if (applied > 0) {
                localStorage.setItem(PARAM_DEFS_STORAGE_KEY, text);
                updateParamFileStatus(file.name);
                await parameterForm.setLuaSource(elements.sourceBridge.value);
                injectVisibleDefaults();
                syncParametersUI();
                const shown = parameterForm.getVisibleCount();
                setStatus(`Loaded ${applied} definition${applied === 1 ? '' : 's'} from ${file.name} — ${shown} field${shown === 1 ? '' : 's'} active; default values written into the script.`);
            } else {
                setStatus(`${file.name} holds no parameter definitions — expected an object mapping ids to definitions (or { "parameters": { … } }).`);
            }
        } catch (error) {
            setStatus(`Could not read ${file.name}: ${error.message}`);
        }
        elements.parametersFileInput.value = '';
    });

    /* ---- executing ---- */

    async function executeScript() {
        const apiKey = elements.apiKeyInput.value;
        const graphName = elements.graphSelect.value;

        if (!graphName) {
            setStatus('Pick an input GraphML file first — its name replaces __input__ in the code.');
            return;
        }
        if (!elements.sourceDirect.value.trim()) {
            setStatus('Add C++ code to execute, or load a predefined example.');
            return;
        }
        if (!elements.sourceBridge.value.trim()) {
            setStatus('Add a Lua script to execute, or load a predefined example.');
            return;
        }

        try {
            setBusy(true);
            setStatus(`Fetching GraphML content for ${graphName}...`);

            // Custom code may still hold placeholders — resolve before sending.
            elements.sourceDirect.value = substituteGraphPaths(elements.sourceDirect.value, graphName);
            elements.sourceBridge.value = substituteGraphPaths(elements.sourceBridge.value, graphName);
            codeTabs.setSource('direct', elements.sourceDirect.value);
            codeTabs.setSource('bridge', elements.sourceBridge.value);

            // Fetch the GraphML content.
            const graphMLContent = await fetch(`examples/graphml/${graphName}`, { cache: 'no-store' }).then(r => {
                if (!r.ok) throw new Error(`Could not fetch GraphML file: ${graphName}`);
                return r.text();
            });

            const payload = {
                cpp_code: elements.sourceDirect.value,
                lua_code: elements.sourceBridge.value,
                graphml_file: graphMLContent,
                graphml_name: graphName,
            };

            state.svgs = { cpp: '', lua: '' };
            state.graphML = { cpp: '', lua: '' };
            refreshSwitches();
            renderSvgOutput('');
            graph3dViewer?.clear('Executing — the returned GraphML will appear here.');
            elements.stagesSummary.hidden = true;
            renderStages(new Set(['queued']), null);

            setStatus('Executing sequentially on the Engine…', 'executing');

            const result = await engineClient.executeSequential(apiKey, payload);

            renderStages(new Set(EXECUTION_STAGES.map((stage) => stage.id)), null);
            elements.stagesSummary.hidden = false;
            elements.stagesSummary.textContent = 'custom script · succeeded';

            // Per path the Engine returns the SVG and the laid-out GraphML.
            state.svgs = { cpp: result.svgs?.cpp || '', lua: result.svgs?.lua || '' };
            state.graphML = { cpp: result.graphML?.cpp || '', lua: result.graphML?.lua || '' };
            state.graphName = graphName;
            state.activeSvg = state.svgs.cpp ? 'cpp' : 'lua';
            state.activeGraphML = state.graphML.lua ? 'lua' : 'cpp';
            setActiveButton(elements.svgSwitch, state.activeSvg);
            setActiveButton(elements.graphMLSwitch, state.activeGraphML);
            refreshSwitches();
            renderSvgPane();
            graph3dViewer?.render(`${graphName} · ${EXECUTION_PATH_LABELS[state.activeGraphML]}`,
                state.graphML[state.activeGraphML] || '');
            setStatus('Completed. Pane A shows the returned SVGs, pane B the returned GraphML layout.', 'succeeded');
        } catch (error) {
            renderStages(new Set(), 'running');
            elements.stagesSummary.hidden = false;
            elements.stagesSummary.textContent = 'failed';
            setStatus(error.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    elements.executeButton.addEventListener('click', () => executeScript());

    /* ---- custom sources ---- */

    elements.sourceDirect.addEventListener('input', () => {
        state.isCustomCode = true;
        codeTabs.setSource('direct', elements.sourceDirect.value);
    });

    elements.sourceBridge.addEventListener('input', () => {
        state.isCustomCode = true;
        codeTabs.setSource('bridge', elements.sourceBridge.value);
        // Live re-scan on manual edits. Fields already substituted into the code
        // stay visible (sticky), so editing injected literals keeps them usable.
        clearTimeout(parameterScanTimer);
        parameterScanTimer = setTimeout(() => {
            parameterForm.setLuaSource(elements.sourceBridge.value);
            syncParametersUI();
        }, 300);
    });

    /* ---- source editor modal ---- */

    const editorState = { target: null };
    const editorGutter = root.querySelector('#editor-modal-gutter');
    const editorStatus = root.querySelector('#editor-modal-status');

    function renderEditorChrome() {
        const value = elements.editorModalSource.value;
        const lines = value.split('\n').length;
        if (editorGutter) {
            editorGutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n');
            editorGutter.scrollTop = elements.editorModalSource.scrollTop;
        }
        if (editorStatus) {
            editorStatus.textContent =
                `${lines} ${lines === 1 ? 'line' : 'lines'} · ${value.length} characters`;
        }
    }

    for (const button of root.querySelectorAll('[data-expand]')) {
        button.addEventListener('click', () => {
            const target = root.querySelector(`#${button.dataset.expand}`);
            if (!target || !elements.editorModal || !elements.editorModalSource) return;
            editorState.target = target;
            if (elements.editorModalTitle) {
                elements.editorModalTitle.textContent =
                    root.querySelector(`label[for="${button.dataset.expand}"]`)?.textContent || 'Editor';
            }
            elements.editorModalSource.value = target.value;
            renderEditorChrome();
            elements.editorModal.showModal();
            elements.editorModalSource.focus();
        });
    }

    elements.editorModalSource?.addEventListener('input', renderEditorChrome);
    elements.editorModalSource?.addEventListener('scroll', () => {
        if (editorGutter) editorGutter.scrollTop = elements.editorModalSource.scrollTop;
    });
    // Tab inserts two spaces instead of moving focus out of the editor.
    elements.editorModalSource?.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const { selectionStart, selectionEnd, value } = elements.editorModalSource;
        elements.editorModalSource.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        elements.editorModalSource.selectionStart = elements.editorModalSource.selectionEnd = selectionStart + 2;
        renderEditorChrome();
    });

    function applyEditorToTarget() {
        const target = editorState.target;
        if (!target || !elements.editorModalSource) return;
        if (target.value !== elements.editorModalSource.value) {
            target.value = elements.editorModalSource.value;
            // The field's own listeners keep the code view, custom-code flag,
            // and Lua parameter scan in sync — once, on Apply.
            target.dispatchEvent(new Event('input'));
        }
    }

    elements.closeEditorButton?.addEventListener('click', () => elements.editorModal?.close());
    root.querySelector('#editor-apply')?.addEventListener('click', () => {
        applyEditorToTarget();
        elements.editorModal?.close();
    });
    root.querySelector('#editor-cancel')?.addEventListener('click', () => elements.editorModal?.close());
    // Click on the backdrop closes the modal.
    elements.editorModal?.addEventListener('click', (event) => {
        if (event.target === elements.editorModal) elements.editorModal.close();
    });
    // Closing without Apply discards the pending edit.
    elements.editorModal?.addEventListener('close', () => {
        editorState.target = null;
    });

    renderSvgOutput('');
}