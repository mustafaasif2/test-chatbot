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
const { CommercetoolsMCPClient } = require("./services/mcp-client-new");

// Initialize Google AI client
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// Create model instance
const model = google("gemini-2.0-flash");

// Initialize MCP client for commercetools
const mcpClient = new CommercetoolsMCPClient();
let mcpTools = {};

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Validate API key
if (!process.env.GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY is not set in environment variables");
  process.exit(1);
}

// Tool definitions
const tools = {
  getWeatherInformation: tool({
    description: "Get the current weather information for a specific city",
    inputSchema: z.object({
      city: z.string().describe("The city to get weather for"),
    }),
    outputSchema: z.string(),
    // No execute function - requires human confirmation
  }),

  getLocalTime: tool({
    description: "Get the current local time for a specific location",
    inputSchema: z.object({
      location: z.string().describe("The location to get time for"),
    }),
    outputSchema: z.string(),
    // Has execute function - no confirmation needed
    execute: async ({ location }) => {
      const now = new Date();
      return `The current time in ${location} is ${now.toLocaleTimeString()}`;
    },
  }),

  sendEmail: tool({
    description: "Send an email to a recipient",
    inputSchema: z.object({
      to: z.string().describe("Email recipient"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
    }),
    outputSchema: z.string(),
    // No execute function - requires human confirmation
  }),

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
};

// Function to get all available tools (static + MCP)
function getAllTools() {
  return {
    ...tools,
    ...mcpTools,
  };
}

// Initialize MCP client on server startup
async function initializeMCPClient() {
  try {
    // Only initialize if commercetools credentials are provided
    if (
      process.env.COMMERCETOOLS_CLIENT_ID &&
      process.env.COMMERCETOOLS_CLIENT_SECRET &&
      process.env.COMMERCETOOLS_PROJECT_KEY &&
      process.env.COMMERCETOOLS_AUTH_URL &&
      process.env.COMMERCETOOLS_API_URL
    ) {
      console.log("🔄 Initializing commercetools MCP client...");
      await mcpClient.connect();
      mcpTools = await mcpClient.getTools();
      console.log(
        `✅ MCP client initialized with ${Object.keys(mcpTools).length} tools`
      );
    } else {
      console.log(
        "⚠️  Commercetools MCP not initialized - missing environment variables"
      );
      console.log(
        "   To enable commercetools integration, set these environment variables:"
      );
      console.log("   - COMMERCETOOLS_CLIENT_ID");
      console.log("   - COMMERCETOOLS_CLIENT_SECRET");
      console.log("   - COMMERCETOOLS_PROJECT_KEY");
      console.log("   - COMMERCETOOLS_AUTH_URL");
      console.log("   - COMMERCETOOLS_API_URL");
    }
  } catch (error) {
    console.error("❌ Failed to initialize MCP client:", error);
    console.log(
      "⚠️  Server will continue without commercetools MCP integration"
    );
  }
}

// Approval constants
const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
};

// Add system message configuration
const SYSTEM_MESSAGES = {
  DEFAULT: `You are a helpful AI assistant with access to various tools. You can help users by:
- Getting weather information for cities
- Checking local time in different locations
- Sending emails (with user approval)
- Searching commercetools documentation for development guidance, API references, and implementation help
- Accessing live commercetools APIs for comprehensive e-commerce operations including:
  * Reading and managing products, categories, and product types
  * Managing customer data and customer groups
  * Handling carts, orders, and quotes
  * Working with inventory and pricing
  * Managing discounts and promotions
  * Reading project and store information

When you use commercetools tools:
1. Use the documentation search tool for finding guides, API references, and implementation examples
2. Use the live API tools to access real-time data from a commercetools project
3. Always explain what data you're retrieving and why it's relevant to the user's question
4. If you encounter errors, explain them clearly and suggest alternatives
5. For complex operations, break them down into logical steps

Always be polite and professional in your responses.`,

  SUMMARIZE: `Please provide a brief summary of the conversation so far, focusing on:
- Key topics discussed
- Tools used and their outcomes
- Any important decisions or conclusions reached

End your summary with "Okay."

Okay.`,
};

