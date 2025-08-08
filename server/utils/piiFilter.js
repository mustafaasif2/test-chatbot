// Configure PII filter with custom patterns and replacements
const customPatterns = {
  patterns: {
    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (various formats)
    phone: /(?:\+\d{1,3}[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g,
    // Credit card numbers
    creditCard: /\b\d{4}[-. ]?\d{4}[-. ]?\d{4}[-. ]?\d{4}\b/g,
    // Social Security Numbers
    ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    // IP addresses
    ip: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    // URLs
    url: /https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,}/g,
    // Names (only match full names)
    name: /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:$|\s|:)/g,
    // Addresses (more specific pattern)
    address:
      /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Place|Pl|Square|Sq|Highway|Hwy|Parkway|Pkwy)(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/g,
  },
  replacements: {
    email: "[EMAIL]",
    phone: "[PHONE]",
    creditCard: "[CREDIT_CARD]",
    ssn: "[SSN]",
    ip: "[IP_ADDRESS]",
    url: "[URL]",
    name: "[NAME]",
    address: "[ADDRESS]",
  },
};

/**
 * Redact PII from a string
 * @param {string} text - Text to redact PII from
 * @returns {string} - Text with PII redacted
 */
function redactPII(text) {
  if (typeof text !== "string") {
    return text;
  }

  let redactedText = text;

  // Apply patterns in specific order (more specific to less specific)
  const orderedPatterns = [
    "address", // Address should be first as it contains names
    "email", // Email often contains names
    "phone", // Phone numbers
    "creditCard", // Credit card numbers
    "ssn", // SSN
    "ip", // IP addresses
    "url", // URLs
    "name", // Names should be last as they're most likely to have false positives
  ];

  // Find all matches and their positions
  const matches = [];
  orderedPatterns.forEach((type) => {
    const pattern = customPatterns.patterns[type];
    pattern.lastIndex = 0; // Reset lastIndex since we're using /g flag
    let match;
    while ((match = pattern.exec(redactedText)) !== null) {
      // Get the whitespace before and after the match
      const preSpace = match[0].match(/^\s+/) || [""];
      const postSpace = match[0].match(/\s+$/) || [""];
      const postColon = match[0].endsWith(":") ? ":" : "";

      matches.push({
        start: match.index + preSpace[0].length,
        end:
          match.index +
          match[0].length -
          postSpace[0].length -
          postColon.length,
        replacement: customPatterns.replacements[type] + postColon,
        original: match[0],
        type,
        preSpace: preSpace[0],
        postSpace: postSpace[0],
      });
    }
  });

  // Sort matches by start position in reverse order (to replace from end to start)
  matches.sort((a, b) => b.start - a.start);

  // Apply replacements
  matches.forEach((match) => {
    redactedText =
      redactedText.slice(0, match.start) +
      match.replacement +
      redactedText.slice(match.end);
  });

  return redactedText;
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
