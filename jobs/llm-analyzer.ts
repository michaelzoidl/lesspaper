import { Database } from "jsr:@db/sqlite@0.11";
import { DatabaseConnection } from "../lib/database.ts";
import { createLogger } from "../lib/logger.ts";
import { LLM } from "../lib/llm.ts";
import { getConfigSetting } from "../lib/config.ts";

const logger = createLogger("jobs:llm-analyzer");

interface Document {
  id: number;
  path: string;
  meta: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentMeta {
  text?: string;
  summary?: string;
  llm_tags?: string[];
  title?: string;
  type?: string;
  sender?: string;
  receiver?: string;
  emails?: string[];
  phones?: string[];
  persons?: string[];
  todos?: string[];
  [key: string]: unknown;
}

async function getSystemPrompt(db: Database): Promise<string> {
  const customContext = await db.prepare(
    "SELECT value FROM config WHERE setting = 'llm_custom_context'"
  ).get() as { value: string } | undefined;

  let prompt = `
You are an AI assistant that analyzes OCR document content and extracts relevant information.`;

  if (customContext?.value) {
    prompt += `\n\nAdditional Context: ${customContext.value}`;
  }

  prompt += `\n\nYour tasks are:

1. **Tags:** Identify up to 5 key topics/tags that best describe the content. Each tag must be in the language of the document and formatted with the first letter in uppercase.
2. **Document Type:** Determine the document type (e.g., Contract, Letter, Invoice, etc.) and assign it to a "type" key. The type should be in the language of the document with the first letter in uppercase.
3. **Sender/Receiver:** Extract sender and receiver details.
4. **Contacts & Persons:** Extract any email addresses, phone numbers, and names of persons mentioned.
5. **Additional Properties:** If applicable, extract any extra relevant properties (e.g., addresses, reference numbers).
6. **Date Extraction:** Extract the main date of the document (as "date"). The date may appear in any format; you must detect it and convert it to the format "YYYY-MM-DD".
7. **Title:** Write a short title for the document which matches the content or type (as "title").
8. **Summary:** Generate a brief, neutral summary of the document's content. Maximal 3 sentences. Do not address or greet the receiver; simply provide a succinct description of what the document is about. For example: "Letter about successfully blocking a bank card due to theft."
9. **Todos:** Search the document for any actionable items intended for the receiver. For each todo detected, output an object with the keys description and date. The description should be a short, headline-style summary of the task, and date should be in the format "YYYY-MM-DD". If no target date is found for a todo, set date to null. All the objects should be contained in a list. For example: { description: "do something", date: "2024-02-24" }

**IMPORTANT:** Respond with **ONLY** valid JSON in exactly this format:

json
{
  "title": "Document Title",
  "tags": ["Tag1", "Tag2"],
  "type": "Document Type",
  "sender": "sender details",
  "receiver": "receiver details",
  "emails": ["email1", "email2"],
  "phones": ["phone1", "phone2"],
  "persons": ["person1", "person2"],
  "date": "YYYY-MM-DD",
  "summary": "Document Summary",
  "todos": [{"description": "todo1", "date": "YYYY-MM-DD"}, {"description": "todo2", "date": "YYYY-MM-DD"}]
}

If additional relevant properties are detected, include them as extra keys in the JSON object. Do not include any other text, explanations, or formatting—just the JSON object.`;


  return prompt;
}

// Helper function to clean LLM response and ensure it's valid JSON
function cleanLLMResponse(text: string): string {
  // Find the first '{' and its matching '}'
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in response");
  }

  let depth = 0;
  let end = -1;

  // Parse through the string to find the matching closing brace
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error("No matching closing brace found in response");
  }

  // Extract and parse the JSON object
  const jsonStr = text.substring(start, end + 1);
  try {
    // Validate by parsing and stringifying
    return JSON.stringify(JSON.parse(jsonStr));
  } catch (e: unknown) {
    if (e instanceof Error) {
      throw new Error(`Invalid JSON found in response: ${e.message}`);
    }
    throw new Error('Invalid JSON found in response');
  }
}

