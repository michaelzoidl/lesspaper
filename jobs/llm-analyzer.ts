import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';
import { LLM } from '../lib/llm.ts';
import { getConfigSetting } from '../lib/config.ts';

const logger = createLogger('jobs:llm-analyzer');

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
  llm_tags?: string[];
  type?: string;
  sender?: string;
  receiver?: string;
  emails?: string[];
  phones?: string[];
  persons?: string[];
  [key: string]: unknown;
}

const SYSTEM_PROMPT = `
You are an AI assistant that analyzes document content and extracts relevant information. Your tasks are:

1. Identify up to 5 key topics/tags that best describe the content.
2. Determine the document type (e.g., contract, letter, invoice, etc.) and assign it to a "type" key.
3. Extract sender and receiver details.
4. Extract any email addresses, phone numbers, and names of persons mentioned.
5. If applicable, extract additional relevant properties (e.g., dates, addresses, reference numbers).
6. Extract the main date of the document (as "date"), which will be used to order the document.

**IMPORTANT:** Respond with **ONLY** valid JSON in exactly this format:

json
{
  "tags": ["tag1", "tag2"],
  "type": "document type",
  "sender": "sender details",
  "receiver": "receiver details",
  "emails": ["email1", "email2"],
  "phones": ["phone1", "phone2"],
  "persons": ["person1", "person2"],
  "date": "YYYY-MM-DD"
}


If additional relevant properties are detected, include them as extra keys in the JSON object.

Do not include any other text, explanations, or formatting—just the JSON object.`;

// Helper function to clean LLM response and ensure it's valid JSON
function cleanLLMResponse(text: string): string {
  // Find the first '{' and last '}'
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in response');
  }
  
  // Extract just the JSON part
  return text.slice(start, end + 1);
}

async function analyzeSingleDocument(doc: Document) {
  try {
    const meta = JSON.parse(doc.meta || '{}') as DocumentMeta;
    const content = doc.content ? JSON.parse(doc.content) as Record<string, string> : {};
    
    // Combine all pages into one text for analysis
    const allText = Object.values(content).join(' ');
    
    if (!allText) {
      logger.info(`No content found in document ${doc.id}`);
      return null;
    }

    const llm = await LLM.getInstance({
      temperature: 0.7,
      maxTokens: 1024
    });

    // Truncate content if it's too long
    const maxLength = 4000;
    const truncatedText = allText.length > maxLength 
      ? allText.slice(0, maxLength) + '...'
      : allText;

    const response = await llm.generateResponse(SYSTEM_PROMPT, truncatedText);
    
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
      logger.info('Processing document:', doc.id);
      logger.debug('Raw LLM response:', response.text);

      // Clean and parse the response
      const cleanedResponse = cleanLLMResponse(response.text);
      logger.debug('Cleaned response:', cleanedResponse);

      try {
        const result = JSON.parse(cleanedResponse);
        logger.debug('Parsed result:', result);

        // Validate the response structure
        if (!Array.isArray(result.tags)) {
          throw new Error(`Invalid tags structure. Expected array, got: ${typeof result.tags}`);
        }
        if (typeof result.type !== 'string') {
          throw new Error(`Invalid type structure. Expected string, got: ${typeof result.type}`);
        }
        if (typeof result.sender !== 'string') {
          throw new Error(`Invalid sender structure. Expected string, got: ${typeof result.sender}`);
        }
        if (typeof result.receiver !== 'string') {
          throw new Error(`Invalid receiver structure. Expected string, got: ${typeof result.receiver}`);
        }
        if (!Array.isArray(result.emails)) {
          throw new Error(`Invalid emails structure. Expected array, got: ${typeof result.emails}`);
        }
        if (!Array.isArray(result.phones)) {
          throw new Error(`Invalid phones structure. Expected array, got: ${typeof result.phones}`);
        }
        if (!Array.isArray(result.persons)) {
          throw new Error(`Invalid persons structure. Expected array, got: ${typeof result.persons}`);
        }
        if (typeof result.date !== 'string') {
          throw new Error(`Invalid date structure. Expected string, got: ${typeof result.date}`);
        }

        return {
          llm_tags: result.tags || [],
          type: result.type || '',
          sender: result.sender || '',
          receiver: result.receiver || '',
          emails: result.emails || [],
          phones: result.phones || [],
          persons: result.persons || [],
          date: result.date || ''
        };
      } catch (parseError) {
        const errorDetails = {
          documentId: doc.id,
          error: parseError instanceof Error ? {
            message: parseError.message,
            name: parseError.name,
            stack: parseError.stack
          } : parseError,
          cleanedResponse,
          originalResponse: response.text,
          responseLength: response.text.length,
          firstChars: response.text.substring(0, 100),
          lastChars: response.text.substring(response.text.length - 100)
        };
        
        logger.error('JSON parsing error details:', errorDetails);
        
        // Throw a detailed error instead of returning null
        throw new Error(`Failed to parse LLM response for document ${doc.id}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } catch (error) {
      logger.error(`Error processing document ${doc.id}:`, error);
      logger.error('Raw response:', response.text);
      return null;
    }
  } catch (error: unknown) {
    logger.error(`Error analyzing document ${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function processNewDocuments() {
  const db = await DatabaseConnection.getInstance();
  const stmt = db.prepare(`
    SELECT id, path, meta, content, created_at, updated_at 
    FROM documents 
    WHERE meta IS NULL 
    OR json_extract(meta, '$.llm_tags') IS NULL 
    LIMIT 10
  `);

  const rawDocuments = stmt.all() as Record<string, unknown>[];
  const documents: Document[] = rawDocuments.map(raw => ({
    id: raw.id as number,
    path: raw.path as string,
    meta: raw.meta as string | null,
    content: raw.content as string | null,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string
  }));
  logger.info(`Found ${documents.length} documents to analyze`);

  for (const doc of documents) {
    try {
      const result = await analyzeSingleDocument(doc);
      if (result) {
        const meta = JSON.parse(doc.meta || '{}');
        const updatedMeta = {
          ...meta,
          ...result
        };

        await db.prepare(
          'UPDATE documents SET meta = ? WHERE id = ?'
        ).run([JSON.stringify(updatedMeta), doc.id]);
        logger.info(`Updated document ${doc.id} with LLM analysis`);
      }
    } catch (error) {
      // Enhanced error logging for document processing
      logger.error('Document processing error details:', {
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error,
        currentDocument: doc.id
      });
      
      // Wrap the error with more context if needed
      if (error instanceof Error) {
        throw new Error(`Document processing failed for document ${doc.id}: ${error.message}`, { cause: error });
      } else {
        throw new Error(`Document processing failed for document ${doc.id} with non-Error: ${String(error)}`);
      }
    }
  }
}

export async function llmAnalyzer() {
  try {
    const db = await DatabaseConnection.getInstance();
    const llmEnabled = await getConfigSetting(db, 'llm_enabled');
    
    if (llmEnabled !== 'true') {
      logger.debug('LLM analysis is disabled in config');
      return;
    }

    logger.info('Starting LLM analyzer job');
    const llm = await LLM.getInstance();
    if (!llm) {
      throw new Error('Failed to initialize LLM instance');
    }
    await processNewDocuments();
    logger.info('Finished LLM analyzer job');
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Error) {
      logger.error('Error in LLM analyzer job:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    } else {
      logger.error('Error in LLM analyzer job (non-Error):', error);
    }
    throw error; // Re-throw so the scheduler knows the job failed
  }
}
