import React, { useState, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  TextStreamChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Send, Wifi, WifiOff, Clock, Cloud, Mail } from "lucide-react";

const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
};

// Tools that require human confirmation
const TOOLS_REQUIRING_CONFIRMATION = [
  "getWeatherInformation",
  "sendEmail",
  "getLocalTime",
];

function App() {
  const [protocol, setProtocol] = useState("data-stream"); // 'text-stream' or 'data-stream'
  const [serverStatus, setServerStatus] = useState("connecting");
  const [input, setInput] = useState("");

  // Create transport based on selected protocol
  const transport =
    protocol === "text-stream"
      ? new TextStreamChatTransport({ api: "/api/chat/text-stream" })
      : new DefaultChatTransport({ api: "/api/chat/data-stream" });

  const { messages, sendMessage, addToolResult, isLoading } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const getToolIcon = (toolName) => {
    switch (toolName) {
      case "getWeatherInformation":
        return <Cloud size={16} />;
      case "sendEmail":
        return <Mail size={16} />;
      case "getLocalTime":
        return <Clock size={16} />;
      default:
        return null;
    }
  };

  // Check server status
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch("/api/health");
        if (response.ok) {
          setServerStatus("connected");
        } else {
          setServerStatus("disconnected");
        }
      } catch (error) {
        setServerStatus("disconnected");
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check if there are pending tool calls requiring confirmation
  const pendingToolCallConfirmation = messages.some((m) =>
    m.parts?.some(
      (part) =>
        isToolUIPart(part) &&
        part.state === "input-available" &&
        TOOLS_REQUIRING_CONFIRMATION.includes(getToolName(part))
    )
  );

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleToolConfirmation = async (toolCallId, toolName, approved) => {
    await addToolResult({
      toolCallId,
      tool: toolName,
      output: approved ? APPROVAL.YES : APPROVAL.NO,
    });
    sendMessage();
  };

  const getStatusIcon = () => {
    switch (serverStatus) {
      case "connected":
        return <Wifi size={16} />;
      case "disconnected":
        return <WifiOff size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case "connected":
        return "Server Connected";
      case "disconnected":
        return "Server Disconnected";
      default:
        return "Connecting...";
    }
  };

  const examplePrompts = [
    "What's the weather like in New York?",
    "Get the current time in London",
    "Send an email to john@example.com with subject 'Meeting' and body 'Let's meet tomorrow'",
    "What's the weather in Tokyo and what time is it there?",
  ];

  const renderMessagePart = (part, messageId, partIndex) => {
    if (part.type === "text") {
      return (
        <div key={`${messageId}-${partIndex}`} className="message-content">
          {part.text}
        </div>
      );
    }

    if (isToolUIPart(part)) {
      const toolName = getToolName(part);
      const toolCallId = part.toolCallId;

      // Render confirmation UI for tools requiring human approval
      if (
        TOOLS_REQUIRING_CONFIRMATION.includes(toolName) &&
        part.state === "input-available"
      ) {
        return (
          <div key={toolCallId} className="tool-call">
            <div className="tool-call-header">
              {getToolIcon(toolName)}
              {toolName === "getWeatherInformation"
                ? "Weather Request"
                : toolName === "getLocalTime"
                ? "Time Request"
                : "Email Request"}
            </div>
            <div className="tool-call-input">
              {JSON.stringify(part.input, null, 2)}
            </div>
            <div className="tool-call-actions">
              <button
                className="btn btn-confirm"
                onClick={() =>
                  handleToolConfirmation(toolCallId, toolName, true)
                }
              >
                Confirm
              </button>
              <button
                className="btn btn-deny"
                onClick={() =>
                  handleToolConfirmation(toolCallId, toolName, false)
                }
              >
                Deny
              </button>
            </div>
          </div>
        );
      }

      // Render tool result
      if (part.state === "output-available") {
        return (
          <div key={toolCallId} className="tool-call">
            <div className="tool-call-header">
              {getToolIcon(toolName)}
              {toolName === "getWeatherInformation"
                ? "Weather Result"
                : toolName === "getLocalTime"
                ? "Time Result"
                : "Email Result"}
            </div>
            <div className="tool-call-input">{part.output}</div>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>AI SDK Streaming Demo</h1>
        <p>Experience text streaming and human-in-the-loop with AI tools</p>
      </div>

      {/* Server Status */}
      <div className={`status-indicator status-${serverStatus}`}>
        {getStatusIcon()} {getStatusText()}
      </div>

      {/* Protocol Selector */}
      <div className="protocol-selector">
        <button
          className={`protocol-btn ${
            protocol === "text-stream" ? "active" : ""
          }`}
          onClick={() => setProtocol("text-stream")}
        >
          Text Stream Protocol
        </button>
        <button
          className={`protocol-btn ${
            protocol === "data-stream" ? "active" : ""
          }`}
          onClick={() => setProtocol("data-stream")}
        >
          Data Stream Protocol (HITL)
        </button>
      </div>

      {/* Example Prompts */}
      <div className="example-prompts">
        <h3>Try these examples:</h3>
        <div className="prompt-suggestions">
          {examplePrompts.map((prompt, index) => (
            <button
              key={index}
              className="prompt-btn"
              onClick={() => setInput(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div
            style={{ textAlign: "center", color: "#6c757d", padding: "40px" }}
          >
            <p>Start a conversation to see the streaming in action!</p>
            <p style={{ fontSize: "0.9rem", marginTop: "10px" }}>
              {protocol === "data-stream"
                ? "Data stream protocol supports human-in-the-loop for tool calls"
                : "Text stream protocol shows basic text streaming"}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-role">
                {message.role === "user" ? "You" : "AI"}
                {isLoading && message.role === "assistant" && (
                  <span className="streaming-indicator"></span>
                )}
              </div>
              {message.parts?.map((part, partIndex) =>
                renderMessagePart(part, message.id, partIndex)
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Form */}
      <div className="input-container">
        <form onSubmit={handleSendMessage} className="input-form">
          <input
            type="text"
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              pendingToolCallConfirmation
                ? "Please confirm or deny the tool call above..."
                : "Type your message here..."
            }
            disabled={
              isLoading ||
              pendingToolCallConfirmation ||
              serverStatus !== "connected"
            }
          />
          <button
            type="submit"
            className="send-button"
            disabled={
              isLoading ||
              pendingToolCallConfirmation ||
              serverStatus !== "connected" ||
              !input.trim()
            }
          >
            <Send size={18} />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
