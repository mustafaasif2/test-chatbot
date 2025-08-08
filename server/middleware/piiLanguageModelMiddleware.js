const { redactPII, redactPIIFromObject } = require("../utils/piiFilter");

/**
 * Creates a middleware that redacts PII from language model inputs and outputs
 */
const createPIIMiddleware = () => ({
  /**
   * Transform parameters before they reach the language model
   */
  transformParams: async ({ params }) => {
    // Redact PII from prompt if present
    if (params.prompt) {
      params.prompt = redactPII(params.prompt);
    }

    // Redact PII from messages if present
    if (params.messages) {
      params.messages = params.messages.map((msg) => {
        if (typeof msg.content === "string") {
          return {
            ...msg,
            content: redactPII(msg.content),
          };
        }
        if (Array.isArray(msg.parts)) {
          return {
            ...msg,
            parts: msg.parts.map((part) => {
              if (part.type === "text" && part.text) {
                return {
                  ...part,
                  text: redactPII(part.text),
                };
              }
              return part;
            }),
          };
        }
        return msg;
      });
    }

    return params;
  },

  /**
   * Transform non-streaming responses
   */
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();

    // Redact PII from generated text
    if (result.text) {
      result.text = await redactPII(result.text);
    }

    // Redact PII from tool calls if present
    if (result.toolCalls) {
      result.toolCalls = await Promise.all(
        result.toolCalls.map(async (call) => ({
          ...call,
          input: await redactPIIFromObject(call.input),
        }))
      );
    }

    return result;
  },

  /**
   * Transform streaming responses
   */
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();

    // Create a new async generator to process the stream
    const processedStream = {
      async *[Symbol.asyncIterator]() {
        try {
          for await (const chunk of stream) {
            // Process each chunk based on its type
            switch (chunk.type) {
              case "text-delta": {
                yield {
                  ...chunk,
                  delta: await redactPII(chunk.delta),
                };
                break;
              }
              case "tool-call": {
                yield {
                  ...chunk,
                  input: await redactPIIFromObject(chunk.input),
                };
                break;
              }
              case "tool-call-delta": {
                yield {
                  ...chunk,
                  argsTextDelta: await redactPII(chunk.argsTextDelta),
                };
                break;
              }
              case "text": {
                yield {
                  ...chunk,
                  text: await redactPII(chunk.text),
                };
                break;
              }
              case "tool-result": {
                yield {
                  ...chunk,
                  input: await redactPIIFromObject(chunk.input),
                  output: await redactPIIFromObject(chunk.output),
                };
                break;
              }
              default:
                // Pass through other chunk types unchanged
                yield chunk;
            }
          }
        } catch (error) {
          // Handle any stream processing errors
          yield {
            type: "error",
            error,
            errorText: error.message,
          };
        }
      },
    };

    // Create a ReadableStream from the async generator
    const readableStream = new ReadableStream({
      async start(controller) {
        const iterator = processedStream[Symbol.asyncIterator]();
        try {
          while (true) {
            const { value, done } = await iterator.next();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream: readableStream,
      ...rest,
    };
  },
});

module.exports = createPIIMiddleware;
