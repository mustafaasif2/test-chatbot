const {
  CommercetoolsAgentEssentials,
} = require("@commercetools/agent-essentials/modelcontextprotocol");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
require("dotenv").config();

const server = new CommercetoolsAgentEssentials({
  clientId: process.env.COMMERCETOOLS_CLIENT_ID,
  clientSecret: process.env.COMMERCETOOLS_CLIENT_SECRET,
  projectKey: process.env.COMMERCETOOLS_PROJECT_KEY,
  authUrl: process.env.COMMERCETOOLS_AUTH_URL,
  apiUrl: process.env.COMMERCETOOLS_API_URL,
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
    // Validate required environment variables
    const requiredEnvVars = [
      "COMMERCETOOLS_CLIENT_ID",
      "COMMERCETOOLS_CLIENT_SECRET",
      "COMMERCETOOLS_PROJECT_KEY",
      "COMMERCETOOLS_AUTH_URL",
      "COMMERCETOOLS_API_URL",
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Use stderr for logging so it doesn't interfere with MCP protocol
    console.error("🚀 Commercetools MCP Server running on stdio");
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