// Function to ensure system message is properly formatted
const createSystemMessage = (content) => ({
  id: "system-" + Date.now(),
  role: "system",
  parts: [{ type: "text", text: content }],
});

// Function to generate conversation summary
const generateConversationSummary = async (messages) => {
  try {
    // Filter out system messages and tool calls for the summary
    const relevantMessages = messages.filter(
      (m) => m.role !== "system" && m.parts?.some((p) => p.type === "text")
    );

    if (relevantMessages.length === 0) return null;

    // Create a summary prompt
    const summaryMessages = [
      { role: "system", content: SYSTEM_MESSAGES.SUMMARIZE },
      ...relevantMessages.map((m) => ({
        role: m.role,
        content: m.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" "),
      })),
    ];

    // Get summary from the model
    const result = await model.generateText({
      messages: summaryMessages,
      maxTokens: 150,
    });

    return result.text;
  } catch (error) {
    console.error("Failed to generate summary:", error);
    return null;
  }
};

// Utility function to process tool calls requiring human confirmation
async function processToolCalls(messages, writer) {
  console.log("\n🔍 Processing tool calls...");
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.parts) {
    console.log("❌ No message parts found to process");
    return messages;
  }

  console.log(`📝 Processing ${lastMessage.parts.length} message parts`);

  const processedParts = await Promise.all(
    lastMessage.parts.map(async (part, index) => {
      console.log(
        `\n🔄 Processing part ${index + 1}/${lastMessage.parts.length}`
      );

      if (!isToolUIPart(part)) {
        console.log("📜 Regular text part - no tool processing needed");
        return part;
      }

      console.log("Part:", part);

      const toolName = getToolName(part);
      console.log(`🛠️  Tool identified: ${toolName}`);

      // Only process tools that require confirmation and are in output-available state
      if (part.state !== "output-available") {
        console.log(
          `⏳ Tool state is ${part.state} - waiting for confirmation`
        );
        return part;
      }

      let result;

      if (part.output === APPROVAL.YES) {
        console.log("✅ User approved tool execution");
        const inputToUse = part.input;

        // Execute the tool based on tool name
        switch (toolName) {
          case "getWeatherInformation":
            console.log(`🌤️  Getting weather for city: ${inputToUse.city}`);
            const weatherConditions = [
              "sunny",
              "cloudy",
              "rainy",
              "snowy",
              "partly cloudy",
            ];
            const randomWeather =
              weatherConditions[
                Math.floor(Math.random() * weatherConditions.length)
              ];
            result = `The weather in ${
              inputToUse.city
            } is currently ${randomWeather}. Temperature is around ${
              Math.floor(Math.random() * 30) + 10
            }°C.`;
            console.log(`📊 Generated weather result: ${result}`);
            break;

          case "sendEmail":
            console.log(`📧 Sending email to: ${inputToUse.to}`);
            result = `Email sent successfully to ${inputToUse.to} with subject: "${inputToUse.subject}"`;
            console.log(`📨 Email result: ${result}`);
            break;

          default:
            // Check if it's an MCP tool
            if (mcpTools[toolName]) {
              console.log(`🔧 Executing MCP tool: ${toolName}`);
              try {
                result = await mcpClient.callTool(toolName, inputToUse);
                console.log(`✅ MCP tool ${toolName} executed successfully`);
              } catch (error) {
                console.error(`❌ MCP tool ${toolName} failed:`, error);
                result = `Error executing ${toolName}: ${error.message}`;
              }
            } else {
              console.log(`❌ Unknown tool: ${toolName}`);
              result = "Error: Unknown tool";
            }
        }
      } else if (part.output === APPROVAL.NO) {
        console.log("❌ User denied tool execution");
        result = `Error: User denied execution of ${toolName}`;
      } else {
        console.log("⏳ Waiting for user approval/denial");
        return part;
      }

      // Send updated tool result to client
      console.log("📤 Sending tool result to client");
      writer.write({
        type: "tool-output-available",
        toolCallId: part.toolCallId,
        output: result,
      });

      return { ...part, output: result };
    })
  );

  console.log("\n✅ Finished processing all tool calls");
  return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
}

