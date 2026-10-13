/**
 * Demo state machine: execute a script on the Engine (one synchronous request),
 * then show the SVG graphs the Engine returned on both panels.
 */
import { CHECKS, STAGES, PARAMS } from '../config/site.js';
import { initCodeTabs } from './codeTabs.js';
import { createRunRecord } from './runRecord.js';

export function initDemo(root, client, config) {
    const els = {
        runnerUrl: root.querySelector('#runner-url'),
        loadCases: root.querySelector('#load-cases'),
        methodSelect: root.querySelector('#method-select'),
        graphSelect: root.querySelector('#graph-select'),
        sourceDirect: root.querySelector('#source-direct'),
        sourceBridge: root.querySelector('#source-bridge'),
        runCustom: root.querySelector('#run-custom'),
        graphDirect: root.querySelector('#graph-direct'),
        graphBridge: root.querySelector('#graph-bridge'),
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
        record: createRunRecord({
            toggle: root.querySelector('#record-toggle'),
            body: root.querySelector('#record-body'),
            hint: root.querySelector('#record-hint'),
        }),
    };

    const codeTabs = initCodeTabs({
        tabDirect: root.querySelector('#tab-cxx'),
        tabBridge: root.querySelector('#tab-lua'),
        codeView: root.querySelector('#code-view'),
    });

    const state = { busy: false, codeId: '', codes: new Map(), startedAt: 0, isCustomCode: false };

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

    // If we already have a secret, hide the input field and load resources automatically
    if (els.runnerUrl.value) {
        const container = els.runnerUrl.closest('.runner-url');
        if (container) container.hidden = true;
        // We will call loadResources later in the function after it is defined
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

    /* ---- output panels ---- */

    function showOutput(panel, svgText) {
        const svg = String(svgText || '').trim();
        panel.textContent = '';
        if (svg.includes('<svg')) {
            panel.innerHTML = svg; // ready SVG from the Engine
        } else {
            const note = document.createElement('p');
            note.className = 'graph-empty';
            note.textContent = 'No graph output for this side.';
            panel.append(note);
        }
    }

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

            if (typeof codeTabs !== 'undefined') {
                codeTabs.setSource('direct', els.sourceDirect.value);
                codeTabs.setSource('bridge', els.sourceBridge.value);
            }

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
            setStatus('Resources loaded from the Engine. Pick a method and a graph to see the source code.');
        } catch (error) {
            setBusy(false);
            setStatus(`Could not load resources: ${error.message}`);

            // If auto-loading failed, clear the secret and show the input again
            els.runnerUrl.value = '';
            localStorage.removeItem(STORAGE_KEY);
            const container = els.runnerUrl.closest('.runner-url');
            if (container) container.hidden = false;
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
            state.startedAt = Date.now();
            showOutput(els.graphDirect, '');
            showOutput(els.graphBridge, '');
            els.stagesSummary.hidden = true;
            renderStages(new Set(['queued']), null);

            els.record.begin('engine', payload);
            setStatus('Executing sequentially on the Engine…', 'executing');

            const result = await client.executeSequential(apiKey, payload);

            renderStages(STAGES.map((stage) => stage.id).reduce((set, id) => set.add(id), new Set()), null);
            els.stagesSummary.hidden = false;
            els.stagesSummary.textContent = 'custom script · succeeded';
            showOutput(els.graphDirect, result.svgs?.cpp || '');
            showOutput(els.graphBridge, result.svgs?.lua || '');
            const waitedS = (Date.now() - state.startedAt) / 1000;
            els.record.finish('custom script', 'succeeded', waitedS);
            setStatus('Completed. Showing graph data returned by the Engine.', 'succeeded');
        } catch (error) {
            els.record.fail(error.message);
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
    showOutput(els.graphBridge, '');
}