const { experimental_createMCPClient } = require("ai");
const { Experimental_StdioMCPTransport } = require("ai/mcp-stdio");
const path = require("path");

class CommercetoolsMCPClient {
  constructor(credentials = null) {
    this.client = null;
    this.tools = null;
    this.isConnected = false;
    this.credentials = credentials; // Store credentials for this instance
    this.clientId = null; // Track which credentials this client is using
  }

  async connect(credentials = null) {
    // Use provided credentials or instance credentials
    const creds = credentials || this.credentials;

    // If we're already connected with the same credentials, return
    if (this.isConnected && this.clientId === creds?.clientId) {
      return;
    }

    // If we have a different connection, disconnect first
    if (this.isConnected && this.clientId !== creds?.clientId) {
      await this.disconnect();
    }

    try {
      console.log("🔗 Connecting to Commercetools MCP server...");

      // Validate required credentials
      if (!creds) {
        // Fall back to environment variables if no credentials provided
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

        // Use environment variables
        this.credentials = {
          clientId: process.env.COMMERCETOOLS_CLIENT_ID,
          clientSecret: process.env.COMMERCETOOLS_CLIENT_SECRET,
          projectKey: process.env.COMMERCETOOLS_PROJECT_KEY,
          authUrl: process.env.COMMERCETOOLS_AUTH_URL,
          apiUrl: process.env.COMMERCETOOLS_API_URL,
        };
      } else {
        // Validate provided credentials
        const requiredFields = [
          "clientId",
          "clientSecret",
          "projectKey",
          "authUrl",
          "apiUrl",
        ];
        for (const field of requiredFields) {
          if (!creds[field]) {
            throw new Error(`Missing required credential: ${field}`);
          }
        }
        this.credentials = creds;
      }

      // Create MCP client with stdio transport, passing credentials as arguments
      this.client = await experimental_createMCPClient({
        transport: new Experimental_StdioMCPTransport({
          command: "node",
          args: [
            path.join(__dirname, "..", "mcp-server.js"),
            // Pass credentials as command line arguments
            this.credentials.clientId,
            this.credentials.clientSecret,
            this.credentials.projectKey,
            this.credentials.authUrl,
            this.credentials.apiUrl,
          ],
          env: {
            ...process.env,
          },
        }),
        name: `ai-chatbot-server-${this.credentials.projectKey}`,
        onUncaughtError: (error) => {
          console.error("❌ MCP Client uncaught error:", error);
        },
      });

      // Get available tools
      this.tools = await this.client.tools();

      this.isConnected = true;
      this.clientId = this.credentials.clientId;
      console.log(
        `✅ Successfully connected to Commercetools MCP server for project: ${this.credentials.projectKey}`
      );
      console.log(`🛠️  Loaded ${Object.keys(this.tools).length} tools`);

      // Log available tool names
      const toolNames = Object.keys(this.tools);
      if (toolNames.length > 0) {
        console.log("📦 Available tools:", toolNames.join(", "));
      }
    } catch (error) {
      console.error("❌ Failed to connect to MCP server:", error);
      this.isConnected = false;
      this.clientId = null;
      throw error;
    }
  }

  async getTools(credentials = null) {
    if (
      !this.isConnected ||
      (credentials && this.clientId !== credentials.clientId)
    ) {
      await this.connect(credentials);
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
    this.clientId = null;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      toolCount: this.tools ? Object.keys(this.tools).length : 0,
      toolNames: this.tools ? Object.keys(this.tools) : [],
      projectKey: this.credentials?.projectKey || null,
      clientId: this.clientId,
    };
  }
}

// Credential Manager for handling multiple MCP connections
class MCPCredentialManager {
  constructor() {
    this.clients = new Map(); // clientId -> MCPClient
    this.cleanup();
  }

  // Generate a key for the client based on credentials
  getClientKey(credentials) {
    return `${credentials.clientId}_${credentials.projectKey}`;
  }

  // Get or create MCP client for given credentials
  async getClient(credentials) {
    const clientKey = this.getClientKey(credentials);

    if (this.clients.has(clientKey)) {
      const client = this.clients.get(clientKey);
      // Verify the client is still valid
      if (client.isConnected && client.clientId === credentials.clientId) {
        return client;
      } else {
        // Client is stale, remove it
        await client.disconnect();
        this.clients.delete(clientKey);
      }
    }

    // Create new client
    const client = new CommercetoolsMCPClient(credentials);
    await client.connect();
    this.clients.set(clientKey, client);

    return client;
  }

