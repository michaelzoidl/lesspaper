import { join, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { currentConfigFolder } from "./config.ts";
import { createLogger } from "./logger.ts";

const logger = createLogger('lib:binaries');

/**
 * Get the path to a binary from the .lesspaper/bin directory
 */
async function getBinaryPath(binaryName: string): Promise<string> {
  const configDir = await currentConfigFolder();
  const binPath = join(configDir, 'bin', binaryName);

  if (!await exists(binPath)) {
    throw new Error(`Binary ${binaryName} not found in ${binPath}. Please ensure the application is properly initialized.`);
  }

  return binPath;
}

/**
 * Get the path to the ImageMagick binary
 */
export async function getMagickBinary(): Promise<string> {
  return getBinaryPath('magick');
}

/**
 * Get the path to the Tesseract binary
 */
export async function getTesseractBinary(): Promise<string> {
  return getBinaryPath('tesseract');
}
