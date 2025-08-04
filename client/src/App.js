import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Send, Wifi, WifiOff, Clock, Cloud, Mail, Book } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// commercetools UIKit imports
import Card from "@commercetools-uikit/card";
import PrimaryButton from "@commercetools-uikit/primary-button";
import SecondaryButton from "@commercetools-uikit/secondary-button";
import TextInput from "@commercetools-uikit/text-input";
import Text from "@commercetools-uikit/text";
import Spacings from "@commercetools-uikit/spacings";
import { CaretDownIcon, CaretUpIcon } from "@commercetools-uikit/icons";

import LoadingSpinner from "@commercetools-uikit/loading-spinner";

const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
};

// Tools that require human confirmation
const TOOLS_REQUIRING_CONFIRMATION = ["getWeatherInformation", "sendEmail"];

// Get API URL from environment or default
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

function App() {
  const [serverStatus, setServerStatus] = useState("connecting");
  const [input, setInput] = useState("");
  const [isExamplesExpanded, setIsExamplesExpanded] = useState(false);
  const messagesEndRef = useRef(null);

  // Use only data stream transport
  const transport = new DefaultChatTransport({
    api: `${API_URL}/api/chat/data-stream`,
  });

  const { messages, sendMessage, addToolResult, isLoading } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getToolIcon = (toolName) => {
    switch (toolName) {
      case "getWeatherInformation":
        return <Cloud size={16} />;
      case "sendEmail":
        return <Mail size={16} />;
      case "getLocalTime":
        return <Clock size={16} />;
      case "commercetoolsDocumentation":
        return <Book size={16} />;
      default:
        return null;
    }
  };

  // Check server status
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/health`);
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
        TOOLS_REQUIRING_CONFIRMATION.includes(getToolName(part)) &&
        !part.output // Only count as pending if no output (not approved/denied yet)
    )
  );

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage({ text: input });
      setInput("");
      // Scroll to bottom immediately after sending
      setTimeout(scrollToBottom, 100);
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
    "How do I work with product variants in commercetools?",
    "Show me commercetools GraphQL setup documentation",
    "What are the cart API endpoints in commercetools?",
  ];

  const getToolDisplayName = (toolName) => {
    switch (toolName) {
      case "getWeatherInformation":
        return "Weather Request";
      case "getLocalTime":
        return "Time Request";
      case "commercetoolsDocumentation":
        return "Commercetools Documentation";
      case "sendEmail":
        return "Email Request";
      default:
        return toolName;
    }
  };

  const renderMessagePart = (part, messageId, partIndex, messageRole) => {
    if (part.type === "text") {
      if (messageRole === "assistant") {
        // Render AI responses with markdown formatting
        return (
          <div key={`${messageId}-${partIndex}`} className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom components for better styling
                p: ({ children }) => (
                  <Text.Detail tone="primary" className="markdown-paragraph">
                    {children}
                  </Text.Detail>
                ),
                ul: ({ children }) => (
                  <ul className="markdown-list">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className="markdown-list-item">
                    <Text.Detail tone="primary">{children}</Text.Detail>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="markdown-bold">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="markdown-italic">{children}</em>
                ),
                code: ({ children }) => (
                  <code className="markdown-inline-code">{children}</code>
                ),
                pre: ({ children }) => (
                  <pre className="markdown-code-block">{children}</pre>
                ),
              }}
            >
              {part.text}
            </ReactMarkdown>
          </div>
        );
      } else {
        // Keep plain text for user messages
        return (
          <Text.Detail
            key={`${messageId}-${partIndex}`}
            tone={messageRole === "user" ? "inverted" : "primary"}
          >
            {part.text}
          </Text.Detail>
        );
      }
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
          <Card key={toolCallId} theme="info" type="raised">
            <Spacings.Stack scale="s">
              <Spacings.Inline scale="xs" alignItems="center">
                {getToolIcon(toolName)}
                <Text.Subheadline as="h4" tone="primary">
                  {getToolDisplayName(toolName)}
                </Text.Subheadline>
              </Spacings.Inline>
              <Text.Caption tone="secondary">
                Requires your confirmation:
              </Text.Caption>
              <Card theme="light" type="flat">
                <Text.Detail>{JSON.stringify(part.input, null, 2)}</Text.Detail>
              </Card>
              <Spacings.Inline scale="s" justifyContent="flex-end">
                <SecondaryButton
                  label="Deny"
                  onClick={() =>
                    handleToolConfirmation(toolCallId, toolName, false)
                  }
                  size="medium"
                  tone="critical"
                />
                <PrimaryButton
                  label="Confirm"
                  onClick={() =>
                    handleToolConfirmation(toolCallId, toolName, true)
                  }
                  size="medium"
                />
              </Spacings.Inline>
            </Spacings.Stack>
          </Card>
        );
      }

      // Render tool result (hidden for documentation tool since AI will summarize)
      if (part.state === "output-available") {
        // Hide documentation tool output since AI will provide summary
        if (toolName === "commercetoolsDocumentation") {
          return (
            <Text.Caption key={toolCallId} tone="secondary">
              📚 Retrieved commercetools documentation
            </Text.Caption>
          );
        }

        return (
          <Card key={toolCallId} theme="light" type="raised">
            <Spacings.Stack scale="xs">
              <Spacings.Inline scale="xs" alignItems="center">
                {getToolIcon(toolName)}
                <Text.Caption tone="secondary">
                  {getToolDisplayName(toolName)}
                </Text.Caption>
              </Spacings.Inline>
              <Text.Detail>{part.output}</Text.Detail>
            </Spacings.Stack>
          </Card>
        );
      }
    }

    return null;
  };

  return (
    <div className="chat-container">
      {/* Header with Server Status and Examples */}
      <Card theme="light" type="raised">
        <Spacings.Stack scale="s">
          <Spacings.Inline
            scale="m"
            justifyContent="space-between"
            alignItems="flex-start"
          >
            <Spacings.Stack scale="xs">
              <Text.Headline as="h1">
                AI Assistant with Commercetools
              </Text.Headline>
            </Spacings.Stack>
            <div className={`status-indicator status-${serverStatus}`}>
              <Spacings.Inline scale="xs" alignItems="center">
                {getStatusIcon()}
                <Text.Detail>{getStatusText()}</Text.Detail>
              </Spacings.Inline>
            </div>
          </Spacings.Inline>

          {/* Collapsible Example Prompts */}
          <Spacings.Stack scale="xs">
            <SecondaryButton
              label={
                <Spacings.Inline scale="xs" alignItems="center">
                  <Text.Caption tone="secondary" className="tiny-text">
                    {isExamplesExpanded ? "Hide examples" : "Show examples"}
                  </Text.Caption>
                  {isExamplesExpanded ? (
                    <CaretUpIcon size="small" />
                  ) : (
                    <CaretDownIcon size="small" />
                  )}
                </Spacings.Inline>
              }
              onClick={() => setIsExamplesExpanded(!isExamplesExpanded)}
              size="small"
              tone="secondary"
            />
            {isExamplesExpanded && (
              <div className="examples-collapse">
                <div className="compact-examples-grid">
                  {examplePrompts.map((prompt, index) => (
                    <SecondaryButton
                      key={index}
                      label={prompt}
                      onClick={() => setInput(prompt)}
                      size="small"
                      tone="secondary"
                    />
                  ))}
                </div>
              </div>
            )}
          </Spacings.Stack>
        </Spacings.Stack>
      </Card>

      {/* Messages */}
      <Card theme="light" type="raised" className="messages-container">
        {messages.length === 0 ? (
          <Spacings.Stack scale="l" alignItems="center">
            <Text.Subheadline as="h2">Start a conversation</Text.Subheadline>
            <Text.Caption tone="secondary">
              Data stream protocol supports human-in-the-loop for tool calls
            </Text.Caption>
          </Spacings.Stack>
        ) : (
          <Spacings.Stack scale="s">
            {messages
              .filter((message) => message.role !== "system")
              .map((message) => (
                <Card
                  key={message.id}
                  theme={message.role === "user" ? "dark" : "light"}
                  type="flat"
                  className={`message-card ${message.role}`}
                >
                  <Spacings.Stack scale="xs">
                    <Spacings.Inline scale="xs" alignItems="center">
                      <Text.Caption
                        tone={
                          message.role === "user" ? "inverted" : "secondary"
                        }
                      >
                        {message.role === "user" ? "You" : "AI Assistant"}
                      </Text.Caption>
                      {isLoading && message.role === "assistant" && (
                        <LoadingSpinner size="s" />
                      )}
                    </Spacings.Inline>
                    <Spacings.Stack scale="xs">
                      {message.parts?.map((part, partIndex) =>
                        renderMessagePart(
                          part,
                          message.id,
                          partIndex,
                          message.role
                        )
                      )}
                    </Spacings.Stack>
                  </Spacings.Stack>
                </Card>
              ))}
            <div ref={messagesEndRef} />
          </Spacings.Stack>
        )}
      </Card>

      {/* Input Form */}
      <Card theme="light" type="raised">
        <Spacings.Stack scale="s">
          <form onSubmit={handleSendMessage} className="input-form">
            <Spacings.Inline scale="s" alignItems="flex-end">
              <div className="input-container">
                <TextInput
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    pendingToolCallConfirmation
                      ? "Please confirm or deny the tool call above..."
                      : "Type your message here..."
                  }
                  isDisabled={
                    isLoading ||
                    pendingToolCallConfirmation ||
                    serverStatus !== "connected"
                  }
                />
              </div>
              <PrimaryButton
                type="submit"
                label={
                  <Spacings.Inline scale="xs" alignItems="center">
                    {isLoading ? (
                      <LoadingSpinner size="s" />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>{isLoading ? "Sending..." : "Send"}</span>
                  </Spacings.Inline>
                }
                isDisabled={
                  isLoading ||
                  pendingToolCallConfirmation ||
                  serverStatus !== "connected" ||
                  !input.trim()
                }
                size="medium"
              />
            </Spacings.Inline>
          </form>
        </Spacings.Stack>
      </Card>
    </div>
  );
}

export default App;