async function analyzeSingleDocument(db: Database, doc: Document) {
  try {
    const meta = JSON.parse(doc.meta || "{}") as DocumentMeta;
    const content = doc.content
      ? JSON.parse(doc.content) as Record<string, string>
      : {};

    // Combine all pages into one text for analysis
    const allText = Object.values(content).join(" ");

    if (doc.content === "{}") {
      logger.info(`Content is empty for document ${doc.id}`);
      return {
        llmProcessed: true
      };
    }

    if (!allText) {
      logger.info(`No content found in document ${doc.id}`);
      return null;
    }

    const llm = await LLM.getInstance({
      temperature: 0.7,
      maxTokens: 1024,
    });

    // Truncate content if it's too long
    const maxLength = 4000;
    const truncatedText = allText.length > maxLength
      ? allText.slice(0, maxLength) + "..."
      : allText;

    const systemPrompt = await getSystemPrompt(db);
    const response = await llm.generateResponse(systemPrompt, truncatedText);

    if (response.error) {
      logger.error(`Error analyzing document ${doc.id}:`, response.error);
      return null;
    }

    if (!response.text) {
      logger.error(`Empty response from LLM for document ${doc.id}`);
      return null;
    }

    logger.debug(`Raw LLM response for document ${doc.id}:`, response.text);

    try {
      logger.info("Processing document:", doc.id);
      logger.debug("Raw LLM response:", response.text);

      // Clean and parse the response
      const cleanedResponse = cleanLLMResponse(response.text);
      logger.debug("Cleaned response:", cleanedResponse);

      try {
        const result = JSON.parse(cleanedResponse);
        logger.debug("Parsed result:", result);

        // Validate the response structure
        if (!Array.isArray(result.tags)) {
          throw new Error(
            `Invalid tags structure. Expected array, got: ${typeof result
              .tags}`,
          );
        }
        if (typeof result.type !== "string") {
          throw new Error(
            `Invalid type structure. Expected string, got: ${typeof result
              .type}`,
          );
        }
        if (typeof result.sender !== "string") {
          throw new Error(
            `Invalid sender structure. Expected string, got: ${typeof result
              .sender}`,
          );
        }
        if (typeof result.receiver !== "string") {
          throw new Error(
            `Invalid receiver structure. Expected string, got: ${typeof result
              .receiver}`,
          );
        }
        if (!Array.isArray(result.emails)) {
          throw new Error(
            `Invalid emails structure. Expected array, got: ${typeof result
              .emails}`,
          );
        }
        if (!Array.isArray(result.phones)) {
          throw new Error(
            `Invalid phones structure. Expected array, got: ${typeof result
              .phones}`,
          );
        }
        if (!Array.isArray(result.persons)) {
          throw new Error(
            `Invalid persons structure. Expected array, got: ${typeof result
              .persons}`,
          );
        }
        // if (result.date !== null && typeof result.date !== "string") {
        //   throw new Error(
        //     `Invalid date structure. Expected string or null, got: ${typeof result
        //       .date}`,
        //   );
        // }

        return {
          llm_tags: result.tags || [],
          type: result.type || "",
          title: result.title || "",
          sender: result.sender || "",
          receiver: result.receiver || "",
          emails: result.emails || [],
          phones: result.phones || [],
          persons: result.persons || [],
          date: result.date || undefined,
          summary: result.summary || "",
          todos: result.todos || [],
          llmProcessed: true,
        };
      } catch (parseError) {
        const errorDetails = {
          documentId: doc.id,
          error: parseError instanceof Error
            ? {
              message: parseError.message,
              name: parseError.name,
              stack: parseError.stack,
            }
            : parseError,
          cleanedResponse,
          originalResponse: response.text,
          responseLength: response.text.length,
          firstChars: response.text.substring(0, 100),
          lastChars: response.text.substring(response.text.length - 100),
        };

        logger.error("JSON parsing error details:", errorDetails);

        // Throw a detailed error instead of returning null
        throw new Error(
          `Failed to parse LLM response for document ${doc.id}: ${
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          }`,
        );
      }
    } catch (error) {
      logger.error(`Error processing document ${doc.id}:`, error);
      logger.error("Raw response:", response.text);
      return null;
    }
  } catch (error: unknown) {
    logger.error(
      `Error analyzing document ${doc.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

async function processNewDocuments() {
  const db = await DatabaseConnection.getInstance();
  const stmt = db.prepare(`
    SELECT id, path, meta, content, created_at, updated_at 
    FROM documents 
    WHERE meta IS NULL 
    OR (meta IS NOT NULL AND (
      json_extract(meta, '$.llmProcessed') IS NULL
      OR json_extract(meta, '$.llmProcessed') = false
    ))
    LIMIT 10
  `);

  const rawDocuments = stmt.all() as Record<string, unknown>[];
  const documents: Document[] = rawDocuments.map((raw) => ({
    id: raw.id as number,
    path: raw.path as string,
    meta: raw.meta as string | null,
    content: raw.content as string | null,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  }));
  logger.info(`Found ${documents.length} documents to analyze`);

  for (const doc of documents) {
    try {
      const result = await analyzeSingleDocument(db, doc) || {};

      const meta = JSON.parse(doc.meta || "{}");
      const updatedMeta = {
        date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
        ...meta,
        ...result,
      };

      await db.prepare(
        "UPDATE documents SET meta = ? WHERE id = ?",
      ).run([JSON.stringify(updatedMeta), doc.id]);
      logger.info(`Updated document ${doc.id} with LLM analysis`);
    } catch (error) {
      // Enhanced error logging for document processing
      logger.error("Document processing error details:", {
        error: error instanceof Error
          ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
          }
          : error,
        currentDocument: doc.id,
      });

      // Wrap the error with more context if needed
      if (error instanceof Error) {
        throw new Error(
          `Document processing failed for document ${doc.id}: ${error.message}`,
          { cause: error },
        );
      } else {
        throw new Error(
          `Document processing failed for document ${doc.id} with non-Error: ${
            String(error)
          }`,
        );
      }
    }
  }
}

export async function llmAnalyzer() {
  try {
    const db = await DatabaseConnection.getInstance();
    const llmEnabled = await getConfigSetting(db, "llm_enabled");

    if (llmEnabled !== "true") {
      logger.debug("LLM analysis is disabled in config");
      return;
    }

    logger.info("Starting LLM analyzer job");
    const llm = await LLM.getInstance();
    if (!llm) {
      throw new Error("Failed to initialize LLM instance");
    }
    await processNewDocuments();
    logger.info("Finished LLM analyzer job");
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Error) {
      logger.error("Error in LLM analyzer job:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    } else {
      logger.error("Error in LLM analyzer job (non-Error):", error);
    }
    throw error; // Re-throw so the scheduler knows the job failed
  }
}

// export { llmAnalyzer };
