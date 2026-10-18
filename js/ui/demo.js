/**
 * Demo state machine: execute a script on the Engine (one synchronous request),
 * then show what the Engine returned — the SVGs of both paths on pane A and the
 * GraphML files (rendered from their original coordinates) on pane B.
 */
import {
    COMPARISON_CHECKS,
    EXECUTION_STAGES,
    LAYOUT_PARAMETERS,
} from '../config/siteConfig.js';
import { initCodeTabs } from './codeTabs.js';
import { renderSvgGraph } from './svgGraphViewer.js';

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
        layerDistanceInput: root.querySelector('#layer-distance'),
        layerDistanceValue: root.querySelector('#layer-distance-value'),
        nodeDistanceDecreaseButton: root.querySelector('#node-distance-decrease'),
        nodeDistanceIncreaseButton: root.querySelector('#node-distance-increase'),
        nodeDistanceValue: root.querySelector('#node-distance-value'),
        directSourceFileInput: root.querySelector('#file-direct'),
        bridgeSourceFileInput: root.querySelector('#file-bridge'),
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

    // The key input stays visible until the Engine accepts the key.
    function setApiKeyFieldVisible(visible) {
        const container = elements.apiKeyInput.closest('.api-key-field');
        if (container) container.hidden = !visible;
    }

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

    /* ---- status, busy state, params ---- */

    const setStatus = (message, jobState = '') => {
        elements.statusMessage.textContent = message;
        elements.statusJob.hidden = !jobState;
        elements.statusJob.textContent = jobState;
    };

    const setBusy = (busy) => {
        elements.loadResourcesButton.disabled = busy;
        elements.executeButton.disabled = busy;
        elements.executeButton.textContent = busy ? 'Executing…' : 'Execute';
    };

    function updateLayerDistanceValue() {
        elements.layerDistanceValue.textContent = elements.layerDistanceInput.value;
    }

    elements.layerDistanceInput.addEventListener('input', updateLayerDistanceValue);
    elements.nodeDistanceDecreaseButton.addEventListener('click', () => {
        const nodeDistance = Math.max(
            LAYOUT_PARAMETERS.nodeDistance.min,
            Number(elements.nodeDistanceValue.textContent) - LAYOUT_PARAMETERS.nodeDistance.step,
        );
        elements.nodeDistanceValue.textContent = String(nodeDistance);
        elements.nodeDistanceValue.setAttribute('aria-valuenow', String(nodeDistance));
    });
    elements.nodeDistanceIncreaseButton.addEventListener('click', () => {
        const nodeDistance = Math.min(
            LAYOUT_PARAMETERS.nodeDistance.max,
            Number(elements.nodeDistanceValue.textContent) + LAYOUT_PARAMETERS.nodeDistance.step,
        );
        elements.nodeDistanceValue.textContent = String(nodeDistance);
        elements.nodeDistanceValue.setAttribute('aria-valuenow', String(nodeDistance));
    });
    updateLayerDistanceValue();

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

    async function loadSelectedSource() {
        const method = elements.methodSelect.value;
        const graphFile = elements.graphSelect.value;
        if (!method || !graphFile) return;

        // Only warn if the user has uploaded a custom file or manually edited the code.
        // If the code was loaded from a layout method, we allow switching without confirmation.
        if (state.isCustomCode && (elements.sourceDirect.value.trim() || elements.sourceBridge.value.trim())) {
            const confirmed = confirm('You have uploaded custom code. Replacing it with the layout method source will delete your changes. Continue?');
            if (!confirmed) return;
        }

        try {
            setBusy(true);
            setStatus(`Fetching source for ${method} with ${graphFile}...`);
            const source = await engineClient.getSourceCode(elements.apiKeyInput.value, method, graphFile);

            const cppCode = source.cpp_code || source.cpp || '';
            const luaCode = source.lua_code || source.lua || '';

            elements.sourceDirect.value = cppCode;
            elements.sourceBridge.value = luaCode;

            // Reset isCustomCode because we just loaded a predefined layout method
            state.isCustomCode = false;

            codeTabs.setSource('direct', elements.sourceDirect.value);
            codeTabs.setSource('bridge', elements.sourceBridge.value);

            setBusy(false);
            setStatus('Source code loaded. Ready to execute.');
        } catch (error) {
            setBusy(false);
            setStatus(`Error fetching source: ${error.message}`);
        }
    }

    elements.methodSelect.addEventListener('change', () => loadSelectedSource());
    elements.graphSelect.addEventListener('change', () => loadSelectedSource());

    async function loadResources() {
        try {
            setBusy(true);
            setStatus('Loading resources from the Engine…');
            const data = await engineClient.loadAvailableResources(elements.apiKeyInput.value);
            const { methods, files } = data;

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
            graphPlaceholder.textContent = files && files.length ? 'Pick an input graph…' : 'No GraphML files returned';
            elements.graphSelect.append(graphPlaceholder);
            if (files) {
                for (const name of files) {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    elements.graphSelect.append(option);
                }
            }

            setBusy(false);
            // The Engine accepted the key — hide the input field.
            setApiKeyFieldVisible(false);
            setStatus('Resources loaded from the Engine. Pick a method and a graph to see the source code.');
        } catch (error) {
            setBusy(false);
            setStatus(`Could not load resources: ${error.message}`);
            // Invalid or rejected key: clear the secret and keep the input visible.
            elements.apiKeyInput.value = '';
            localStorage.removeItem(API_KEY_STORAGE_KEY);
            setApiKeyFieldVisible(true);
        }
    }

    elements.loadResourcesButton.addEventListener('click', () => loadResources());

    // Auto-load resources if API secret is already present
    if (elements.apiKeyInput.value) {
        loadResources();
    }

    /* ---- executing ---- */

    async function executeScript() {
        const apiKey = elements.apiKeyInput.value;
        const graphName = elements.graphSelect.value;

        if (!graphName) {
            setStatus('Pick an input GraphML file first — the Engine uses it to resolve __input__.');
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

        const payload = {
            cpp_code: elements.sourceDirect.value,
            lua_code: elements.sourceBridge.value,
            input_file: graphName,
        };

        try {
            setBusy(true);
            state.svgs = { cpp: '', lua: '' };
            state.graphML = { cpp: '', lua: '' };
            refreshSwitches();
            renderSvgOutput('');
            graph3dViewer?.clear('Executing — the returned GraphML will appear here.');
            elements.stagesSummary.hidden = true;
            renderStages(new Set(['queued']), null);

            setStatus('Executing sequentially on the Engine…', 'executing');

            const result = await engineClient.executeSequential(apiKey, payload);

            renderStages(EXECUTION_STAGES.map((stage) => stage.id).reduce((set, id) => set.add(id), new Set()), null);
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

    function bindSourceFileInput(input, textarea, sourceType) {
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (file) {
                textarea.value = await file.text();
                codeTabs.setSource(sourceType, textarea.value);
                state.isCustomCode = true;
            }
            input.value = '';
        });
    }

    elements.sourceDirect.addEventListener('input', () => {
        codeTabs.setSource('direct', elements.sourceDirect.value);
    });
    elements.sourceBridge.addEventListener('input', () => {
        codeTabs.setSource('bridge', elements.sourceBridge.value);
    });
    bindSourceFileInput(elements.directSourceFileInput, elements.sourceDirect, 'direct');
    bindSourceFileInput(elements.bridgeSourceFileInput, elements.sourceBridge, 'bridge');

    renderSvgOutput('');
}