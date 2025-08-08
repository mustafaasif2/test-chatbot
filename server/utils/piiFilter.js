const { SyncRedactor } = require("redact-pii");

// Configure redactor with custom patterns and replacements
const redactor = new SyncRedactor({
  replace: function (name) {
    const replacements = {
      emailAddress: "[EMAIL]",
      phoneNumber: "[PHONE]",
      creditCardNumber: "[CREDIT_CARD]",
      usSocialSecurityNumber: "[SSN]",
      ipAddress: "[IP_ADDRESS]",
      url: "[URL]",
      name: "[NAME]",
      streetAddress: "[ADDRESS]",
    };
    return replacements[name] || `[${name.toUpperCase()}]`;
  },
  // Add custom patterns
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
});

/**
 * Redact PII from a string
 * @param {string} text - Text to redact PII from
 * @returns {string} - Text with PII redacted
 */
function redactPII(text) {
  if (typeof text !== "string") {
    return text;
  }

  try {
    return redactor.redact(text);
  } catch (error) {
    console.error("Error redacting PII:", error);
    return text; // Return original text if redaction fails
  }
}

/**
 * Redact PII from an object recursively
 * @param {object} obj - Object to redact PII from
 * @returns {object} - Object with PII redacted
 */
function redactPIIFromObject(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactPIIFromObject(item));
  }

  const redactedObj = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      redactedObj[key] = redactPII(value);
    } else if (typeof value === "object") {
      redactedObj[key] = redactPIIFromObject(value);
    } else {
      redactedObj[key] = value;
    }
  }
  return redactedObj;
}

module.exports = {
  redactPII,
  redactPIIFromObject,
};
