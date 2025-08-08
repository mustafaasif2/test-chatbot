require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  tool,
  convertToModelMessages,
  isToolUIPart,
  getToolName,
} = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");
const { z } = require("zod");
const {
  CommercetoolsAgentEssentials,
} = require("@commercetools/agent-essentials/ai-sdk");

// Initialize Google AI client
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// Create model instance
const model = google("gemini-2.0-flash");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase payload limit for large responses

// Validate API key
if (!process.env.GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY is not set in environment variables");
  process.exit(1);
}

// Tool definitions
const tools = {
  commercetoolsDocumentation: tool({
    description:
      "Search commercetools documentation for information about APIs, types, endpoints, and guides. Use this when you need specific information about commercetools development, GraphQL schemas, REST APIs, or implementation guidance.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The search query to find relevant documentation (e.g., 'product variants', 'cart API', 'GraphQL setup')"
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 3)"),
      crowding: z
        .number()
        .optional()
        .describe("Maximum number of results per content type (default: 3)"),
      contentTypes: z
        .array(
          z.enum([
            "apiType",
            "apiEndpoint",
            "referenceDocs",
            "guidedDocs",
            "userDocs",
          ])
        )
        .optional()
        .describe("Filter by content types"),
      products: z
        .array(
          z.enum(["Composable Commerce", "Frontend", "Checkout", "Connect"])
        )
        .optional()
        .describe("Filter by commercetools products"),
    }),
    outputSchema: z.string(),
    execute: async ({
      query,
      limit = 3,
      crowding = 3,
      contentTypes,
      products,
    }) => {
      try {
        // Build query parameters
        const params = new URLSearchParams({
          input: query,
          limit: limit.toString(),
          crowding: crowding.toString(),
        });

        // Add content types if specified
        if (contentTypes && contentTypes.length > 0) {
          contentTypes.forEach((type) => params.append("contentTypes", type));
        }

        // Add products if specified
        if (products && products.length > 0) {
          products.forEach((product) => params.append("products", product));
        }

        // Make request to commercetools documentation API
        const response = await fetch(
          `https://docs.commercetools.com/apis/rest/content/similar-content?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        if (!data.similarContent || data.similarContent.length === 0) {
          return `No documentation found for query: "${query}". Try different search terms or broaden your search.`;
        }

        // Format the results concisely for AI to summarize
        let result = `Documentation search results for "${query}":\n\n`;

        data.similarContent.slice(0, 3).forEach((item, index) => {
          result += `${index + 1}. ${item.metadata.title}\n`;
          result += `${item.content.substring(0, 200)}...\n\n`;
        });

        return result;
      } catch (error) {
        return `Error searching commercetools documentation: ${error.message}`;
      }
    },
  }),
  read_cart: tool({
    description: "Read cart information from commercetools",
    inputSchema: z.object({
      cartId: z.string().describe("Cart ID to read"),
    }),
    outputSchema: z.string(),
    execute: async ({ cartId }) => {
      return `Reading cart ${cartId}`;
    },
  }),
  read_products: tool({
    description: "List products from commercetools",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Maximum number of products to return"),
    }),
    outputSchema: z.string(),
    execute: async ({ limit }) => {
      return `Listing products (limit: ${limit || "default"})`;
    },
  }),
  read_customers: tool({
    description: "List customers from commercetools",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Maximum number of customers to return"),
    }),
    outputSchema: z.string(),
    execute: async ({ limit }) => {
      return `Listing customers (limit: ${limit || "default"})`;
    },
  }),
  read_orders: tool({
    description: "List orders from commercetools",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Maximum number of orders to return"),
    }),
    outputSchema: z.string(),
    execute: async ({ limit }) => {
      return `Listing orders (limit: ${limit || "default"})`;
    },
  }),
};

// Function to get all available tools
async function getAllTools(credentials = null) {
  console.log(
    "🔍 getAllTools called with credentials:",
    credentials ? `Project: ${credentials.projectKey}` : "No credentials"
  );

  // If no credentials provided, only return the documentation tool
  if (!credentials) {
    console.log("No credentials provided, returning only documentation tool");
    return {
      commercetoolsDocumentation: tools.commercetoolsDocumentation,
    };
  }

  // Proceed with credentials
  try {
    console.log(
      "🔄 Getting commercetools tools for project:",
      credentials.projectKey
    );

    // Create the agent with credentials
    const agent = new CommercetoolsAgentEssentials({
      authConfig:
        credentials.authType === "client_credentials"
          ? {
              type: "client_credentials",
              clientId: credentials.clientId,
              clientSecret: credentials.clientSecret,
              projectKey: credentials.projectKey,
              authUrl: credentials.authUrl,
              apiUrl: credentials.apiUrl,
            }
          : {
              type: "auth_token",
              accessToken: credentials.accessToken,
              projectKey: credentials.projectKey,
              authUrl: credentials.authUrl,
              apiUrl: credentials.apiUrl,
            },
      configuration: {
        actions: {
          products: { read: true, create: true, update: true },
          cart: { read: true, create: true, update: true },
          project: { read: true },
          customer: { read: true },
          order: { read: true },
          category: { read: true },
          inventory: { read: true },
        },
      },
    });

    // Get the tools from the agent
    const agentTools = agent.getTools();
    console.log("Agent tools:", Object.keys(agentTools));

    // Debug: Log the structure of the first tool
    const firstToolName = Object.keys(agentTools)[0];
    if (firstToolName) {
      console.log("Example tool structure:", {
        name: firstToolName,
        details: agentTools[firstToolName],
      });
    }

    // Transform agent tools to match Gemini's format and remove execute functions
    const transformedTools = Object.entries(agentTools).reduce(
      (acc, [name, agentTool]) => {
        console.log(`Processing tool ${name}:`, agentTool);

        // Create a new tool with Gemini's expected format, but without execute function
        // This forces human-in-the-loop for all commercetools operations
        const toolDefinition = {
          description: agentTool.description || `Execute ${name} operation`,
          inputSchema: z.object({
            ...(agentTool.parameters?._def?.shape() || {}),
            credentials: z.object({
              authType: z.enum(["client_credentials", "auth_token"]),
              projectKey: z.string(),
              authUrl: z.string(),
              apiUrl: z.string(),
              clientId: z.string().optional(),
              clientSecret: z.string().optional(),
              accessToken: z.string().optional(),
            }),
          }),
          outputSchema: z.any(),
        };

        acc[name] = tool(toolDefinition);
        return acc;
      },
      {}
    );

    // Merge our documentation tool with the transformed agent tools
    const toolsWithAgent = {
      commercetoolsDocumentation: tools.commercetoolsDocumentation,
      ...transformedTools,
    };

    return toolsWithAgent;
  } catch (error) {
    console.error(
      "❌ Failed to get commercetools tools for credentials:",
      error
    );
    // Return only documentation tool on error
    return {
      commercetoolsDocumentation: tools.commercetoolsDocumentation,
    };
  }
}

// Approval constants - used for human-in-the-loop functionality
const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
};

// Add system message configuration
const SYSTEM_MESSAGES = {
  DEFAULT: `You are a helpful AI assistant with access to commercetools tools. You can help users by:

1. Searching commercetools documentation for development guidance, API references, and implementation help
2. Accessing live commercetools APIs for comprehensive e-commerce operations including:
   * Reading and managing products, categories, and product types
   * Managing customer data and customer groups
   * Handling carts, orders, and quotes
   * Working with inventory and pricing
   * Managing discounts and promotions
   * Reading project and store information

When using these tools:
1. Use the documentation search tool for finding guides, API references, and implementation examples
2. Use the live API tools to access real-time data from a commercetools project
3. Always explain what data you're retrieving and why it's relevant to the user's question
4. If you encounter errors, explain them clearly and suggest alternatives
5. For complex operations, break them down into logical steps

Always be polite and professional in your responses.`,
};

// Function to ensure system message is properly formatted
const createSystemMessage = (content) => ({
  id: "system-" + Date.now(),
  role: "system",
  parts: [{ type: "text", text: content }],
});

// Utility function to process tool calls requiring human confirmation
async function processToolCalls(messages, writer, commercetoolsCredentials) {
  console.log("\n🔍 Processing tool calls...");
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.parts) {
    console.log("❌ No message parts found to process");
    return messages;
  }

  console.log(`📝 Processing ${lastMessage.parts.length} message parts`);

  const processedParts = await Promise.all(
    lastMessage.parts.map(async (part) => {
      if (!isToolUIPart(part)) {
        return part;
      }

      const toolName = getToolName(part);
      console.log(`🛠️  Tool identified: ${toolName}`);

      // Only process tools that are in output-available state
      if (part.state !== "output-available") {
        console.log(
          `⏳ Tool state is ${part.state} - waiting for confirmation`
        );
        return part;
      }

      let result;

      if (part.output === APPROVAL.YES) {
        console.log("✅ User approved tool execution");
        try {
          // Use credentials from the request, not from the tool input
          const agent = new CommercetoolsAgentEssentials({
            authConfig:
              commercetoolsCredentials.authType === "client_credentials"
                ? {
                    type: "client_credentials",
                    clientId: commercetoolsCredentials.clientId,
                    clientSecret: commercetoolsCredentials.clientSecret,
                    projectKey: commercetoolsCredentials.projectKey,
                    authUrl: commercetoolsCredentials.authUrl,
                    apiUrl: commercetoolsCredentials.apiUrl,
                  }
                : {
                    type: "auth_token",
                    accessToken: commercetoolsCredentials.accessToken,
                    projectKey: commercetoolsCredentials.projectKey,
                    authUrl: commercetoolsCredentials.authUrl,
                    apiUrl: commercetoolsCredentials.apiUrl,
                  },
            configuration: {
              actions: {
                products: { read: true, create: true, update: true },
                cart: { read: true, create: true, update: true },
                project: { read: true },
                customer: { read: true },
                order: { read: true },
                category: { read: true },
                inventory: { read: true },
              },
            },
          });

          const agentTools = agent.getTools();
          const toolToExecute = agentTools[toolName];

          if (toolToExecute && toolToExecute.execute) {
            // Remove credentials from input before executing
            const { credentials, ...inputWithoutCredentials } = part.input;
            result = await toolToExecute.execute(inputWithoutCredentials);
          } else {
            result = `Error: Tool ${toolName} not found or not executable`;
          }
        } catch (error) {
          console.error("❌ Tool execution failed:", error);
          result = `Error executing tool: ${error.message}`;
        }
      } else if (part.output === APPROVAL.NO) {
        console.log("❌ User denied tool execution");
        result = "Error: User denied tool execution";
      } else {
        return part;
      }

      // Forward updated tool result to the client
      writer.write({
        type: "tool-output-available",
        toolCallId: part.toolCallId,
        output: result,
      });

      // Update the message part
      return { ...part, output: result };
    })
  );

  return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
}

// Data stream endpoint (UI message stream with human-in-the-loop)
app.post("/api/chat/data-stream", async (req, res) => {
  console.log("\n📡 Received data stream request");
  try {
    const { messages, commercetoolsCredentials } = req.body;
    console.log("req.body", req.body);
    console.log(`📥 Received ${messages.length} messages`);
    console.log("📝 Last message:", messages[messages.length - 1]);
    console.log(
      "🔐 Commercetools credentials:",
      commercetoolsCredentials
        ? `Project: ${commercetoolsCredentials.projectKey}`
        : "No credentials provided"
    );

    // Always ensure system message is present
    let processedMessages = messages;
    const hasSystemMessage = messages.some((m) => m.role === "system");

    if (!hasSystemMessage) {
      let systemMessage = SYSTEM_MESSAGES.DEFAULT;

      // Enhance system message if commercetools credentials are provided
      if (commercetoolsCredentials) {
        systemMessage += `\n\nIMPORTANT: You are currently connected to commercetools project "${commercetoolsCredentials.projectKey}" and have access to live commercetools tools. You can directly access products, orders, customers, carts, categories, and inventory data for this project. Use these tools to answer questions about the user's commercetools data.`;
      }

      processedMessages = [createSystemMessage(systemMessage), ...messages];
    }

    // Ensure the system message is included in model messages
    console.log("🔄 Creating UI message stream");
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log("🛠️  Processing pending tool calls");
        const processedWithTools = await processToolCalls(
          processedMessages,
          writer,
          commercetoolsCredentials
        );

        // Convert messages for the model, ensuring system message is preserved
        const modelMessages = convertToModelMessages(processedWithTools);
        console.log("🤖 Model messages:", modelMessages);

        console.log("🤖 Initializing stream with model");
        const allTools = await getAllTools(commercetoolsCredentials);
        console.log(
          `🛠️  Total tools available: ${Object.keys(allTools).length}`,
          Object.keys(allTools)
        );
        const result = streamText({
          model: model,
          messages: modelMessages,
          tools: allTools,
          maxSteps: 20,
        });

        console.log("🔄 Merging UI message stream");
        writer.merge(
          result.toUIMessageStream({ originalMessages: processedWithTools })
        );
      },
    });

    // Set headers for SSE streaming
    console.log("📤 Setting up SSE headers");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("x-vercel-ai-ui-message-stream", "v1");

    // Handle the stream
    try {
      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        console.log(`📦 Streaming chunk #${chunkCount}:`, chunk);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      console.log(`✅ Stream completed - sent ${chunkCount} chunks`);
      res.write("data: [DONE]\n\n");
    } catch (error) {
      console.error("❌ Stream processing error:", error);
      res.write("data: [ERROR]\n\n");
    } finally {
      console.log("🔚 Ending stream");
      res.end();
    }
  } catch (error) {
    console.error("❌ Data stream error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Commercetools credential validation endpoint
app.post("/api/commercetools/validate", async (req, res) => {
  console.log("\n📡 Received credential validation request");
  try {
    const { credentials } = req.body;
    console.log("Received credentials:", JSON.stringify(credentials, null, 2));

    if (!credentials) {
      return res.status(400).json({ error: "Credentials are required" });
    }

    try {
      // Validate required fields based on auth type
      const requiredFields = ["projectKey", "authType"];
      if (credentials.authType === "client_credentials") {
        requiredFields.push("clientId", "clientSecret");
      } else if (credentials.authType === "auth_token") {
        requiredFields.push("accessToken");
      } else {
        return res.status(400).json({
          valid: false,
          error:
            "Invalid authentication type. Must be either 'client_credentials' or 'auth_token'",
          errorType: "INVALID_AUTH_TYPE",
        });
      }

      const missingFields = requiredFields.filter(
        (field) => !credentials[field]
      );
      if (missingFields.length > 0) {
        return res.status(400).json({
          valid: false,
          error: `Missing required fields: ${missingFields.join(", ")}`,
          errorType: "MISSING_FIELDS",
        });
      }

      // Try to create an agent instance to validate credentials
      const agent = new CommercetoolsAgentEssentials({
        authConfig:
          credentials.authType === "client_credentials"
            ? {
                type: "client_credentials",
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret,
                projectKey: credentials.projectKey,
                authUrl: credentials.authUrl,
                apiUrl: credentials.apiUrl,
              }
            : {
                type: "auth_token",
                accessToken: credentials.accessToken,
                projectKey: credentials.projectKey,
                authUrl: credentials.authUrl,
                apiUrl: credentials.apiUrl,
              },
        configuration: {
          actions: {
            products: { read: true, create: true, update: true },
            cart: { read: true, create: true, update: true },
            project: { read: true },
            customer: { read: true },
            order: { read: true },
            category: { read: true },
            inventory: { read: true },
          },
        },
      });

      const tools = agent.getTools();
      console.log(
        `✅ Credentials validated for project: ${credentials.projectKey}`
      );
      res.json({
        valid: true,
        projectKey: credentials.projectKey,
        toolCount: Object.keys(tools).length,
        toolNames: Object.keys(tools),
      });
    } catch (error) {
      console.log("❌ Credential validation failed:", error);
      res.status(400).json({
        valid: false,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("❌ Credential validation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Track last health status
let lastHealthStatus = "OK";

// Health check endpoint
app.get("/api/health", (req, res) => {
  const currentStatus = {
    status: "OK",
    timestamp: new Date().toISOString(),
    googleApiStatus: process.env.GOOGLE_API_KEY ? "configured" : "missing",
    environment: process.env.NODE_ENV || "development",
  };

  // Only log if status changes or there's an error
  if (currentStatus.status !== lastHealthStatus) {
    console.log(
      `🔄 Health status changed: ${lastHealthStatus} -> ${currentStatus.status}`
    );
    lastHealthStatus = currentStatus.status;
  }

  res.json(currentStatus);
});

// Start server with port fallback
let server;

function startServer(port) {
  server = app
    .listen(port)
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`⚠️  Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error("❌ Server error:", err);
        process.exit(1);
      }
    })
    .on("listening", () => {
      const actualPort = server.address().port;
      console.log("\n🚀 Server initialization:");
      console.log(`📡 Server running on http://localhost:${actualPort}`);
      console.log(
        `🔄 Data stream endpoint: http://localhost:${actualPort}/api/chat/data-stream`
      );

      // Show available tools at startup
      getAllTools()
        .then((allTools) => {
          console.log(
            `🛠️  Available tools: ${Object.keys(allTools).join(", ")}`
          );
          console.log("\n⌛ Waiting for requests...\n");
          console.log("💡 To stop the server and free ports, press Ctrl+C");
        })
        .catch((error) => {
          console.log(
            "🛠️  Available tools: Static tools only (no commercetools)"
          );
          console.log("\n⌛ Waiting for requests...\n");
          console.log("💡 To stop the server and free ports, press Ctrl+C");
        });
    });
}

// Graceful shutdown handling
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🔄 Received ${signal}. Shutting down server gracefully...`);

  try {
    // Close the HTTP server
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log("✅ HTTP server closed");
          resolve();
        });
      });
    }

    console.log("✅ Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

// Start server with initial port
startServer(PORT);
