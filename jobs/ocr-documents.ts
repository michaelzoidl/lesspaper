import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';
import { join, dirname } from 'https://deno.land/std@0.210.0/path/mod.ts';
import { exists } from 'https://deno.land/std@0.210.0/fs/exists.ts';
import { currentConfigFolder } from '../lib/config.ts';

// Get paths to tesseract binary and training data relative to this file
const TESSERACT_BINARY = join(dirname(import.meta.url), '..', 'bin', 'tesseract').replace('file:', '');
const TESSERACT_TRAINDATA = join(dirname(import.meta.url), '..', 'bin', 'tesseract-traindata').replace('file:', '');

const logger = createLogger('jobs:ocr-documents');

// All languages we have training data for
const SUPPORTED_LANGUAGES = [
  'eng', 'deu', 'fra', 'ita', 'spa', 'por', 'nld', 'pol', 
  'ces', 'slv', 'hun', 'swe', 'fin', 'dan', 'nor'
].join('+');

export async function ocrDocuments() {
  try {
    const db = await DatabaseConnection.getInstance();
    const configFolder = await currentConfigFolder();
    const previewsDir = join(configFolder, 'previews');

    // Check if content column exists in documents table
    const tableInfo = await db.prepare(`PRAGMA table_info(documents)`).all() as Array<{name: string}>;
    if (!tableInfo.some(col => col.name === 'content')) {
      await db.prepare(`ALTER TABLE documents ADD COLUMN content TEXT`).run();
      logger.info('Added content column to documents table');
    }
    
    // Get documents without content
    const documents = await db.prepare(`
      SELECT id 
      FROM documents 
      WHERE content IS NULL 
      OR content = ''
    `).all() as { id: number }[];

    if (documents.length === 0) {
      logger.info('No documents requiring OCR found');
      return;
    }

    logger.info(`Found ${documents.length} documents requiring OCR`);

    for (const document of documents) {
      try {
        const documentPreviewDir = join(previewsDir, document.id.toString());
        
        // Skip if preview directory doesn't exist
        if (!(await exists(documentPreviewDir))) {
          logger.info(`Skipping document ${document.id} - no preview directory`);
          continue;
        }

        logger.info(`Processing document ${document.id}`);
        const pageContents: Record<number, string> = {};

        // Process each page in order
        let pageNum = 1;
        while (true) {
          const imagePath = join(documentPreviewDir, `${pageNum}.jpg`);
          if (!(await exists(imagePath))) {
            break; // No more pages
          }

          // Run OCR on the page
          const command = new Deno.Command(TESSERACT_BINARY, {
            args: [
              imagePath,           // Input file
              'stdout',            // Output to stdout
              '-l', SUPPORTED_LANGUAGES,  // All supported languages
              '--dpi', '150',      // Match the DPI we used for conversion
              '--psm', '1',        // Automatic page segmentation with OSD
              '--tessdata-dir', TESSERACT_TRAINDATA  // Path to training data
            ]
          });

          const { success, stdout } = await command.output();
          if (!success) {
            throw new Error(`Tesseract failed on page ${pageNum}`);
          }

          const pageText = new TextDecoder().decode(stdout).trim();
          if (pageText) { // Only store non-empty pages
            pageContents[pageNum] = pageText;
          }
          
          logger.info(`Completed OCR for document ${document.id} page ${pageNum}`);
          pageNum++;
        }

        // Update database with OCR content as JSON
        const contentJson = JSON.stringify(pageContents);
        await db.prepare(`
          UPDATE documents 
          SET content = ?, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run([contentJson, document.id]);

        logger.info(`Completed OCR for document ${document.id} (${Object.keys(pageContents).length} pages)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        logger.error(`Error processing document ${document.id}: ${errorMessage}`);
        if (errorStack) logger.error(`Stack trace: ${errorStack}`);
        continue;
      }
    }

    logger.info('Completed OCR processing');
  } catch (error: unknown) {
    logger.error(`Error in OCR job: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
