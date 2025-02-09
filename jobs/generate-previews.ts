import { DatabaseConnection } from '../lib/database.ts';
import { createLogger } from '../lib/logger.ts';
import { join, dirname } from 'https://deno.land/std@0.210.0/path/mod.ts';
import { exists } from 'https://deno.land/std@0.210.0/fs/exists.ts';
import { ensureDir } from 'https://deno.land/std@0.210.0/fs/ensure_dir.ts';
import { PDFDocument } from 'npm:pdf-lib';
import { currentConfigFolder } from '../lib/config.ts';

const MAGICK_BINARY = join(dirname(import.meta.url), '..', 'bin', 'magick').replace('file:', '');

const logger = createLogger('jobs:generate-pdf-previews');

export async function generatePdfPreviews() {
  try {
    const db = await DatabaseConnection.getInstance();
    
    // Get all documents from the database
    const stmt = db.prepare('SELECT * FROM documents ORDER BY id ASC');
    const documents = await stmt.all() as Array<{ id: number; path: string }>;
    stmt.finalize();

    for (const document of documents) {
      try {
        // Get config folder and create previews directory
        const configFolder = await currentConfigFolder();
        const previewsDir = join(configFolder, 'previews', document.id.toString());
        await ensureDir(previewsDir);

        // Read and validate the PDF file
        let pdfBytes: Uint8Array;
        try {
          pdfBytes = await Deno.readFile(document.path);
          if (pdfBytes.length === 0) {
            throw new Error('PDF file is empty');
          }
        } catch (error) {
          // Get detailed error information
          const errorDetails = error instanceof Error ? {
            message: error.message,
            name: error.name,
            stack: error.stack
          } : 'Unknown error';

          logger.error(
            `Could not read PDF file for document ${document.id}:`,
            errorDetails
          );

          // Update document status in database to mark as failed
          try {
            const db = await DatabaseConnection.getInstance();
            await db.prepare(`
              UPDATE documents 
              SET meta = json_set(meta, '$.processingError', ?)
              WHERE id = ?
            `).run([JSON.stringify(errorDetails), document.id]);
          } catch (dbError) {
            logger.error(`Failed to update document status: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
          }

          continue;
        }

        // Load and validate the PDF
        let pdf;
        let pageCount;
        try {
          try {
            // First try without ignoring encryption
            pdf = await PDFDocument.load(pdfBytes);
          } catch (error) {
            // If that fails, try with ignoreEncryption
            logger.info(`Retrying document ${document.id} with ignoreEncryption due to: ${error instanceof Error ? error.message : 'Unknown error'}`);
            pdf = await PDFDocument.load(pdfBytes, { 
              ignoreEncryption: true
            });
          }
          
          pageCount = pdf.getPageCount();
          if (pageCount === 0) {
            throw new Error('PDF has no pages');
          }

          // Try to access first page to verify PDF is readable
          try {
            const firstPage = pdf.getPage(0);
            const { width, height } = firstPage.getSize();
            if (width === 0 || height === 0) {
              throw new Error('Invalid page dimensions');
            }
          } catch (error) {
            throw new Error(`PDF appears corrupted: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }

          logger.info(`Processing document ${document.id} with ${pageCount} pages`);

          // Prepare output paths and check if they exist
          const pagePaths: string[] = [];
          let allPagesExist = true;
          
          // First, create all paths
          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const outputPath = join(previewsDir, `${pageNum}.jpg`);
            pagePaths.push(outputPath);
          }
          
          // Then check if any are missing
          for (const path of pagePaths) {
            if (!(await exists(path))) {
              allPagesExist = false;
              break;
            }
          }

          // If all pages exist, skip this document
          if (allPagesExist) {
            logger.info(`Skipping document ${document.id} - all previews already exist`);
            continue;
          }

          // Process each page
          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const outputPath = pagePaths[pageNum - 1];

            // Double check if file exists (in case it was created by another process)
            if (await exists(outputPath)) {
              logger.info(`Skipping page ${pageNum} for document ${document.id} - already exists`);
              continue;
            }

            // Create a new PDF with just this page
            const singlePagePdf = await PDFDocument.create();
            const [copiedPage] = await singlePagePdf.copyPages(pdf, [pageNum - 1]);
            singlePagePdf.addPage(copiedPage);
            
            // Save the single page PDF to temp folder
            const singlePageBytes = await singlePagePdf.save();
            const tempDir = join(await currentConfigFolder(), 'temp');
            await ensureDir(tempDir);
            const tempPdfPath = join(tempDir, `${document.id}-page-${pageNum}.pdf`);
            await Deno.writeFile(tempPdfPath, singlePageBytes);

            // Use ImageMagick to convert PDF to JPG
            const command = new Deno.Command(MAGICK_BINARY, {
              args: [
                '-density', '150',     // Set DPI for good quality
                '-quality', '90',      // JPG quality
                tempPdfPath,           // Input file (now contains only one page)
                outputPath             // Output file
              ]
            });

            // Wait for conversion to complete
            const { code, stderr } = await command.output();
            
            // Clean up temp file first
            try {
              await Deno.remove(tempPdfPath);
            } catch (error) {
              logger.error(`Failed to clean up temp file ${tempPdfPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            if (code !== 0) {
              const errorMessage = new TextDecoder().decode(stderr);
              throw new Error(`ImageMagick conversion failed: ${errorMessage}`);
            }
            
            logger.info(`Generated preview for document ${document.id} page ${pageNum}`);
          }

          logger.info(`Completed processing document ${document.id}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : '';
          logger.error(`Error processing document ${document.id}: ${errorMessage}`);
          if (errorStack) logger.error(`Stack trace: ${errorStack}`);
          continue; // Continue with next document even if this one fails
        }
      } catch (error) {
        logger.error(
          `Unexpected error processing document ${document.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        continue;
      }
    }

    logger.info('Completed generating PDF previews');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`Error in generatePdfPreviews job: ${errorMessage}`);
    if (errorStack) logger.error(`Stack trace: ${errorStack}`);
  }
}
