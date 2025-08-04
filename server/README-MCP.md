# Commercetools MCP Integration

This server now supports dynamic connection to commercetools MCP (Model Context Protocol) servers, allowing your AI chatbot to directly interact with live commercetools APIs.

## Features

- **Dynamic Tool Discovery**: Automatically discovers and loads available commercetools tools
- **Real-time API Access**: Direct integration with commercetools APIs for live data
- **Read-only Operations**: Currently configured with safe read-only tools by default
- **Automatic Reconnection**: Handles connection issues gracefully
- **Hot Tool Reloading**: Tools are refreshed automatically when the MCP server updates

## Available Operations

When properly configured, your chatbot can perform operations like:

### Product Management

- Read product information, variants, and details
- Search through product catalogs
- Access product types and categories

### Customer Management

- Read customer data and profiles
- Access customer groups and segments

### Order & Cart Management

- Read cart information and contents
- Access order history and details
- View quotes and quote requests

### Inventory & Pricing

- Check inventory levels
- Access pricing information
- Read standalone prices

### Business Configuration

- Read project settings
- Access store configurations
- View business unit information

## Setup Instructions

### 1. Get Your Commercetools API Client

First, you need to create an API Client in your commercetools Merchant Center:

1. Go to your commercetools Merchant Center
2. Navigate to Settings → Developer settings → API clients
3. Create a new API client with appropriate scopes
4. Copy the generated credentials

### 2. Configure Environment Variables

Update your `.env` file in the server directory with your commercetools credentials:

```bash
# Commercetools Configuration for MCP
COMMERCETOOLS_CLIENT_ID=your_client_id_here
COMMERCETOOLS_CLIENT_SECRET=your_client_secret_here
COMMERCETOOLS_PROJECT_KEY=your_project_key_here
COMMERCETOOLS_AUTH_URL=your_auth_url_here
COMMERCETOOLS_API_URL=your_api_url_here
```

#### Finding Your Values

- **CLIENT_ID**: From your API Client in Merchant Center
- **CLIENT_SECRET**: From your API Client in Merchant Center
- **PROJECT_KEY**: Your commercetools project key
- **AUTH_URL**: Your authorization URL (varies by region)
- **API_URL**: Your API URL (varies by region)

#### Common Auth/API URLs by Region

**Europe (eu-central-1):**

```
COMMERCETOOLS_AUTH_URL=https://auth.europe-west1.gcp.commercetools.com
COMMERCETOOLS_API_URL=https://api.europe-west1.gcp.commercetools.com
```

**US (us-central1):**

```
COMMERCETOOLS_AUTH_URL=https://auth.us-central1.gcp.commercetools.com
COMMERCETOOLS_API_URL=https://api.us-central1.gcp.commercetools.com
```

### 3. Required API Scopes

Make sure your API Client has at least these scopes for read operations:

- `view_products`
- `view_customers`
- `view_orders`
- `view_shopping_lists`
- `view_categories`
- `view_types`
- `view_project_settings`

### 4. Start the Server

```bash
cd server
npm start
```

You should see output like:

```
🔄 Initializing commercetools MCP client...
✅ MCP client initialized with X tools
🛠️  Available tools: getWeatherInformation, getLocalTime, sendEmail, product.read, cart.read, ...
```

## Usage Examples

Once configured, you can ask your chatbot questions like:

- "Show me the products in my catalog"
- "What categories do we have?"
- "Get details for product with key 'my-product-key'"
- "What's the current inventory for product X?"
- "Show me recent orders"
- "What customer groups do we have?"

## Troubleshooting

### MCP Not Initializing

If you see:

```
⚠️  Commercetools MCP not initialized - missing environment variables
```

1. Check that all required environment variables are set
2. Verify the credentials are correct
3. Ensure your API client has the necessary scopes

### Connection Errors

1. **Invalid credentials**: Double-check your CLIENT_ID and CLIENT_SECRET
2. **Wrong region**: Verify your AUTH_URL and API_URL match your project's region
3. **Network issues**: Ensure your server can access commercetools APIs
4. **Scope issues**: Make sure your API client has the required scopes

### Tool Execution Errors

1. Check that your API client has permissions for the requested operation
2. Verify the resource exists (e.g., product key, customer ID)
3. Check the commercetools API status

## Security Notes

- The integration is configured with read-only tools by default for safety
- API credentials are never exposed to the client
- All API calls are server-side only
- Consider using environment-specific API clients for production

## Extending the Integration

To enable more tools or write operations:

1. Update the tool configuration in `services/mcp-client.js`
2. Change `--tools=all.read` to `--tools=all` for full access
3. Ensure your API client has write scopes
4. Test thoroughly in a development environment first

## Support

For commercetools-specific issues:

- [Commercetools Documentation](https://docs.commercetools.com/)
- [Commercetools Support](https://support.commercetools.com/)

For MCP integration issues:

- Check server logs for detailed error messages
- Verify environment variable configuration
- Test API credentials directly with commercetools APIs
