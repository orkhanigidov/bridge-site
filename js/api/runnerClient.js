/**
 * HTTPS client for the BRIDGE Engine.
 * API secrets are sent only in request headers, never in URLs.
 */
export class RunnerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RunnerError';
    }
}

// Fixed host: URL query/fragment and HTTP protocol are not accepted.
const ENGINE_BASE_URL = 'https://api.bridgeengine.tech';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const REQUEST_TIMEOUT_MS = 180_000;

function assertApiKey(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
        throw new RunnerError('Enter your API secret key first.');
    }

    return apiKey.trim();
}

async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            ...options,
            // Prevents secret headers from being forwarded to another host via redirects.
            redirect: 'error',
            // Do not send browser cookies/session data to the API.
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new RunnerError(`Engine returned HTTP ${response.status}.`);
        }

        try {
            return await response.json();
        } catch {
            throw new RunnerError('Engine did not return a valid JSON response.');
        }
    } catch (error) {
        if (error instanceof RunnerError) {
            throw error;
        }

        if (error?.name === 'AbortError') {
            throw new RunnerError('The request timed out. Check the Engine status.');
        }

        // The key, response body, and internal server details are never shown to the user.
        throw new RunnerError(
            'Could not reach the Engine. Check the URL, CORS, and server status.'
        );
    } finally {
        clearTimeout(timeoutId);
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRunnerClient({ pollIntervalMs = 1500, pollTimeoutMs = 180000 } = {}) {
    return {
        /** GET /api/discovery → { methods: [], files: [] } */
        async loadAvailableResources(apiKey) {
            const key = assertApiKey(apiKey);

            return requestJson(`${ENGINE_BASE_URL}/api/discovery`, {
                headers: { 'X-API-Secret': key },
            });
        },

        /** GET /api/source/{method} → { cpp_code, lua_code } */
        async getSourceCode(apiKey, method, graph) {
            const key = assertApiKey(apiKey);
            const path = `/api/source/${encodeURIComponent(method)}`;
            const query = `?graph=${encodeURIComponent(graph)}`;

            return requestJson(`${ENGINE_BASE_URL}${path}${query}`, {
                headers: { 'X-API-Secret': key },
            });
        },

        /** POST /api/execute_sequential */
        async executeSequential(apiKey, payload) {
            const key = assertApiKey(apiKey);

            const requestPayload = {
                cpp_code: payload.cpp_code,
                lua_code: payload.lua_code,
                graphml_file: payload.graphml_file || payload.input_file,
            };

            const data = await requestJson(`${ENGINE_BASE_URL}/api/execute_sequential`, {
                method: 'POST',
                headers: { ...JSON_HEADERS, 'X-API-Secret': key },
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

        /** GET /cases → { cases: [...] } */
        async loadCases(apiKey) {
            const key = assertApiKey(apiKey);
            const data = await requestJson(`${ENGINE_BASE_URL}/cases`, {
                headers: { Authorization: `Bearer ${key}` },
            });
            if (!Array.isArray(data.cases)) {
                throw new RunnerError('Expected a cases array in the Engine response.');
            }

            return data.cases.map((testCase) => ({
                ...testCase,
                directSource: testCase.sourceA,
                bridgeSource: testCase.sourceB,
            }));
        },

        /** POST /jobs, then poll GET /jobs/{id} for the result. */
        async runJob(apiKey, payload, onStatus = () => { }) {
            const key = assertApiKey(apiKey);
            const authHeaders = { ...JSON_HEADERS, Authorization: `Bearer ${key}` };
            const created = await requestJson(`${ENGINE_BASE_URL}/jobs`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(payload),
            });
            if (!created.jobId) {
                throw new RunnerError('Engine response is missing jobId.');
            }

            const jobUrl = `${ENGINE_BASE_URL}/jobs/${encodeURIComponent(created.jobId)}`;
            const deadline = Date.now() + pollTimeoutMs;

            while (Date.now() < deadline) {
                await sleep(pollIntervalMs);
                const job = await requestJson(jobUrl, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                onStatus(job);
                if (job.status === 'succeeded') {
                    const result = job.result || {};

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
                    throw new RunnerError('The script execution failed.');
                }
            }
            throw new RunnerError('Timed out waiting for the Engine.');
        },
    };
}