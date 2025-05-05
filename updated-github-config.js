/**
 * GitHub Configuration
 * Central configuration for GitHub API access
 */

// GitHub username
const GITHUB_USERNAME = 'rivie13';

// Your function app URL - replace with your actual deployed function URL
const FUNCTION_APP_URL = 'https://your-function-app.azurewebsites.net/api/github';

// Export configuration
window.GitHubConfig = {
  username: GITHUB_USERNAME,
  cacheDuration: 24 * 60 * 60 * 1000, // 24 hours default cache duration
  
  // Helper function to use the proxy for GitHub API requests
  addClientId: function(url) {
    // Extract the path from the GitHub API URL
    const githubApiPrefix = 'https://api.github.com/';
    if (!url.startsWith(githubApiPrefix)) {
      console.warn('URL is not a GitHub API URL:', url);
      return url;
    }
    
    // Extract the path and query parts
    const urlObj = new URL(url);
    const path = url.substring(githubApiPrefix.length);
    
    // Build the new URL using the function app
    let result = `${FUNCTION_APP_URL}/${path}`;
    
    // Add any existing query parameters (except client_id)
    const params = new URLSearchParams();
    urlObj.searchParams.forEach((value, key) => {
      if (key !== 'client_id' && key !== 'client_secret') {
        params.append(key, value);
      }
    });
    
    // Add the query string if we have parameters
    const queryString = params.toString();
    if (queryString) {
      result += `?${queryString}`;
    }
    
    console.log(`DEBUG CONFIG - Original URL: ${url}`);
    console.log(`DEBUG CONFIG - Proxied URL: ${result}`);
    return result;
  },

  // Get cached data or return null
  getCachedData: function(key) {
    const cachedData = localStorage.getItem(key);
    const cacheTimestamp = localStorage.getItem(`${key}_timestamp`);
    const now = Date.now();
    
    if (cachedData && cacheTimestamp && (now - parseInt(cacheTimestamp) < this.cacheDuration)) {
      return JSON.parse(cachedData);
    }
    return null;
  },
  
  // Cache data with expiration
  cacheData: function(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`${key}_timestamp`, Date.now().toString());
      return true;
    } catch (e) {
      console.warn('Failed to cache data:', e);
      return false;
    }
  }
}; 