const fetch = require('node-fetch');

module.exports = async function (context, req) {
    try {
        // Handle OPTIONS (preflight) requests for CORS
        if (req.method === "OPTIONS") {
            context.res = {
                status: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
            };
            return;
        }

        // Get GitHub token from environment variables
        // We'll try to get a personal access token first, then fall back to client ID/secret
        const githubToken = process.env.GITHUB_TOKEN;
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        
        // Debug log to check environment variables
        context.log.info("Environment Variables Check:");
        context.log.info(`GITHUB_TOKEN exists: ${!!githubToken}`);
        context.log.info(`GITHUB_CLIENT_ID exists: ${!!clientId}`);
        context.log.info(`GITHUB_CLIENT_SECRET exists: ${!!clientSecret}`);
        
        if (!githubToken && (!clientId || !clientSecret)) {
            context.log.error("GitHub credentials not configured");
            context.log.error("Available environment variables:");
            Object.keys(process.env).forEach(key => {
                context.log.error(`  ${key}: ${key.includes('SECRET') || key.includes('TOKEN') ? '[REDACTED]' : 'exists'}`);
            });
            context.res = {
                status: 500,
                body: { error: "Server configuration error - Missing authentication credentials" }
            };
            return;
        }

        // Get the path from the route parameter
        const path = context.bindingData.path || "";
        
        // Special handling for GraphQL requests
        if (path === "graphql" || req.originalUrl?.includes("/graphql")) {
            await handleGraphQLRequest(context, req, githubToken, clientId, clientSecret);
            return;
        }

        // Regular REST API handling
        // Build the GitHub API URL
        let apiUrl = `https://api.github.com/${path}`;
        
        // Add query parameters
        const urlObj = new URL(apiUrl);
        
        // Copy any query parameters from the request
        const params = req.query;
        Object.keys(params).forEach(key => {
            if (key !== 'code' && key !== 'client_id' && key !== 'client_secret') {
                urlObj.searchParams.append(key, params[key]);
            }
        });
        
        // Convert URL object back to string
        apiUrl = urlObj.toString();
        
        context.log(`Proxying request to: ${apiUrl}`);
        
        // Prepare headers for API call
        const headers = {
            'User-Agent': 'GitHub-API-Proxy',
            'Accept': 'application/vnd.github+json'
        };
        
        // Add authentication - prefer token auth over client ID/secret
        if (githubToken) {
            context.log('Using token-based authentication');
            headers['Authorization'] = `Bearer ${githubToken}`;
        } else {
            context.log(`Using client ID/secret authentication: client_id=${clientId.substring(0, 4)}...`);
            // Add auth as query parameters
            const authUrl = new URL(apiUrl);
            authUrl.searchParams.append('client_id', clientId);
            authUrl.searchParams.append('client_secret', clientSecret);
            apiUrl = authUrl.toString();
        }
        
        // Call GitHub API
        const response = await fetch(apiUrl, { headers });
        
        // Get the headers we want to pass through
        const rateLimit = response.headers.get('x-ratelimit-limit');
        const rateRemaining = response.headers.get('x-ratelimit-remaining'); 
        const rateReset = response.headers.get('x-ratelimit-reset');
        const rateUsed = response.headers.get('x-ratelimit-used');
        
        // Get response data
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        // Pass through headers for rate limiting info
        const responseHeaders = {
            'Content-Type': response.headers.get('content-type') || 'application/json',
            'X-RateLimit-Limit': rateLimit,
            'X-RateLimit-Remaining': rateRemaining,
            'X-RateLimit-Reset': rateReset,
            'X-RateLimit-Used': rateUsed,
            'Access-Control-Allow-Origin': '*', // Enable CORS
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used'
        };
        
        // Return the response
        context.res = {
            status: response.status,
            headers: responseHeaders,
            body: data
        };
        
        // Log rate limit info for debugging
        context.log(`Rate limit info - Limit: ${rateLimit}, Remaining: ${rateRemaining}, Reset: ${rateReset}`);
        
    } catch (error) {
        context.log.error(`Error proxying GitHub API: ${error.message}`);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: { error: "Failed to proxy GitHub API request", details: error.message }
        };
    }
};

/**
 * Handle GraphQL API requests
 */
async function handleGraphQLRequest(context, req, githubToken, clientId, clientSecret) {
    try {
        context.log("Handling GraphQL request");
        
        // GitHub GraphQL endpoint
        const url = "https://api.github.com/graphql";

        // Ensure the request has a body with query for POST requests
        if (req.method === "POST" && (!req.body || !req.body.query)) {
            context.res = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                body: { error: "Missing GraphQL query in request body" }
            };
            return;
        }

        // Clone the request body to avoid modifying the original
        const body = req.body ? { ...req.body } : { query: "{viewer{login}}" };

        // Prepare headers for API call
        const headers = {
            'User-Agent': 'GitHub-API-Proxy',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        // Add authentication - prefer token auth over client ID/secret
        if (githubToken) {
            context.log('Using token-based authentication for GraphQL');
            headers['Authorization'] = `Bearer ${githubToken}`;
        } else if (clientId && clientSecret) {
            context.log('Using client ID/secret authentication for GraphQL');
            headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
        }

        // Make the request to GitHub GraphQL API
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        // Get the response headers and data
        const responseData = await response.json();

        // Get rate limit headers
        const rateLimit = response.headers.get('x-ratelimit-limit');
        const rateRemaining = response.headers.get('x-ratelimit-remaining'); 
        const rateReset = response.headers.get('x-ratelimit-reset');
        const rateUsed = response.headers.get('x-ratelimit-used');

        // Set response with appropriate headers
        context.res = {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used',
                'X-RateLimit-Limit': rateLimit,
                'X-RateLimit-Remaining': rateRemaining,
                'X-RateLimit-Reset': rateReset,
                'X-RateLimit-Used': rateUsed
            },
            body: responseData
        };

        // Log rate limit info for debugging
        context.log(`GraphQL Rate limit info - Limit: ${rateLimit}, Remaining: ${rateRemaining}, Reset: ${rateReset}`);

    } catch (error) {
        context.log.error(`Error in GraphQL proxy: ${error.message}`);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: { error: "Failed to proxy GraphQL request", details: error.message }
        };
    }
} 