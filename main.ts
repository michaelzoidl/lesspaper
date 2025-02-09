import { startServer } from './lib/server.ts';
import { currentConfigFolder, getConfigSetting } from './lib/config.ts';
import { createLogger } from './lib/logger.ts';
import { DatabaseConnection } from './lib/database.ts';
import { JobScheduler } from './lib/scheduler.ts';
import { scanDocuments } from './jobs/scan-documents.ts';
import { ocrDocuments } from './jobs/ocr-documents.ts';
import { generatePdfPreviews } from './jobs/generate-previews.ts';
// import { nlpAnalyzer } from './jobs/nlp-analyzer.ts';
import { llmAnalyzer } from './jobs/llm-analyzer.ts';

const logger = createLogger('main');

try {
  // Initialize config folder
  logger.info('Initializing Lesspaper...');
  const configPath = await currentConfigFolder();
  logger.info(`Using config folder: ${configPath}`);

  // Initialize database connection
  logger.info('Initializing database connection...');
  await DatabaseConnection.getInstance();

  // Get database instance and configured port
  const db = await DatabaseConnection.getInstance();
  const portStr = await getConfigSetting(db, 'port');
  const port = portStr ? parseInt(portStr, 10) : 9493;

  // Initialize and start job scheduler
  const scheduler = JobScheduler.getInstance();
  
  // Add jobs with dependencies
  scheduler.addJob('scan-documents', scanDocuments, 5000); // Run every 5 seconds
  scheduler.addJob('generate-pdf-previews', generatePdfPreviews, 15000, ['scan-documents']); // Run after scan-documents
  scheduler.addJob('ocr-documents', ocrDocuments, 10000, ['generate-pdf-previews']); // Run after previews are generated
  // scheduler.addJob('nlp-analyzer', nlpAnalyzer, 5000, ['ocr-documents']); // Run NLP analysis after OCR
  scheduler.addJob('llm-analyzer', llmAnalyzer, 5000, ['ocr-documents']); // Run LLM analysis after OCR
  
  scheduler.start();
  logger.info('Started job scheduler');

  // Start the server on configured port
  await startServer(port);
} catch (error) {
  const errorMessage = error instanceof Error 
    ? error.message 
    : String(error);
    
  if (error instanceof Error) {
    logger.error(`Failed to start Lesspaper: ${errorMessage}`);
  } else {
    logger.error('Failed to start Lesspaper: Unknown error');
  }
  Deno.exit(1);
}