# GitHub API Proxy Function

A serverless Azure Function that proxies GitHub API requests and handles authentication securely.

## Features

- Proxies requests to GitHub API endpoints
- Adds client_id and client_secret authentication without exposing secrets (DEPRECATED)
- Uses tokens for authentication without exposing tokens
- Passes through rate limit information in headers
- Enables CORS for cross-domain access
- Supports any GitHub API endpoint

## Deployment

### Prerequisites

1. [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. [Azure Functions Core Tools](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local)
3. A GitHub OAuth App with client ID and client secret

### Local Development

1. Update `local.settings.json` with your GitHub OAuth App credentials
2. Install dependencies:
   ```
   npm install
   ```
3. Run locally:
   ```
   func start
   ```

### Deploy to Azure

1. Create a Function App in Azure Portal or with Azure CLI:
   ```
   az login
   az group create --name <resource-group-name> --location <location>
   az storage account create --name <storage-name> --location <location> --resource-group <resource-group-name> --sku Standard_LRS
   az functionapp create --resource-group <resource-group-name> --consumption-plan-location <location> --runtime node --runtime-version 16 --functions-version 4 --name <app-name> --storage-account <storage-name>
   ```

2. Configure application settings:
   ```
   az functionapp config appsettings set --name <app-name> --resource-group <resource-group-name> --settings GITHUB_CLIENT_ID=your_client_id GITHUB_CLIENT_SECRET=your_client_secret
   ```

3. Deploy the function:
   ```
   func azure functionapp publish <app-name>
   ```

## Usage

Once deployed, you can use the function to proxy GitHub API requests:

```javascript
// Instead of calling GitHub API directly
// const url = `https://api.github.com/users/${username}/repos?client_id=${clientId}`;

// Call through the proxy
const url = `https://your-function-app.azurewebsites.net/api/github/users/${username}/repos`;

fetch(url)
  .then(response => response.json())
  .then(data => {
    console.log(data);
  });
```

## Modifying Your Website Code

Update your website's GitHub API calls to use the proxy:

1. In `github-config.js`, change the `addClientId` method:

```javascript
addClientId: function(url) {
  // Extract the path from the GitHub API URL
  const githubApiPrefix = 'https://api.github.com/';
  if (!url.startsWith(githubApiPrefix)) {
    console.warn('URL is not a GitHub API URL:', url);
    return url;
  }
  
  const path = url.substring(githubApiPrefix.length);
  const result = `https://your-function-app.azurewebsites.net/api/github/${path}`;
  console.log(`DEBUG CONFIG - Original URL: ${url}`);
  console.log(`DEBUG CONFIG - Proxied URL: ${result}`);
  return result;
}
```

## License

MIT 
