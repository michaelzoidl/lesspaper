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
// import { embeddingDocuments } from './jobs/embedding-documents.ts';

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
  // Base document processing pipeline
  scheduler.addJob('scan-documents', scanDocuments, 5000);
  scheduler.addJob('generate-pdf-previews', generatePdfPreviews, 5000, ['scan-documents']);
  scheduler.addJob('ocr-documents', ocrDocuments, 5000, ['generate-pdf-previews']);

  // Analysis pipeline - runs in parallel for each document
  scheduler.addJob('llm-analyzer', llmAnalyzer, 2000); // Faster interval to catch OCR'd documents quickly
  
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