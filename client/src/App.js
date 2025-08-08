import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
  Send,
  Wifi,
  WifiOff,
  Clock,
  Cloud,
  Mail,
  Book,
  Settings,
  Check,
  X,
  ShoppingCart,
  Package,
  Building,
  User,
  FileText,
  FolderTree,
  Box,
  Plus,
  Edit,
  RefreshCw as RefreshIcon,
} from "lucide-react";
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
const TOOLS_REQUIRING_CONFIRMATION = [
  "read_cart",
  "create_cart",
  "replicate_cart",
  "update_cart",
  "read_category",
  "read_customer",
  "read_order",
  "read_inventory",
  "list_products",
  "create_product",
  "update_product",
  "read_project",
];

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

const examplePrompts = [
  "List the first 5 products in my catalog",
  "Show me my project settings",
  "Find all products in the 'Electronics' category",
  "Show me the details of my latest order",
  "Check inventory levels for product SKU 'starter-motor'",
  "Create a new cart with 2 items",
  "Show me customer details for a specific customer",
  "List all categories in my project",
];

function App() {
  const [serverStatus, setServerStatus] = useState("connecting");
  const [input, setInput] = useState("");
  const [isExamplesExpanded, setIsExamplesExpanded] = useState(false);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [commercetoolsCredentials, setCommercetoolsCredentials] =
    useState(null);
  const [credentialStatus, setCredentialStatus] = useState("none"); // 'none', 'validating', 'valid', 'invalid'
  const [credentialError, setCredentialError] = useState(null);
  const messagesEndRef = useRef(null);

  // Use ref to always have current credentials
  const credentialsRef = useRef(commercetoolsCredentials);
  credentialsRef.current = commercetoolsCredentials;

  // Create transport that dynamically includes credentials
  const transport = React.useMemo(() => {
    console.log("🔄 Creating transport with dynamic credentials");

    return new DefaultChatTransport({
      api: `${API_URL}/api/chat/data-stream`,
      headers: () => {
        const currentCredentials = credentialsRef.current;
        return {
          "X-Commercetools-Project": currentCredentials?.projectKey || "",
        };
      },
      body: () => {
        const currentCredentials = credentialsRef.current;
        console.log(
          "🔍 Frontend sending credentials:",
          currentCredentials
            ? `Project: ${currentCredentials.projectKey}`
            : "No credentials"
        );
        return {
          commercetoolsCredentials: currentCredentials,
        };
      },
    });
  }, []); // Only create once, but use ref for current credentials

  const { messages, sendMessage, addToolResult, isLoading, setMessages } =
    useChat({
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

  // Validate commercetools credentials
  const validateCredentials = async (credentials) => {
    setCredentialStatus("validating");
    setCredentialError(null);

    try {
      const response = await fetch(`${API_URL}/api/commercetools/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credentials }),
      });

      const result = await response.json();

      if (result.valid) {
        setCredentialStatus("valid");
        setCommercetoolsCredentials(credentials);
        setShowCredentialsForm(false);
        return true;
      } else {
        setCredentialStatus("invalid");

        // Show specific error messages based on error type
        let displayError = result.error;
        switch (result.errorType) {
          case "AUTHENTICATION_ERROR":
            displayError = `🔑 Authentication Failed: ${result.error}`;
            break;
          case "PROJECT_NOT_FOUND":
            displayError = `📁 Project Error: ${result.error}`;
            break;
          case "PERMISSION_ERROR":
            displayError = `🚫 Permission Error: ${result.error}`;
            break;
          case "NETWORK_ERROR":
            displayError = `🌐 Network Error: ${result.error}`;
            break;
          case "MISSING_FIELDS":
            displayError = `📝 Missing Information: ${result.error}`;
            break;
          case "INVALID_URL":
            displayError = `🔗 URL Error: ${result.error}`;
            break;
          default:
            displayError = `❌ Error: ${result.error}`;
        }

        setCredentialError(displayError);
        return false;
      }
    } catch (error) {
      setCredentialStatus("invalid");
      setCredentialError(
        `🌐 Connection Error: Failed to validate credentials - ${error.message}`
      );
      return false;
    }
  };

  // Handle credential form submission
  const handleCredentialsSubmit = async (formData) => {
    const credentials = {
      authType: formData.authType,
      projectKey: formData.projectKey,
      authUrl:
        formData.authUrl || "https://auth.europe-west1.gcp.commercetools.com",
      apiUrl:
        formData.apiUrl || "https://api.europe-west1.gcp.commercetools.com",
    };

    // Add auth type specific fields
    if (formData.authType === "client_credentials") {
      credentials.clientId = formData.clientId;
      credentials.clientSecret = formData.clientSecret;
    } else if (formData.authType === "auth_token") {
      credentials.accessToken = formData.accessToken;
    }

    await validateCredentials(credentials);
  };

  // Clear credentials
  const clearCredentials = () => {
    setCommercetoolsCredentials(null);
    setCredentialStatus("none");
    setCredentialError(null);
  };

  const getToolIcon = (toolName) => {
    switch (toolName) {
      case "read_cart":
        return <ShoppingCart size={16} />;
      case "read_products":
        return <Package size={16} />;
      case "read_project":
        return <Building size={16} />;
      case "read_customer":
        return <User size={16} />;
      case "read_order":
        return <FileText size={16} />;
      case "read_category":
        return <FolderTree size={16} />;
      case "read_inventory":
        return <Box size={16} />;
      case "create_cart":
        return <Plus size={16} />;
      case "create_products":
        return <Plus size={16} />;
      case "update_cart":
        return <Edit size={16} />;
      case "update_products":
        return <Edit size={16} />;
      case "commercetoolsDocumentation":
        return <Book size={16} />;
      default:
        return <Settings size={16} />;
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

  // Credentials Form Component
  const CredentialsForm = () => {
    const [formData, setFormData] = useState({
      authType: "client_credentials",
      clientId: "",
      clientSecret: "",
      accessToken: "",
      projectKey: "",
      authUrl: "https://auth.europe-west1.gcp.commercetools.com",
      apiUrl: "https://api.europe-west1.gcp.commercetools.com",
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      handleCredentialsSubmit(formData);
    };

    const handleChange = (field, value) => {
      setFormData((prev) => {
        const newData = { ...prev, [field]: value };

        // Clear irrelevant fields when auth type changes
        if (field === "authType") {
          if (value === "client_credentials") {
            newData.accessToken = "";
          } else if (value === "auth_token") {
            newData.clientId = "";
            newData.clientSecret = "";
          }
        }

        return newData;
      });
    };

    return (
      <Card theme="light" type="raised">
        <Spacings.Stack scale="m">
          <Spacings.Inline scale="s" alignItems="center">
            <Settings size={20} />
            <Text.Subheadline as="h3">
              Commercetools Credentials
            </Text.Subheadline>
          </Spacings.Inline>

          <form onSubmit={handleSubmit}>
            <Spacings.Stack scale="s">
              <Spacings.Stack scale="xs">
                <Text.Detail>Authentication Type</Text.Detail>
                <Spacings.Inline scale="s">
                  <SecondaryButton
                    label="Client Credentials"
                    onClick={(e) => {
                      e.preventDefault();
                      handleChange("authType", "client_credentials");
                    }}
                    isDisabled={credentialStatus === "validating"}
                    tone={
                      formData.authType === "client_credentials"
                        ? "primary"
                        : "secondary"
                    }
                  />
                  <SecondaryButton
                    label="Access Token"
                    onClick={(e) => {
                      e.preventDefault();
                      handleChange("authType", "auth_token");
                    }}
                    isDisabled={credentialStatus === "validating"}
                    tone={
                      formData.authType === "auth_token"
                        ? "primary"
                        : "secondary"
                    }
                  />
                </Spacings.Inline>
              </Spacings.Stack>

              <TextInput
                name="projectKey"
                placeholder="Project Key"
                value={formData.projectKey}
                onChange={(e) => handleChange("projectKey", e.target.value)}
                isRequired
              />

              {formData.authType === "client_credentials" ? (
                <>
                  <TextInput
                    name="clientId"
                    placeholder="Client ID"
                    value={formData.clientId}
                    onChange={(e) => handleChange("clientId", e.target.value)}
                    isRequired
                  />

                  <TextInput
                    name="clientSecret"
                    placeholder="Client Secret"
                    value={formData.clientSecret}
                    onChange={(e) =>
                      handleChange("clientSecret", e.target.value)
                    }
                    isRequired
                    type="password"
                  />
                </>
              ) : (
                <TextInput
                  name="accessToken"
                  placeholder="Access Token"
                  value={formData.accessToken}
                  onChange={(e) => handleChange("accessToken", e.target.value)}
                  isRequired
                  type="password"
                />
              )}

              <TextInput
                name="authUrl"
                placeholder="Auth URL"
                value={formData.authUrl}
                onChange={(e) => handleChange("authUrl", e.target.value)}
              />

              <TextInput
                name="apiUrl"
                placeholder="API URL"
                value={formData.apiUrl}
                onChange={(e) => handleChange("apiUrl", e.target.value)}
              />

              {credentialError && (
                <Card theme="critical" type="flat">
                  <Spacings.Stack scale="xs">
                    <Text.Detail tone="critical" fontWeight="medium">
                      {credentialError}
                    </Text.Detail>
                    {credentialStatus === "invalid" && (
                      <Text.Caption tone="secondary">
                        Please correct the above issues and try again.
                      </Text.Caption>
                    )}
                  </Spacings.Stack>
                </Card>
              )}

              {credentialStatus === "validating" && (
                <Card theme="info" type="flat">
                  <Spacings.Inline scale="s" alignItems="center">
                    <LoadingSpinner size="s" />
                    <Text.Detail tone="info">
                      Validating credentials...
                    </Text.Detail>
                  </Spacings.Inline>
                </Card>
              )}

              <Spacings.Inline scale="s" alignItems="center">
                <PrimaryButton
                  type="submit"
                  iconLeft={
                    credentialStatus === "validating" ? (
                      <LoadingSpinner size="s" />
                    ) : null
                  }
                  label={
                    credentialStatus === "validating"
                      ? "Validating..."
                      : "Validate & Connect"
                  }
                  isDisabled={
                    credentialStatus === "validating" ||
                    !formData.projectKey ||
                    (formData.authType === "client_credentials" &&
                      (!formData.clientId || !formData.clientSecret)) ||
                    (formData.authType === "auth_token" &&
                      !formData.accessToken)
                  }
                  tone={credentialStatus === "invalid" ? "critical" : "primary"}
                />

                <SecondaryButton
                  label="Cancel"
                  onClick={() => setShowCredentialsForm(false)}
                />
              </Spacings.Inline>
            </Spacings.Stack>
          </form>
        </Spacings.Stack>
      </Card>
    );
  };

  const getToolDisplayName = (toolName) => {
    switch (toolName) {
      case "read_cart":
        return "Read Cart";
      case "read_products":
        return "Read Products";
      case "read_project":
        return "Read Project";
      case "read_customer":
        return "Read Customer";
      case "read_order":
        return "Read Order";
      case "read_category":
        return "Read Category";
      case "read_inventory":
        return "Read Inventory";
      case "create_cart":
        return "Create Cart";
      case "create_products":
        return "Create Products";
      case "update_cart":
        return "Update Cart";
      case "update_products":
        return "Update Products";
      case "commercetoolsDocumentation":
        return "Commercetools Documentation";
      default:
        return toolName
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
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

      // Handle tool output display
      if (part.state === "output-available") {
        try {
          // Try to parse as JSON for better formatting
          const output = JSON.parse(part.output);
          return (
            <Card key={toolCallId} theme="info" type="raised">
              <Spacings.Stack scale="s">
                <Spacings.Inline scale="xs" alignItems="center">
                  {getToolIcon(toolName)}
                  <Text.Subheadline as="h4" tone="primary">
                    {getToolDisplayName(toolName)} Result
                  </Text.Subheadline>
                </Spacings.Inline>
                <div
                  className="markdown-code-block"
                  style={{ maxHeight: "400px", overflow: "auto" }}
                >
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              </Spacings.Stack>
            </Card>
          );
        } catch (e) {
          // If not JSON, display as regular text
          return (
            <Card key={toolCallId} theme="info" type="raised">
              <Spacings.Stack scale="s">
                <Spacings.Inline scale="xs" alignItems="center">
                  {getToolIcon(toolName)}
                  <Text.Subheadline as="h4" tone="primary">
                    {getToolDisplayName(toolName)} Result
                  </Text.Subheadline>
                </Spacings.Inline>
                <Text.Detail tone="primary">{part.output}</Text.Detail>
              </Spacings.Stack>
            </Card>
          );
        }
      }

      // Render confirmation UI for tools requiring human approval
      if (
        TOOLS_REQUIRING_CONFIRMATION.includes(toolName) &&
        part.state === "input-available"
      ) {
        // Extract input without credentials for display
        const { credentials, ...inputWithoutCredentials } = part.input;

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

              {/* Show project info if credentials are present */}
              {credentials && (
                <Card theme="light" type="flat">
                  <Spacings.Stack scale="xs">
                    <Text.Caption tone="secondary">Project:</Text.Caption>
                    <Text.Detail tone="primary">
                      {credentials.projectKey}
                    </Text.Detail>
                  </Spacings.Stack>
                </Card>
              )}

              {/* Show input parameters without credentials */}
              <Card theme="light" type="flat">
                <Spacings.Stack scale="xs">
                  <Text.Caption tone="secondary">Parameters:</Text.Caption>
                  <Text.Detail>
                    {Object.keys(inputWithoutCredentials).length > 0
                      ? JSON.stringify(inputWithoutCredentials, null, 2)
                      : "No additional parameters"}
                  </Text.Detail>
                </Spacings.Stack>
              </Card>

              {/* Warning for write operations */}
              {toolName.startsWith("create_") ||
              toolName.startsWith("update_") ? (
                <Card theme="warning" type="flat">
                  <Spacings.Inline scale="xs" alignItems="center">
                    <Text.Detail tone="warning">
                      ⚠️ This operation will modify data in your project
                    </Text.Detail>
                  </Spacings.Inline>
                </Card>
              ) : null}

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
                  tone={
                    toolName.startsWith("create_") ||
                    toolName.startsWith("update_")
                      ? "warning"
                      : "primary"
                  }
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
              <Text.Detail tone="secondary">
                Powered by Google Gemini with MCP integration
              </Text.Detail>
            </Spacings.Stack>

            <Spacings.Inline scale="s" alignItems="center">
              <div className={`status-indicator status-${serverStatus}`}>
                <Spacings.Inline scale="xs" alignItems="center">
                  {getStatusIcon()}
                  <Text.Detail>{getStatusText()}</Text.Detail>
                </Spacings.Inline>
              </div>

              {/* Commercetools Status & Config */}
              {credentialStatus === "valid" && (
                <div
                  className="status-indicator status-connected"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <Check size={12} />
                  <span>{commercetoolsCredentials?.projectKey}</span>
                </div>
              )}

              {credentialStatus === "invalid" && (
                <div
                  className="status-indicator status-disconnected"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <X size={12} />
                  <span>Invalid Credentials</span>
                </div>
              )}

              <SecondaryButton
                iconLeft={<Settings size={16} />}
                label={credentialStatus === "valid" ? "Change" : "Setup"}
                onClick={() => setShowCredentialsForm(!showCredentialsForm)}
                size="small"
                tone={credentialStatus === "valid" ? "secondary" : "primary"}
              />

              {messages.length > 0 && (
                <SecondaryButton
                  iconLeft={<RefreshIcon size={16} />}
                  label="Restart"
                  onClick={() => {
                    setMessages([]);
                    setInput("");
                  }}
                  size="small"
                  tone="secondary"
                />
              )}
              {credentialStatus === "valid" && (
                <>
                  <SecondaryButton
                    iconLeft={<X size={16} />}
                    label="Clear"
                    onClick={clearCredentials}
                    size="small"
                    tone="critical"
                  />
                </>
              )}
            </Spacings.Inline>
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
                <Spacings.Stack scale="xs">
                  <Text.Caption tone="secondary">Example queries:</Text.Caption>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "4px",
                      width: "100%",
                      maxWidth: "100%",
                      overflow: "hidden",
                      padding: "4px 0",
                    }}
                  >
                    {examplePrompts.map((prompt, index) => (
                      <SecondaryButton
                        key={index}
                        label={
                          <Text.Caption
                            tone="secondary"
                            style={{ fontSize: "10px", lineHeight: "1.1" }}
                          >
                            {prompt}
                          </Text.Caption>
                        }
                        onClick={() => setInput(prompt)}
                        size="small"
                        tone="secondary"
                        style={{
                          padding: "2px 6px",
                          minHeight: "20px",
                          width: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          border: "1px solid var(--border-color-subtle)",
                          background: "var(--surface-quiet)",
                          borderRadius: "4px",
                        }}
                      />
                    ))}
                  </div>
                </Spacings.Stack>
              </div>
            )}
          </Spacings.Stack>
        </Spacings.Stack>
      </Card>

      {/* Credentials Form */}
      {showCredentialsForm && <CredentialsForm />}

      {/* Messages */}
      <Card theme="light" type="raised" className="messages-container">
        {/* Chat Header */}
        {messages.length === 0 ? (
          <Spacings.Stack scale="l" alignItems="center">
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