// Text stream endpoint (basic streaming)
app.post("/api/chat/text-stream", async (req, res) => {
  console.log("\n📡 Received text stream request");
  try {
    const { messages } = req.body;
    console.log(`📥 Received ${messages.length} messages`);
    console.log("📝 Last message:", messages[messages.length - 1]);

    console.log("🤖 Initializing text stream with model");
    const allTools = getAllTools();
    const result = streamText({
      model: model,
      messages: convertToModelMessages(messages),
      tools: allTools,
      maxSteps: 5,
    });

    // Set headers for streaming
    console.log("📤 Setting up stream headers");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    console.log("🔄 Starting text stream");
    const stream = result.toTextStream();

    let chunkCount = 0;
    for await (const chunk of stream) {
      chunkCount++;
      console.log(
        `📦 Streaming chunk #${chunkCount}: ${chunk.slice(0, 50)}${
          chunk.length > 50 ? "..." : ""
        }`
      );
      res.write(chunk);
    }

    console.log(`✅ Stream completed - sent ${chunkCount} chunks`);
    res.end();
  } catch (error) {
    console.error("❌ Text stream error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Data stream endpoint (UI message stream with human-in-the-loop)
app.post("/api/chat/data-stream", async (req, res) => {
  console.log("\n📡 Received data stream request");
  try {
    const { messages, includeSummary = false } = req.body;
    console.log("req.body", req.body);
    console.log(`📥 Received ${messages.length} messages`);
    console.log("📝 Last message:", messages[messages.length - 1]);

    // Always ensure system message is present
    let processedMessages = messages;
    const hasSystemMessage = messages.some((m) => m.role === "system");

    if (!hasSystemMessage) {
      processedMessages = [
        createSystemMessage(SYSTEM_MESSAGES.DEFAULT),
        ...messages,
      ];
    }

    // Generate summary if requested and conversation is long enough
    if (includeSummary && messages.length > 5) {
      const summary = await generateConversationSummary(messages);
      if (summary) {
        processedMessages = [
          ...processedMessages,
          createSystemMessage(
            `Summary so far: ${summary}\n\nPlease continue the conversation and remember to end with "Okay."`
          ),
        ];
      }
    }

    // Ensure the system message is included in model messages
    console.log("🔄 Creating UI message stream");
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log("🛠️  Processing pending tool calls");
        const processedWithTools = await processToolCalls(
          processedMessages,
          writer
        );

        // Convert messages for the model, ensuring system message is preserved
        const modelMessages = convertToModelMessages(processedWithTools);
        console.log("🤖 Model messages:", modelMessages);

        console.log("🤖 Initializing stream with model");
        const allTools = getAllTools();
        const result = streamText({
          model: model,
          messages: modelMessages,
          tools: allTools,
          maxSteps: 5,
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

// Track last health status
let lastHealthStatus = "OK";

// Health check endpoint
app.get("/api/health", (req, res) => {
  const currentStatus = {
    status: "OK",
    timestamp: new Date().toISOString(),
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
        `💬 Text stream endpoint: http://localhost:${actualPort}/api/chat/text-stream`
      );
      console.log(
        `🔄 Data stream endpoint: http://localhost:${actualPort}/api/chat/data-stream`
      );

      // Initialize MCP client and then show available tools
      initializeMCPClient().then(() => {
        const allTools = getAllTools();
        console.log(`🛠️  Available tools: ${Object.keys(allTools).join(", ")}`);
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

    // Disconnect MCP client
    await mcpClient.disconnect();
    console.log("✅ MCP client disconnected");

    // Force kill any remaining MCP processes
    const { spawn } = require("child_process");
    spawn("pkill", ["-f", "mcp-essentials"], { stdio: "ignore" });

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
