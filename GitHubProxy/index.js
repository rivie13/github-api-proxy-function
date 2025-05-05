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
        
        // Get response data
        const data = await response.json();
        
        // Pass through headers for rate limiting info
        const headers = {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': response.headers.get('x-ratelimit-limit'),
            'X-RateLimit-Remaining': response.headers.get('x-ratelimit-remaining'),
            'X-RateLimit-Reset': response.headers.get('x-ratelimit-reset'),
            'Access-Control-Allow-Origin': '*' // Enable CORS
        };
        
        // Return the response
        context.res = {
            status: response.status,
            headers: headers,
            body: data
        };
    } catch (error) {
        context.log.error(`Error proxying GitHub API: ${error.message}`);
        context.res = {
            status: 500,
            body: { error: "Failed to proxy GitHub API request", details: error.message }
        };
    }
}; 