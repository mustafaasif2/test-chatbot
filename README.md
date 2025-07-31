# AI SDK Streaming and Human-in-the-Loop Demo

This project demonstrates how to implement AI SDK data streaming protocols with human-in-the-loop (HITL) functionality using React and Express. It shows both text streaming and data streaming protocols, along with how to handle tool calls that require human confirmation.

## Features

- **Text Stream Protocol**: Basic text streaming for simple chat interactions
- **Data Stream Protocol**: Advanced streaming with tool calls and human-in-the-loop
- **Human-in-the-Loop**: Confirmation system for sensitive tool operations
- **Real-time Streaming**: Live message streaming with visual indicators
- **Tool Integration**: Weather, time, and email tools with different confirmation requirements
- **Modern UI**: Beautiful, responsive interface with real-time status indicators

## Project Structure

```
test-chatbot/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   ├── index.js       # React entry point
│   │   └── index.css      # Styling
│   └── package.json
├── server/                 # Express backend
│   ├── index.js           # Main server with AI SDK integration
│   └── package.json
├── package.json           # Root package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google API key (with Gemini Pro access)

### Installation

1. **Clone and install dependencies:**

   ```bash
   npm run install-all
   ```

2. **Set up environment variables:**
   Create a `.env` file in the server directory:

   ```bash
   cd server
   echo "GOOGLE_API_KEY=your_google_api_key_here" > .env
   ```

3. **Start the development servers:**
   ```bash
   npm run dev
   ```

This will start:

- Express server on `http://localhost:3001`
- React client on `http://localhost:3000`

## Streaming Protocols Explained

### Text Stream Protocol

The text stream protocol sends plain text chunks that are concatenated to form the complete response. This is useful for simple chat interactions.

**Server Implementation:**

```javascript
app.post("/api/chat/text-stream", async (req, res) => {
  const result = streamText({
    model: google("gemini-pro"),
    messages: convertToModelMessages(messages),
    tools,
  });

  const stream = result.toTextStream();
  for await (const chunk of stream) {
    res.write(chunk);
  }
  res.end();
});
```

**Client Implementation:**

```javascript
const transport = new TextStreamChatTransport({
  api: "/api/chat/text-stream",
});
```

### Data Stream Protocol

The data stream protocol uses Server-Sent Events (SSE) to send structured data including tool calls, reasoning, and other metadata. This enables advanced features like human-in-the-loop.

**Server Implementation:**

```javascript
app.post("/api/chat/data-stream", async (req, res) => {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Process tool calls requiring confirmation
      const processedMessages = await processToolCalls(messages, writer);

      const result = streamText({
        model: google("gemini-pro"),
        messages: convertToModelMessages(processedMessages),
        tools,
      });

      writer.merge(
        result.toUIMessageStream({ originalMessages: processedMessages })
      );
    },
  });

  return createUIMessageStreamResponse(stream);
});
```

**Client Implementation:**

```javascript
const transport = new DefaultChatTransport({
  api: "/api/chat/data-stream",
});
```

## Human-in-the-Loop Implementation

### Tool Definition

Tools that require human confirmation are defined without an `execute` function:

```javascript
const getWeatherInformation = tool({
  description: "Get the current weather information for a specific city",
  inputSchema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  outputSchema: z.string(),
  // No execute function - requires human confirmation
});
```

### Frontend Confirmation UI

When a tool call is made, the frontend renders confirmation buttons:

```javascript
if (isToolUIPart(part) && part.state === "input-available") {
  return (
    <div className="tool-call">
      <div className="tool-call-header">
        {toolName === "getWeatherInformation"
          ? "Weather Request"
          : "Email Request"}
      </div>
      <div className="tool-call-input">
        {JSON.stringify(part.input, null, 2)}
      </div>
      <div className="tool-call-actions">
        <button
          onClick={() => handleToolConfirmation(toolCallId, toolName, true)}
        >
          Confirm
        </button>
        <button
          onClick={() => handleToolConfirmation(toolCallId, toolName, false)}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
```

### Backend Processing

The backend processes confirmation responses and executes or denies the tool:

```javascript
async function processToolCalls(messages, writer) {
  const lastMessage = messages[messages.length - 1];

  const processedParts = await Promise.all(
    lastMessage.parts.map(async (part) => {
      if (!isToolUIPart(part) || part.state !== "output-available") {
        return part;
      }

      let result;
      if (part.output === APPROVAL.YES) {
        // Execute the tool
        result = await executeTool(part.input, getToolName(part));
      } else if (part.output === APPROVAL.NO) {
        result = `Error: User denied execution of ${getToolName(part)}`;
      }

      // Send updated result to client
      writer.write({
        type: "tool-output-available",
        toolCallId: part.toolCallId,
        output: result,
      });

      return { ...part, output: result };
    })
  );

  return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
}
```

## Available Tools

1. **getWeatherInformation** (requires confirmation)

   - Gets weather for a specific city
   - Requires human approval before execution

2. **getLocalTime** (automatic execution)

   - Gets current time for a location
   - Executes automatically without confirmation

3. **sendEmail** (requires confirmation)
   - Sends an email to a recipient
   - Requires human approval before execution

## Example Usage

1. **Text Stream Protocol:**

   - Ask simple questions like "Hello, how are you?"
   - See text streaming in real-time

2. **Data Stream Protocol with HITL:**

   - Ask "What's the weather in New York?"
   - See tool call confirmation UI
   - Confirm or deny the weather request
   - See the result and AI's response

3. **Mixed Tool Usage:**
   - Ask "What time is it in London and what's the weather in Tokyo?"
   - Time tool executes automatically
   - Weather tool requires confirmation

## API Endpoints

- `GET /api/health` - Server health check
- `POST /api/chat/text-stream` - Text streaming endpoint
- `POST /api/chat/data-stream` - Data streaming with HITL endpoint

## Key Concepts Demonstrated

1. **Streaming Protocols**: How to implement both text and data streaming
2. **Tool Integration**: How to define and use AI tools
3. **Human-in-the-Loop**: How to require human confirmation for sensitive operations
4. **Real-time UI**: How to build responsive streaming interfaces
5. **Error Handling**: How to handle tool denials and errors
6. **State Management**: How to manage streaming state and tool call status

## Troubleshooting

1. **Server not connecting**: Check if the Express server is running on port 3001
2. **Google API errors**: Verify your API key is set correctly in the `.env` file
3. **Tool calls not working**: Ensure you're using the Data Stream Protocol for HITL features
4. **Streaming issues**: Check browser console for any CORS or network errors

## Dependencies

### Server

- `express` - Web framework
- `ai` - AI SDK for streaming
- `@ai-sdk/google` - Google Gemini integration
- `zod` - Schema validation
- `cors` - Cross-origin resource sharing

### Client

- `react` - UI framework
- `@ai-sdk/react` - React hooks for AI SDK
- `ai` - AI SDK for client-side streaming
- `lucide-react` - Icons

## License

MIT
