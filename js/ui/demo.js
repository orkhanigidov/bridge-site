/**
 * Demo state machine: execute a script on the Engine (one synchronous request),
 * then show what the Engine returned — the SVGs of both paths on pane A and the
 * GraphML files (rendered from their original coordinates) on pane B.
 */
import { CHECKS, STAGES, PARAMS } from '../config/site.js';
import { initCodeTabs } from './codeTabs.js';
import { showGraph } from './graphViewer.js';

const PATH_LABELS = { cpp: 'C++ direct', lua: 'Lua · via BRIDGE' };

export function initDemo(root, client, config, pane3d) {
    const els = {
        runnerUrl: root.querySelector('#runner-url'),
        loadCases: root.querySelector('#load-cases'),
        methodSelect: root.querySelector('#method-select'),
        graphSelect: root.querySelector('#graph-select'),
        sourceDirect: root.querySelector('#source-direct'),
        sourceBridge: root.querySelector('#source-bridge'),
        runCustom: root.querySelector('#run-custom'),
        graphDirect: root.querySelector('#graph-direct'),
        svgSwitch: root.querySelector('#svg-switch'),
        graphmlSwitch: root.querySelector('#graphml-switch'),
        paramsRow: root.querySelector('#params-row'),
        paramsNote: root.querySelector('#params-note'),
        nodes: root.querySelector('#nodes'),
        nodesVal: root.querySelector('#nodes-val'),
        seedDec: root.querySelector('#seed-dec'),
        seedInc: root.querySelector('#seed-inc'),
        seedVal: root.querySelector('#seed-val'),
        fileDirect: root.querySelector('#file-direct'),
        fileBridge: root.querySelector('#file-bridge'),
        statusMessage: root.querySelector('#status-message'),
        statusJob: root.querySelector('#status-job'),
        checksList: root.querySelector('#checks-list'),
        stagesList: root.querySelector('#stages-list'),
        stagesSummary: root.querySelector('#stages-summary'),
    };

    const codeTabs = initCodeTabs({
        tabDirect: root.querySelector('#tab-cxx'),
        tabBridge: root.querySelector('#tab-lua'),
        codeView: root.querySelector('#code-view'),
    });

    const state = {
        busy: false,
        isCustomCode: false,
        svgs: { cpp: '', lua: '' },
        graphml: { cpp: '', lua: '' },
        activeSvg: 'cpp',
        activeGraphml: 'lua',
        graphName: '',
    };

    const STORAGE_KEY = 'bridge_api_secret';
    const savedSecret = localStorage.getItem(STORAGE_KEY);
    if (savedSecret) {
        els.runnerUrl.value = savedSecret;
    } else if (config.defaultApiKey) {
        els.runnerUrl.value = config.defaultApiKey;
    }

    els.runnerUrl.addEventListener('input', () => {
        localStorage.setItem(STORAGE_KEY, els.runnerUrl.value);
    });

    // The key input stays visible until the Engine accepts the key.
    function setSecretInputVisible(visible) {
        const container = els.runnerUrl.closest('.runner-url');
        if (container) container.hidden = !visible;
    }

    /* ---- static panels ---- */

    for (const check of CHECKS) {
        const row = document.createElement('div');
        row.className = 'check-row';
        const marker = document.createElement('span');
        marker.className = 'check-marker';
        const text = document.createElement('span');
        text.textContent = check;
        row.append(marker, text);
        els.checksList.append(row);
    }

    const stageRows = new Map();
    for (const stage of STAGES) {
        const row = document.createElement('div');
        row.className = 'check-row stage-row is-pending';
        const marker = document.createElement('span');
        marker.className = 'check-marker';
        const text = document.createElement('span');
        text.textContent = stage.label;
        row.append(marker, text);
        els.stagesList.append(row);
        stageRows.set(stage.id, row);
    }

    function renderStages(seen, failed) {
        const order = STAGES.map((stage) => stage.id);
        const failedIdx = failed ? order.indexOf(failed) : -1;
        let activeIdx = -1;
        for (let i = 0; i < order.length; i++) {
            if (!seen.has(order[i])) {
                activeIdx = i;
                break;
            }
        }
        for (const [id, row] of stageRows) {
            const idx = order.indexOf(id);
            row.classList.remove('is-pending', 'is-active', 'is-done', 'is-failed');
            if (failedIdx >= 0 && idx === failedIdx) row.classList.add('is-failed');
            else if (seen.has(id)) row.classList.add('is-done');
            else if (idx === activeIdx && !failed) row.classList.add('is-active');
            else row.classList.add('is-pending');
        }
    }

    /* ---- status, busy state, params ---- */

    const setStatus = (message, jobState = '') => {
        els.statusMessage.textContent = message;
        els.statusJob.hidden = !jobState;
        els.statusJob.textContent = jobState;
    };

    const setBusy = (busy) => {
        state.busy = busy;
        els.loadCases.disabled = busy;
        els.runCustom.disabled = busy;
        els.runCustom.textContent = busy ? 'Executing…' : 'Execute';
    };

    function syncParamLabels() {
        els.nodesVal.textContent = els.nodes.value;
    }

    els.nodes.addEventListener('input', syncParamLabels);
    els.seedDec.addEventListener('click', () => {
        const newVal = Math.max(PARAMS.nodeDistance.min, Number(els.seedVal.textContent) - 1);
        els.seedVal.textContent = String(newVal);
        els.seedVal.setAttribute('aria-valuenow', String(newVal));
    });
    els.seedInc.addEventListener('click', () => {
        const newVal = Math.min(PARAMS.nodeDistance.max, Number(els.seedVal.textContent) + 1);
        els.seedVal.textContent = String(newVal);
        els.seedVal.setAttribute('aria-valuenow', String(newVal));
    });
    syncParamLabels();

    /* ---- output panels and path switches ---- */

    function showOutput(panel, svgText) {
        showGraph(panel, svgText);
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
        if (els.svgSwitch) els.svgSwitch.hidden = !(state.svgs.cpp && state.svgs.lua);
        if (els.graphmlSwitch) els.graphmlSwitch.hidden = !(state.graphml.cpp && state.graphml.lua);
    }

    function renderSvgPane() {
        showOutput(els.graphDirect, state.svgs[state.activeSvg] || '');
    }

    bindSwitch(els.svgSwitch, (view) => {
        state.activeSvg = view;
        renderSvgPane();
    });
    bindSwitch(els.graphmlSwitch, (view) => {
        state.activeGraphml = view;
        const text = state.graphml[view];
        if (text) {
            pane3d?.render(`${state.graphName || 'graph'} · ${PATH_LABELS[view]}`, text);
        }
    });

    /* ---- case loading ---- */

    async function applySelection() {
        const method = els.methodSelect.value;
        const graph = els.graphSelect.value;
        if (!method || !graph) return;

        // Only warn if the user has uploaded a custom file or manually edited the code.
        // If the code was loaded from a layout method, we allow switching without confirmation.
        if (state.isCustomCode && (els.sourceDirect.value.trim() || els.sourceBridge.value.trim())) {
            const confirmed = confirm('You have uploaded custom code. Replacing it with the layout method source will delete your changes. Continue?');
            if (!confirmed) return;
        }

        try {
            setBusy(true);
            setStatus(`Fetching source for ${method} with ${graph}...`);
            const source = await client.getSourceCode(els.runnerUrl.value, method, graph);

            const cppCode = source.cpp_code || source.cpp || '';
            const luaCode = source.lua_code || source.lua || '';

            els.sourceDirect.value = cppCode;
            els.sourceBridge.value = luaCode;

            // Reset isCustomCode because we just loaded a predefined layout method
            state.isCustomCode = false;

            codeTabs.setSource('direct', els.sourceDirect.value);
            codeTabs.setSource('bridge', els.sourceBridge.value);

            setBusy(false);
            setStatus('Source code loaded. Ready to execute.');
        } catch (error) {
            setBusy(false);
            setStatus(`Error fetching source: ${error.message}`);
        }
    }

    els.methodSelect.addEventListener('change', () => applySelection());
    els.graphSelect.addEventListener('change', () => applySelection());

    async function loadResources() {
        try {
            setBusy(true);
            setStatus('Loading resources from the Engine…');
            const data = await client.loadAvailableResources(els.runnerUrl.value);
            const { methods, files } = data;

            els.methodSelect.textContent = '';
            const methodPlaceholder = document.createElement('option');
            methodPlaceholder.value = '';
            methodPlaceholder.textContent = 'Pick a layout method…';
            els.methodSelect.append(methodPlaceholder);

            for (const name of methods) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                els.methodSelect.append(option);
            }

            els.graphSelect.textContent = '';
            const graphPlaceholder = document.createElement('option');
            graphPlaceholder.value = '';
            graphPlaceholder.textContent = files && files.length ? 'Pick an input graph…' : 'No GraphML files returned';
            els.graphSelect.append(graphPlaceholder);
            if (files) {
                for (const name of files) {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    els.graphSelect.append(option);
                }
            }

            setBusy(false);
            // The Engine accepted the key — hide the input field.
            setSecretInputVisible(false);
            setStatus('Resources loaded from the Engine. Pick a method and a graph to see the source code.');
        } catch (error) {
            setBusy(false);
            setStatus(`Could not load resources: ${error.message}`);
            // Invalid or rejected key: clear the secret and keep the input visible.
            els.runnerUrl.value = '';
            localStorage.removeItem(STORAGE_KEY);
            setSecretInputVisible(true);
        }
    }

    els.loadCases.addEventListener('click', () => loadResources());

    // Auto-load resources if API secret is already present
    if (els.runnerUrl.value) {
        loadResources();
    }

    /* ---- executing ---- */

    async function run() {
        const apiKey = els.runnerUrl.value;
        const graphName = els.graphSelect.value;

        if (!graphName) {
            setStatus('Pick an input GraphML file first — the Engine uses it to resolve __input__.');
            return;
        }
        if (!els.sourceDirect.value.trim()) {
            setStatus('Add C++ code to execute, or load a predefined example.');
            return;
        }
        if (!els.sourceBridge.value.trim()) {
            setStatus('Add a Lua script to execute, or load a predefined example.');
            return;
        }

        const payload = {
            cpp_code: els.sourceDirect.value,
            lua_code: els.sourceBridge.value,
            input_file: graphName,
        };

        try {
            setBusy(true);
            state.svgs = { cpp: '', lua: '' };
            state.graphml = { cpp: '', lua: '' };
            refreshSwitches();
            showOutput(els.graphDirect, '');
            pane3d?.clear('Executing — the returned GraphML will appear here.');
            els.stagesSummary.hidden = true;
            renderStages(new Set(['queued']), null);

            setStatus('Executing sequentially on the Engine…', 'executing');

            const result = await client.executeSequential(apiKey, payload);

            renderStages(STAGES.map((stage) => stage.id).reduce((set, id) => set.add(id), new Set()), null);
            els.stagesSummary.hidden = false;
            els.stagesSummary.textContent = 'custom script · succeeded';

            // Per path the Engine returns the SVG and the laid-out GraphML.
            state.svgs = { cpp: result.svgs?.cpp || '', lua: result.svgs?.lua || '' };
            state.graphml = { cpp: result.graphml?.cpp || '', lua: result.graphml?.lua || '' };
            state.graphName = graphName;
            state.activeSvg = state.svgs.cpp ? 'cpp' : 'lua';
            state.activeGraphml = state.graphml.lua ? 'lua' : 'cpp';
            setActiveButton(els.svgSwitch, state.activeSvg);
            setActiveButton(els.graphmlSwitch, state.activeGraphml);
            refreshSwitches();
            renderSvgPane();
            pane3d?.render(`${graphName} · ${PATH_LABELS[state.activeGraphml]}`,
                state.graphml[state.activeGraphml] || '');
            setStatus('Completed. Pane A shows the returned SVGs, pane B the returned GraphML layout.', 'succeeded');
        } catch (error) {
            renderStages(new Set(), 'running');
            els.stagesSummary.hidden = false;
            els.stagesSummary.textContent = 'failed';
            setStatus(error.message, 'error');
        } finally {
            setBusy(false);
        }
    }

    els.runCustom.addEventListener('click', () => run());

    /* ---- custom sources ---- */

    function bindFileSource(input, textarea, path) {
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (file) {
                textarea.value = await file.text();
                codeTabs.setSource(path, textarea.value);
                state.isCustomCode = true;
            }
            input.value = '';
        });
    }

    els.sourceDirect.addEventListener('input', () => {
        codeTabs.setSource('direct', els.sourceDirect.value);
    });
    els.sourceBridge.addEventListener('input', () => {
        codeTabs.setSource('bridge', els.sourceBridge.value);
    });
    bindFileSource(els.fileDirect, els.sourceDirect, 'direct');
    bindFileSource(els.fileBridge, els.sourceBridge, 'bridge');

    showOutput(els.graphDirect, '');
}