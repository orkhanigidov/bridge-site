/**
 * API client for the BRIDGE Engine.
 * API secrets are sent only in request headers, never in URLs.
 */
export class EngineError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EngineError';
    }
}

// Fixed host: URL query/fragment and HTTP protocol are not accepted.
const ENGINE_BASE_URL = 'https://api.bridgeengine.tech';
const JSON_CONTENT_HEADERS = { 'Content-Type': 'application/json' };
const REQUEST_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 10_000;

function requireApiKey(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
        throw new EngineError('Enter your API secret key first.');
    }

    return apiKey.trim();
}

async function requestJson(requestUrl, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(requestUrl, {
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
            throw new EngineError(
                response.status === 401
                    ? 'Engine rejected the API secret (401). Check the key.'
                    : `Engine returned HTTP ${response.status}.`
            );
        }

        try {
            return await response.json();
        } catch {
            throw new EngineError('Engine did not return a valid JSON response.');
        }
    } catch (error) {
        if (error instanceof EngineError) {
            throw error;
        }

        if (error?.name === 'AbortError') {
            throw new EngineError('The request timed out. Check the Engine status.');
        }

        // The key, response body, and internal server details are never shown to the user.
        throw new EngineError(
            'Could not reach the Engine. Check the URL, CORS, and server status.'
        );
    } finally {
        clearTimeout(timeoutId);
    }
}

export function createEngineClient() {
    return {
        /** GET /api/discovery is no longer used as we load examples locally */

        /** GET /api/parameters is no longer used as we load examples locally */

        /** GET /api/source/{method} is no longer used as we load examples locally */

        /** GET /api/health — one call proves connectivity and the API secret. */
        async checkHealth(apiKey) {
            const key = requireApiKey(apiKey);

            const responseData = await requestJson(`${ENGINE_BASE_URL}/api/health`, {
                method: 'GET',
                headers: { 'X-API-Secret': key },
            }, HEALTH_TIMEOUT_MS);

            return {
                ok: responseData.status_code === 200,
                message: responseData.message || '',
            };
        },

        /** POST /api/execute_sequential */
        async executeSequential(apiKey, payload) {
            const key = requireApiKey(apiKey);

            const requestPayload = {
                cpp_code: payload.cpp_code,
                lua_code: payload.lua_code,
                graphml_file: payload.graphml_file,
                graphml_name: payload.graphml_name || '',
            };

            const responseData = await requestJson(`${ENGINE_BASE_URL}/api/execute_sequential`, {
                method: 'POST',
                headers: { ...JSON_CONTENT_HEADERS, 'X-API-Secret': key },
                body: JSON.stringify(requestPayload),
            });

            return {
                success: Boolean(responseData.success),
                message: responseData.message || '',
                svgs: {
                    cpp: responseData.cpp_svg || '',
                    lua: responseData.lua_svg || '',
                },
                graphML: {
                    cpp: responseData.cpp_graphml || '',
                    lua: responseData.lua_graphml || responseData.graphml ||
                        responseData.graphml_content || '',
                },
            };
        },
    };
}