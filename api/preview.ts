import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { join, dirname } from "https://deno.land/std@0.210.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.210.0/fs/exists.ts";
import { ensureDir } from "https://deno.land/std@0.210.0/fs/ensure_dir.ts";
import { currentConfigFolder } from '../lib/config.ts';
import { createLogger } from '../lib/logger.ts';

// Get the path to the magick binary relative to this file
const MAGICK_BINARY = join(dirname(import.meta.url), '..', 'bin', 'magick').replace('file:', '');

const logger = createLogger('api:preview');
const router = new Router();

router.get("/api/preview/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Document ID is required" };
      return;
    }

    // Get the preview image path
    const configFolder = await currentConfigFolder();
    const previewPath = join(configFolder, 'previews', id, '1.jpg');

    // Check if the preview exists
    if (!(await exists(previewPath))) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Preview not found" };
      return;
    }

    // Create a temp directory for resized images
    const tempDir = join(await currentConfigFolder(), 'temp');
    await ensureDir(tempDir);
    const resizedPath = join(tempDir, `preview-${id}-200px.jpg`);

    // Use ImageMagick to resize the image
    const command = new Deno.Command(MAGICK_BINARY, {
      args: [
        previewPath,        // Input file
        '-resize', '250x',  // Resize to 200px width, maintain aspect ratio
        '-quality', '100',   // Good quality
        resizedPath         // Output file
      ]
    });

    const { code, stderr } = await command.output();
    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`ImageMagick resize failed: ${error}`);
    }

    // Read the resized image
    const imageBytes = await Deno.readFile(resizedPath);

    // Clean up the temp file
    try {
      await Deno.remove(resizedPath);
    } catch (error) {
      logger.error(`Failed to clean up temp file ${resizedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Set appropriate headers
    ctx.response.headers.set("Content-Type", "image/jpeg");
    ctx.response.headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    ctx.response.body = imageBytes;
  } catch (error) {
    logger.error("Error serving preview:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

export default router;
