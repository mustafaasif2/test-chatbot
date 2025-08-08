const { redactPII, redactPIIFromObject } = require("../utils/piiFilter");

describe("LLM PII Filter Tests", () => {
  describe("LLM Message Content", () => {
    test("should redact PII from user messages", () => {
      const message = {
        role: "user",
        content:
          "Hi, my name is John Smith and my email is john.smith@example.com",
      };

      const redactedMessage = redactPIIFromObject(message);
      expect(redactedMessage.content).toBe(
        "Hi, my name is [NAME] and my email is [EMAIL]"
      );
    });

    test("should redact PII from chat history", () => {
      const messages = [
        {
          role: "user",
          content: "My phone number is 123-456-7890",
        },
        {
          role: "assistant",
          content: "I'll help you with that. Can you also verify your address?",
        },
        {
          role: "user",
          content: "I live at 123 Main Street, Boston, MA 02108",
        },
      ];

      const redactedMessages = redactPIIFromObject(messages);
      expect(redactedMessages[0].content).toBe("My phone number is [PHONE]");
      expect(redactedMessages[1].content).toBe(
        "I'll help you with that. Can you also verify your address?"
      );
      expect(redactedMessages[2].content).toBe("I live at [ADDRESS]");
    });

    test("should handle mixed PII in complex messages", () => {
      const message = {
        role: "user",
        content: `Here's my information:
Name: John Smith
Email: john.smith@example.com
Phone: 123-456-7890
SSN: 123-45-6789
Address: 123 Main Street, Boston, MA 02108
Card: 4111-1111-1111-1111`,
      };

      const redactedMessage = redactPIIFromObject(message);
      expect(redactedMessage.content).toBe(`Here's my information:
Name: [NAME]
Email: [EMAIL]
Phone: [PHONE]
SSN: [SSN]
Address: [ADDRESS]
Card: [CREDIT_CARD]`);
    });
  });

  describe("Technical Content Safety", () => {
    test("should preserve code snippets", () => {
      const messages = [
        {
          role: "user",
          content:
            "Here's my React component:\n```jsx\nfunction UserProfile() {\n  const name = 'user';\n  return <div>{name}</div>;\n}```",
        },
      ];

      const redactedMessages = redactPIIFromObject(messages);
      expect(redactedMessages[0].content).toBe(
        "Here's my React component:\n```jsx\nfunction UserProfile() {\n  const name = 'user';\n  return <div>{name}</div>;\n}```"
      );
    });

    test("should handle database queries", () => {
      const message = {
        role: "user",
        content: "SELECT * FROM users WHERE email = 'test@example.com';",
      };

      const redactedMessage = redactPIIFromObject(message);
      expect(redactedMessage.content).toBe(
        "SELECT * FROM users WHERE email = '[EMAIL]';"
      );
    });
  });

  describe("Edge Cases", () => {
    test("should handle PII in URLs", () => {
      const messages = [
        {
          role: "user",
          content:
            "My profile is at https://example.com/users/john.smith@example.com",
        },
      ];

      const redactedMessages = redactPIIFromObject(messages);
      expect(redactedMessages[0].content).toBe("My profile is at [URL]");
    });

    test("should handle mixed case and special characters", () => {
      const message = {
        role: "user",
        content: "Contact JoHn.SmItH@ExAmPlE.com or John Smith at 123-456-7890",
      };

      const redactedMessage = redactPIIFromObject(message);
      expect(redactedMessage.content).toBe(
        "Contact [EMAIL] or [NAME] at [PHONE]"
      );
    });

    test("should handle multiple instances of same PII type", () => {
      const message = {
        role: "user",
        content: "Email me at john.doe@example.com or jane.doe@example.com",
      };

      const redactedMessage = redactPIIFromObject(message);
      expect(redactedMessage.content).toBe("Email me at [EMAIL] or [EMAIL]");
    });
  });
});