  // Get tools for specific credentials
  async getTools(credentials) {
    const client = await this.getClient(credentials);
    return await client.getTools();
  }

  // Validate credentials by attempting connection
  async validateCredentials(credentials) {
    let client = null;
    try {
      console.log(
        `🔐 Validating credentials for project: ${credentials.projectKey}`
      );

      // Validate required fields first
      const requiredFields = [
        "clientId",
        "clientSecret",
        "projectKey",
        "authUrl",
        "apiUrl",
      ];
      const missingFields = requiredFields.filter(
        (field) => !credentials[field]
      );

      if (missingFields.length > 0) {
        return {
          valid: false,
          error: `Missing required fields: ${missingFields.join(", ")}`,
          errorType: "MISSING_FIELDS",
          missingFields,
        };
      }

      // Validate URL formats
      try {
        new URL(credentials.authUrl);
        new URL(credentials.apiUrl);
      } catch (urlError) {
        return {
          valid: false,
          error: "Invalid URL format for authUrl or apiUrl",
          errorType: "INVALID_URL",
        };
      }

      client = new CommercetoolsMCPClient(credentials);

      console.log("🔄 Attempting MCP connection...");
      await client.connect();

      console.log("🛠️ Getting available tools...");
      const tools = await client.getTools();

      await client.disconnect();
      client = null;

      console.log(
        `✅ Validation successful for project: ${credentials.projectKey}`
      );
      return {
        valid: true,
        toolCount: Object.keys(tools).length,
        toolNames: Object.keys(tools),
        projectKey: credentials.projectKey,
      };
    } catch (error) {
      console.error(
        `❌ Validation failed for project: ${credentials.projectKey}`,
        error
      );

      // Clean up client if connection was attempted
      if (client) {
        try {
          await client.disconnect();
        } catch (disconnectError) {
          console.error(
            "Failed to disconnect during error cleanup:",
            disconnectError
          );
        }
      }

      // Categorize different types of errors
      let errorType = "UNKNOWN_ERROR";
      let userFriendlyMessage = error.message;

      if (error.message.includes("Missing required credential")) {
        errorType = "MISSING_CREDENTIALS";
        userFriendlyMessage =
          "Please check that all credential fields are filled correctly.";
      } else if (
        error.message.includes("401") ||
        error.message.includes("Unauthorized") ||
        error.message.includes("invalid_client")
      ) {
        errorType = "AUTHENTICATION_ERROR";
        userFriendlyMessage =
          "Invalid Client ID or Client Secret. Please check your credentials.";
      } else if (
        error.message.includes("403") ||
        error.message.includes("Forbidden") ||
        error.message.includes("insufficient_scope")
      ) {
        errorType = "PERMISSION_ERROR";
        userFriendlyMessage =
          "Your API client does not have sufficient permissions. Please check your client scopes.";
      } else if (
        error.message.includes("404") ||
        error.message.includes("project_not_found")
      ) {
        errorType = "PROJECT_NOT_FOUND";
        userFriendlyMessage = `Project '${credentials.projectKey}' not found. Please check your project key.`;
      } else if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED")
      ) {
        errorType = "NETWORK_ERROR";
        userFriendlyMessage =
          "Unable to connect to commercetools. Please check your internet connection and URLs.";
      } else if (error.message.includes("timeout")) {
        errorType = "TIMEOUT_ERROR";
        userFriendlyMessage = "Connection timeout. Please try again.";
      }

      return {
        valid: false,
        error: userFriendlyMessage,
        originalError: error.message,
        errorType,
        projectKey: credentials.projectKey,
      };
    }
  }

  // Clean up inactive connections
  cleanup() {
    setInterval(() => {
      for (const [key, client] of this.clients.entries()) {
        if (!client.isConnected) {
          this.clients.delete(key);
        }
      }
    }, 300000); // Clean up every 5 minutes
  }

  // Get status of all connections
  getStatus() {
    const status = {};
    for (const [key, client] of this.clients.entries()) {
      status[key] = client.getStatus();
    }
    return status;
  }

  // Disconnect all clients
  async disconnectAll() {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}

module.exports = { CommercetoolsMCPClient, MCPCredentialManager };
