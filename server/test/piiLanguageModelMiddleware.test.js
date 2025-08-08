const createPIIMiddleware = require("../middleware/piiLanguageModelMiddleware");

describe("PII Language Model Middleware", () => {
  let middleware;

  beforeEach(() => {
    middleware = createPIIMiddleware();
  });

  describe("transformParams", () => {
    test("should redact PII from prompt", async () => {
      const params = {
        prompt: "My name is John Smith and my email is john.smith@example.com",
      };

      const result = await middleware.transformParams({ params });
      expect(result.prompt).toBe("My name is [NAME] and my email is [EMAIL]");
    });

    test("should redact PII from messages", async () => {
      const params = {
        messages: [
          {
            role: "user",
            content: "My phone number is 123-456-7890",
          },
          {
            role: "assistant",
            content: "I'll help you with that.",
          },
        ],
      };

      const result = await middleware.transformParams({ params });
      expect(result.messages[0].content).toBe("My phone number is [PHONE]");
      expect(result.messages[1].content).toBe("I'll help you with that.");
    });

    test("should redact PII from message parts", async () => {
      const params = {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: "My name is John Smith",
              },
              {
                type: "text",
                text: "My email is john.smith@example.com",
              },
            ],
          },
        ],
      };

      const result = await middleware.transformParams({ params });
      expect(result.messages[0].parts[0].text).toBe("My name is [NAME]");
      expect(result.messages[0].parts[1].text).toBe("My email is [EMAIL]");
    });
  });

  describe("wrapGenerate", () => {
    test("should redact PII from generated text", async () => {
      const mockGenerate = async () => ({
        text: "Your SSN is 123-45-6789 and your credit card is 4111-1111-1111-1111",
      });

      const result = await middleware.wrapGenerate({
        doGenerate: mockGenerate,
      });
      expect(result.text).toBe(
        "Your SSN is [SSN] and your credit card is [CREDIT_CARD]"
      );
    });

    test("should redact PII from tool calls", async () => {
      const mockGenerate = async () => ({
        text: "I'll help you with that.",
        toolCalls: [
          {
            toolName: "sendEmail",
            input: {
              to: "john.doe@example.com",
              subject: "Hello John Doe",
              body: "Your phone number is 123-456-7890",
            },
          },
        ],
      });

      const result = await middleware.wrapGenerate({
        doGenerate: mockGenerate,
      });
      expect(result.toolCalls[0].input.to).toBe("[EMAIL]");
      expect(result.toolCalls[0].input.subject).toBe("[NAME]");
      expect(result.toolCalls[0].input.body).toBe(
        "Your phone number is [PHONE]"
      );
    });
  });

  describe("wrapStream", () => {
    test("should redact PII from text deltas", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: "text-delta", delta: "My name is " };
          yield { type: "text-delta", delta: "John Smith" };
          yield { type: "text-delta", delta: " and my email is " };
          yield { type: "text-delta", delta: "john.smith@example.com" };
        },
      };

      const { stream } = await middleware.wrapStream({
        doStream: async () => ({ stream: mockStream }),
      });

      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks[0].delta).toBe("My name is ");
      expect(chunks[1].delta).toBe("[NAME]");
      expect(chunks[2].delta).toBe(" and my email is ");
      expect(chunks[3].delta).toBe("[EMAIL]");
    });

    test("should handle stream errors gracefully", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: "text-delta", delta: "Starting..." };
          throw new Error("Stream error");
        },
      };

      const { stream } = await middleware.wrapStream({
        doStream: async () => ({ stream: mockStream }),
      });

      const reader = stream.getReader();
      const chunks = [];

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } catch (error) {
        expect(error.message).toBe("Stream error");
      }

      expect(chunks[0].delta).toBe("Starting...");
    });

    test("should handle all stream chunk types", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "tool-call",
            toolName: "sendEmail",
            input: { to: "john.doe@example.com" },
          };
          yield {
            type: "tool-call-delta",
            argsTextDelta: '{"email":"john.doe@example.com"}',
          };
          yield {
            type: "tool-result",
            input: { email: "john.doe@example.com" },
            output: { sent: true, to: "john.doe@example.com" },
          };
          yield { type: "text", text: "Email sent to John Smith" };
        },
      };

      const { stream } = await middleware.wrapStream({
        doStream: async () => ({ stream: mockStream }),
      });

      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks[0].input.to).toBe("[EMAIL]");
      expect(chunks[1].argsTextDelta).toBe('{"email":"[EMAIL]"}');
      expect(chunks[2].input.email).toBe("[EMAIL]");
      expect(chunks[2].output.to).toBe("[EMAIL]");
      expect(chunks[3].text).toBe("Email sent to [NAME]");
    });
  });
});
