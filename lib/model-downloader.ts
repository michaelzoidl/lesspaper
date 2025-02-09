import { join } from '../deps.ts';
import { createLogger } from './logger.ts';
import { currentConfigFolder } from './config.ts';

const logger = createLogger('lib:model-downloader');

export class ModelDownloader {
  private static instance: ModelDownloader;
  private modelsDir: string;

  private constructor() {
    // Will be initialized in init()
    this.modelsDir = '';
  }

  public static getInstance(): ModelDownloader {
    if (!ModelDownloader.instance) {
      ModelDownloader.instance = new ModelDownloader();
    }
    return ModelDownloader.instance;
  }

  public async init(): Promise<void> {
    const configFolder = await currentConfigFolder();
    this.modelsDir = join(configFolder, 'models');
    
    try {
      await Deno.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
  }

  public async downloadModel(modelUrl: string): Promise<{ success: boolean; error?: string; modelPath?: string }> {
    try {
      if (!modelUrl.includes('huggingface.co')) {
        throw new Error('Only HuggingFace URLs are supported');
      }

      logger.info(`Starting download of model from ${modelUrl}`);
      
      const response = await fetch(modelUrl);
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.statusText}`);
      }

      const contentDisposition = response.headers.get('content-disposition');
      let filename = '';
      
      if (contentDisposition) {
        const matches = /filename="?([^"]+)"?/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      if (!filename) {
        // Extract filename from URL if not in content-disposition
        filename = modelUrl.split('/').pop() || 'model.gguf';
      }

      const modelPath = join(this.modelsDir, filename);
      
      // Check if model already exists
      try {
        await Deno.stat(modelPath);
        return { 
          success: true, 
          modelPath,
          error: 'Model already exists' 
        };
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      // Download and write the model file
      const file = await Deno.open(modelPath, { write: true, create: true });
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await file.write(value);
        totalBytes += value.length;
        logger.info(`Downloaded ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
      }

      file.close();
      logger.info(`Model downloaded successfully to ${modelPath}`);

      return { 
        success: true,
        modelPath
      };
    } catch (error) {
      logger.error('Error downloading model:', error instanceof Error ? error.message : String(error));
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  public async listModels(): Promise<string[]> {
    try {
      const models: string[] = [];
      for await (const entry of Deno.readDir(this.modelsDir)) {
        if (entry.isFile && entry.name.endsWith('.gguf')) {
          models.push(entry.name);
        }
      }
      return models;
    } catch (error) {
      logger.error('Error listing models:', error);
      return [];
    }
  }
}
