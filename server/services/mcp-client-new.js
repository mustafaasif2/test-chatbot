const { experimental_createMCPClient } = require("ai");
const { Experimental_StdioMCPTransport } = require("ai/mcp-stdio");
const path = require("path");

class CommercetoolsMCPClient {
  constructor() {
    this.client = null;
    this.tools = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    try {
      console.log("🔗 Connecting to Commercetools MCP server...");

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

      // Create MCP client with stdio transport
      this.client = await experimental_createMCPClient({
        transport: new Experimental_StdioMCPTransport({
          command: "node",
          args: [path.join(__dirname, "..", "mcp-server.js")],
          env: {
            ...process.env,
            // Ensure all required environment variables are passed
            COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
            COMMERCETOOLS_CLIENT_SECRET:
              process.env.COMMERCETOOLS_CLIENT_SECRET,
            COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
            COMMERCETOOLS_AUTH_URL: process.env.COMMERCETOOLS_AUTH_URL,
            COMMERCETOOLS_API_URL: process.env.COMMERCETOOLS_API_URL,
          },
        }),
        name: "ai-chatbot-server",
        onUncaughtError: (error) => {
          console.error("❌ MCP Client uncaught error:", error);
        },
      });

      // Get available tools
      this.tools = await this.client.tools();

      this.isConnected = true;
      console.log("✅ Successfully connected to Commercetools MCP server");
      console.log(`🛠️  Loaded ${Object.keys(this.tools).length} tools`);

      // Log available tool names
      const toolNames = Object.keys(this.tools);
      if (toolNames.length > 0) {
        console.log("📦 Available tools:", toolNames.join(", "));
      }
    } catch (error) {
      console.error("❌ Failed to connect to MCP server:", error);
      this.isConnected = false;
      throw error;
    }
  }

  async getTools() {
    if (!this.isConnected || !this.tools) {
      await this.connect();
    }
    return this.tools;
  }

  async refreshTools() {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      console.log("🔄 Refreshing MCP tools...");
      this.tools = await this.client.tools();
      console.log(`🛠️  Refreshed ${Object.keys(this.tools).length} tools`);
      return this.tools;
    } catch (error) {
      console.error("❌ Failed to refresh tools:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        console.log("🔚 Disconnected from MCP server");
      } catch (error) {
        console.error("❌ Error disconnecting from MCP server:", error);
      }
    }
    this.client = null;
    this.tools = null;
    this.isConnected = false;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      toolCount: this.tools ? Object.keys(this.tools).length : 0,
      toolNames: this.tools ? Object.keys(this.tools) : [],
    };
  }
}

module.exports = { CommercetoolsMCPClient };
