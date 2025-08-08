const { redactPII, redactPIIFromObject } = require("../utils/piiFilter");

describe("PII Filter Tests", () => {
  describe("redactPII", () => {
    test("should redact email addresses", () => {
      expect(redactPII("My email is john.doe@example.com")).toBe(
        "My email is [EMAIL]"
      );
    });

    test("should redact phone numbers", () => {
      expect(redactPII("Call me at 123-456-7890")).toBe("Call me at [PHONE]");
      expect(redactPII("Call me at +1 (123) 456-7890")).toBe(
        "Call me at [PHONE]"
      );
    });

    test("should redact credit card numbers", () => {
      expect(redactPII("Card: 4111-1111-1111-1111")).toBe(
        "Card: [CREDIT_CARD]"
      );
    });

    test("should redact SSNs", () => {
      expect(redactPII("SSN: 123-45-6789")).toBe("SSN: [SSN]");
    });

    test("should redact IP addresses", () => {
      expect(redactPII("IP: 192.168.1.1")).toBe("IP: [IP_ADDRESS]");
    });

    test("should redact full names but not single names", () => {
      expect(redactPII("My name is John Smith")).toBe("My name is [NAME]");
      expect(redactPII("Just John")).toBe("Just John"); // Single name should not be redacted
      expect(redactPII("The meeting")).toBe("The meeting"); // Common words should not be redacted
    });

    test("should redact addresses", () => {
      expect(redactPII("I live at 123 Main Street, Boston, MA 02108")).toBe(
        "I live at [ADDRESS]"
      );
      expect(redactPII("Visit 456 Park Avenue, New York, NY 10022")).toBe(
        "Visit [ADDRESS]"
      );
      expect(redactPII("Simple street name")).toBe("Simple street name"); // Should not redact non-addresses
    });

    test("should handle non-string input", () => {
      expect(redactPII(null)).toBe(null);
      expect(redactPII(undefined)).toBe(undefined);
      expect(redactPII(123)).toBe(123);
    });
  });

  describe("redactPIIFromObject", () => {
    test("should redact PII in nested objects", () => {
      const input = {
        user: {
          name: "John Smith",
          email: "john.doe@example.com",
          phone: "123-456-7890",
          preferences: {
            newsletter: true,
            contact: "email",
          },
        },
      };

      const expected = {
        user: {
          name: "[NAME]",
          email: "[EMAIL]",
          phone: "[PHONE]",
          preferences: {
            newsletter: true,
            contact: "email",
          },
        },
      };

      expect(redactPIIFromObject(input)).toEqual(expected);
    });

    test("should handle arrays", () => {
      const input = {
        users: [
          { name: "John Smith", email: "john@example.com" },
          { name: "Jane Doe", email: "jane@example.com" },
        ],
      };

      const expected = {
        users: [
          { name: "[NAME]", email: "[EMAIL]" },
          { name: "[NAME]", email: "[EMAIL]" },
        ],
      };

      expect(redactPIIFromObject(input)).toEqual(expected);
    });
  });
});
