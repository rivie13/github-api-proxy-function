const fetch = require('node-fetch');

module.exports = async function (context, req) {
    try {
        // Get GitHub ClientID and ClientSecret from environment variables
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
            context.log.error("GitHub credentials not configured");
            context.res = {
                status: 500,
                body: { error: "Server configuration error" }
            };
            return;
        }

        // Get the path from the route parameter
        const path = context.bindingData.path || "";
        
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
        
        // Add authentication
        urlObj.searchParams.append('client_id', clientId);
        urlObj.searchParams.append('client_secret', clientSecret);
        
        // Convert URL object back to string
        apiUrl = urlObj.toString();
        
        context.log(`Proxying request to: ${apiUrl}`);
        
        // Call GitHub API
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'GitHub-API-Proxy',
                'Accept': 'application/vnd.github+json'
            }
        });
        
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
        const headers = {
            'Content-Type': response.headers.get('content-type') || 'application/json',
            'X-RateLimit-Limit': rateLimit,
            'X-RateLimit-Remaining': rateRemaining,
            'X-RateLimit-Reset': rateReset,
            'X-RateLimit-Used': rateUsed,
            'Access-Control-Allow-Origin': '*', // Enable CORS
            'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used'
        };
        
        // Return the response
        context.res = {
            status: response.status,
            headers: headers,
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
                'Access-Control-Allow-Origin': '*'
            },
            body: { error: "Failed to proxy GitHub API request", details: error.message }
        };
    }
}; 