const {
  CommercetoolsAgentEssentials,
} = require("@commercetools/agent-essentials/modelcontextprotocol");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
require("dotenv").config();

// Parse command line arguments for dynamic credentials
const args = process.argv.slice(2);
let credentials = {};

if (args.length >= 5) {
  // Credentials provided as command line arguments
  credentials = {
    clientId: args[0],
    clientSecret: args[1],
    projectKey: args[2],
    authUrl: args[3],
    apiUrl: args[4],
  };
  console.error(
    `🔧 Using provided credentials for project: ${credentials.projectKey}`
  );
} else {
  // Fall back to environment variables
  credentials = {
    clientId: process.env.COMMERCETOOLS_CLIENT_ID,
    clientSecret: process.env.COMMERCETOOLS_CLIENT_SECRET,
    projectKey: process.env.COMMERCETOOLS_PROJECT_KEY,
    authUrl: process.env.COMMERCETOOLS_AUTH_URL,
    apiUrl: process.env.COMMERCETOOLS_API_URL,
  };
  console.error("🔧 Using environment variables for credentials");
}

const server = new CommercetoolsAgentEssentials({
  clientId: credentials.clientId,
  clientSecret: credentials.clientSecret,
  projectKey: credentials.projectKey,
  authUrl: credentials.authUrl,
  apiUrl: credentials.apiUrl,
  configuration: {
    actions: {
      products: {
        read: true,
        create: true,
        update: true,
      },
      cart: {
        read: true,
        create: true,
        update: true,
      },
      project: {
        read: true,
      },
      customers: {
        read: true,
      },
      orders: {
        read: true,
      },
      categories: {
        read: true,
      },
      inventory: {
        read: true,
      },
    },
  },
});

async function main() {
  try {
    // Validate required credentials
    const requiredFields = [
      "clientId",
      "clientSecret",
      "projectKey",
      "authUrl",
      "apiUrl",
    ];

    for (const field of requiredFields) {
      if (!credentials[field]) {
        throw new Error(`Missing required credential: ${field}`);
      }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Use stderr for logging so it doesn't interfere with MCP protocol
    console.error(
      `🚀 Commercetools MCP Server running on stdio for project: ${credentials.projectKey}`
    );
    console.error(
      "📦 Available actions: products, cart, project, customers, orders, categories, inventory"
    );
  } catch (error) {
    console.error("❌ Fatal error starting MCP server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
