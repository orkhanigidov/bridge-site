/**
 * HTTP client for the BRIDGE Engine (Network mode).
 * The browser never executes C++ — every method talks to the Engine's
 * REST API (POST /api/execute_sequential) and returns the
 * Engine's own responses.
 */

export class RunnerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RunnerError';
    }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Engine base URL — the deployed BRIDGE Engine endpoint.
// Configure here or deploy behind a reverse proxy; visitors authenticate with an API secret key.
const ENGINE_BASE_URL = (window.ENGINE_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

function assertApiKey(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) {
        throw new RunnerError('Enter your generated API secret key first.');
    }
    return key;
}

async function requestJson(url, options = {}) {
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new RunnerError('Could not reach the Engine. Check the URL and that Engine.exe is running.');
    }
    if (!response.ok) {
        throw new RunnerError(`Engine returned HTTP ${response.status}.`);
    }
    return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRunnerClient({ pollIntervalMs = 1500, pollTimeoutMs = 180000 } = {}) {
    return {
        /** GET /api/discovery → { methods: [], files: [] } */
        async loadAvailableResources(apiKey) {
            const key = assertApiKey(apiKey);
            const data = await requestJson(`${ENGINE_BASE_URL}/api/discovery`, {
                headers: { 'X-API-Secret': key },
            });
            return data;
        },

        /** GET /api/source/{method} → { cpp_code: "...", lua_code: "..." } */
        async getSourceCode(apiKey, method, graph) {
            const key = assertApiKey(apiKey);
            const path = `/api/source/${encodeURIComponent(method)}`;
            const query = `?graph=${encodeURIComponent(graph)}`;
            const url = `${ENGINE_BASE_URL}${path}${query}`;

            const data = await requestJson(url, {
                headers: { 'X-API-Secret': key },
            });
            return data;
        },

        /** POST /api/execute_sequential.
         *  Engine request: { cpp_code, lua_code, input_file }.
         *  Engine response: { success, message, cpp_svg, lua_svg } with base64 SVGs.
         *  Normalized here to { success, message, svgs: { cpp, lua } } with SVG text. */
        async executeSequential(apiKey, payload) {
            const key = assertApiKey(apiKey);
            const authHeaders = { ...JSON_HEADERS, 'X-API-Secret': key };

            const requestPayload = {
                cpp_code: payload.cpp_code,
                lua_code: payload.lua_code,
                graphml_file: payload.graphml_file || payload.input_file,
            };

            const data = await requestJson(`${ENGINE_BASE_URL}/api/execute_sequential`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(requestPayload),
            });

            return {
                success: Boolean(data.success),
                message: data.message || '',
                svgs: {
                    cpp: data.cpp_svg || '',
                    lua: data.lua_svg || '',
                },
            };
        },

        /** GET /cases → { cases: [{ id, name, sourceA?, sourceB? }] } */
        async loadCases(apiKey) {
            const key = assertApiKey(apiKey);
            const data = await requestJson(`${ENGINE_BASE_URL}/cases`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (!Array.isArray(data.cases)) {
                throw new RunnerError('Expected a scripts array in the Engine response.');
            }
            // Normalize to internal field names
            return data.cases.map(testCase => ({
                ...testCase,
                directSource: testCase.sourceA,
                bridgeSource: testCase.sourceB,
            }));
        },

        /** POST /jobs, then poll GET /jobs/:id until the runner reports a final status.
         *  onStatus receives each polled job object ({ status, stage? }). */
        async runJob(apiKey, payload, onStatus = () => { }) {
            const key = assertApiKey(apiKey);
            const authHeaders = { ...JSON_HEADERS, 'Authorization': `Bearer ${key}` };
            const created = await requestJson(`${ENGINE_BASE_URL}/jobs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(payload),
            });
            if (!created.jobId) {
                throw new RunnerError('Engine response is missing jobId.');
            }

            const jobPath = `${ENGINE_BASE_URL}/jobs/${encodeURIComponent(created.jobId)}`;
            const deadline = Date.now() + pollTimeoutMs;

            while (Date.now() < deadline) {
                await sleep(pollIntervalMs);
                const job = await requestJson(jobPath, {
                    headers: { 'Authorization': `Bearer ${key}` },
                });
                onStatus(job);
                if (job.status === 'succeeded') {
                    const result = job.result || {};
                    // Normalize API contract (outputA/outputB) to internal names
                    if (!result.outputA || !result.outputB) {
                        throw new RunnerError('Completed execution did not return both graph outputs.');
                    }
                    return {
                        jobId: created.jobId,
                        directGraph: result.outputA,
                        bridgeGraph: result.outputB,
                    };
                }
                if (job.status === 'failed') {
                    throw new RunnerError(job.error || 'The script execution failed.');
                }
            }
            throw new RunnerError('Timed out waiting for the Engine. Check the server status.');
        },
    };
}