import { createLogger } from './logger.ts';
import { DatabaseConnection } from './database.ts';
import { getConfigSetting } from './config.ts';

const logger = createLogger('lib:llm');

interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMResponse {
  text: string;
  error?: string;
}

export class LLM {
  private static instance: LLM;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  private constructor(config: LLMConfig = {}) {
    // Model path will be set in init()
    this.model = '';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1024;
  }

  public async init(): Promise<void> {
    const db = await DatabaseConnection.getInstance();
    const modelPath = await getConfigSetting(db, 'llm_model_path');
    
    if (!modelPath) {
      throw new Error('No LLM model configured. Please download a model first.');
    }
    
    try {
      await Deno.stat(modelPath);
      this.model = modelPath;
    } catch (error) {
      throw new Error(`Configured model not found at ${modelPath}. Please download the model again.`);
    }
  }

  public static async getInstance(config?: LLMConfig): Promise<LLM> {
    if (!LLM.instance) {
      LLM.instance = new LLM(config);
      await LLM.instance.init();
    }
    return LLM.instance;
  }

  private async runInference(prompt: string): Promise<LLMResponse> {
    try {
      logger.info(`Running inference with model: ${this.model}`);
      const command = new Deno.Command('llama-cli', {
        args: [
          '-m', this.model,
          '--temp', this.temperature.toString(),
          '-n', this.maxTokens.toString(),
          '-p', prompt,
          '--simple-io',  // For better compatibility
          '--no-display-prompt'  // Don't echo the prompt back
        ],
      });

      const { stdout, stderr } = await command.output();
      const output = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);
      
      // Log raw output for debugging
      logger.debug('Raw stdout:', output);
      logger.debug('Raw stderr:', stderrText);
      
      // Check if stderr contains actual error messages (not just initialization logs)
      const hasError = stderrText.includes('error:') || stderrText.includes('Error:') || stderrText.includes('fatal:');
      
      if (hasError) {
        logger.error('LLM inference error:', stderrText);
        return {
          text: '',
          error: stderrText
        };
      }
      
      // Clean the output - remove any model initialization logs that might appear in stdout
      const cleanedOutput = output
        .split('\n')
        .filter(line => !line.startsWith('llama_') && !line.startsWith('main:') && !line.startsWith('system_info:'))
        .join('\n')
        .trim();
      
      return {
        text: cleanedOutput,
        error: undefined
      };
    } catch (_error) {
      logger.error('Failed to run LLM inference:', _error);
      return {
        text: '',
        error: _error instanceof Error ? _error.message : String(_error),
      };
    }
  }

  public async generateResponse(systemPrompt: string, userInput: string): Promise<LLMResponse> {
    const fullPrompt = `### System:\n${systemPrompt}\n\n### User Input:\n${userInput}\n\n### Assistant:`;
    return this.runInference(fullPrompt);
  }
}
