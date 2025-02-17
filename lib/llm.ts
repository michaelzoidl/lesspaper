import { createLogger } from './logger.ts';
import { DatabaseConnection } from './database.ts';
import { getConfigSetting } from './config.ts';

const logger = createLogger('lib:llm');

interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}

interface LLMResponse {
  text: string;
  error?: string;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class LLM {
  private static instance: LLM;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private provider: string;
  private openaiApiKey: string;
  private deepseekApiKey: string;

  private constructor(config: LLMConfig = {}) {
    this.model = '';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1024;
    this.provider = 'local';
    this.openaiApiKey = '';
    this.deepseekApiKey = '';
  }

  public async init(): Promise<void> {
    const db = await DatabaseConnection.getInstance();
    this.provider = (await getConfigSetting(db, 'llm_provider')) || 'local';
    
    if (this.provider === 'local') {
      const modelPath = await getConfigSetting(db, 'llm_model_path');
      if (!modelPath) {
        throw new Error('No local LLM model configured. Please download a model first.');
      }
      try {
        await Deno.stat(modelPath);
        this.model = modelPath;
      } catch (error) {
        throw new Error(`Configured model not found at ${modelPath}. Please download the model again.`);
      }
    } else if (this.provider === 'openai') {
      this.openaiApiKey = (await getConfigSetting(db, 'openai_api_key')) || '';
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }
    } else if (this.provider === 'deepseek') {
      this.deepseekApiKey = (await getConfigSetting(db, 'deepseek_api_key')) || '';
      if (!this.deepseekApiKey) {
        throw new Error('DeepSeek API key not configured');
      }
    } else {
      throw new Error(`Unknown LLM provider: ${this.provider}`);
    }
  }

  public static async getInstance(config?: LLMConfig): Promise<LLM> {
    if (!LLM.instance) {
      LLM.instance = new LLM(config);
      await LLM.instance.init();
    }
    return LLM.instance;
  }

  /**
   * The method now accepts either a plain prompt string or an array of ChatMessages.
   * For non‑local providers the messages array is sent directly;
   * for the local provider (llama-cli) we convert the messages into a prompt string.
   */
  private async runInference(input: string | ChatMessage[]): Promise<LLMResponse> {
    try {
      logger.info(`Running inference with provider: ${this.provider}`);

      // Prepare both a prompt string and a messages array.
      let promptStr: string;
      let messages: ChatMessage[];

      if (typeof input === 'string') {
        promptStr = input;
        messages = [{ role: 'user', content: input }];
      } else {
        messages = input;
        // For local providers, join messages into a single prompt.
        promptStr = messages
          .map(
            (msg) =>
              `### ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}:\n${msg.content}`
          )
          .join('\n\n');
      }

      if (this.provider === 'local') {
        const command = new Deno.Command('llama-cli', {
          args: [
            '-m', this.model,
            '--temp', this.temperature.toString(),
            '-n', this.maxTokens.toString(),
            '-p', promptStr,
            '--simple-io',  // For better compatibility
            '--no-display-prompt'  // Don't echo the prompt back
          ],
        });

        const { stdout, stderr } = await command.output();
        const output = new TextDecoder().decode(stdout);
        const stderrText = new TextDecoder().decode(stderr);
        
        logger.debug('Raw stdout:', output);
        logger.debug('Raw stderr:', stderrText);
        
        const hasError = stderrText.includes('error:') || stderrText.includes('Error:') || stderrText.includes('fatal:');
        
        if (hasError) {
          logger.error('Local LLM inference error:', stderrText);
          return { text: '', error: stderrText };
        }
        
        const cleanedOutput = output
          .split('\n')
          .filter(line => !line.startsWith('llama_') && !line.startsWith('main:') && !line.startsWith('system_info:'))
          .join('\n')
          .trim();
        
        return { text: cleanedOutput };
      } 
      
      else if (this.provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini', // updated to latest model
            messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens
          })
        });

        if (!response.ok) {
          const error = await response.text();
          logger.error('OpenAI API error:', error);
          return { text: '', error };
        }

        const data = await response.json();
        return { text: data.choices[0].message.content };
      } 
      
      else if (this.provider === 'deepseek') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.deepseekApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens
          })
        });

        if (!response.ok) {
          const error = await response.text();
          logger.error('DeepSeek API error:', error);
          return { text: '', error };
        }

        const data = await response.json();
        return { text: data.choices[0].message.content };
      }

      throw new Error(`Unknown provider: ${this.provider}`);
    } catch (_error) {
      logger.error('Failed to run LLM inference:', _error);
      return {
        text: '',
        error: _error instanceof Error ? _error.message : String(_error),
      };
    }
  }

  /**
   * For OpenAI, we now send a proper conversation as separate system and user messages.
   * For local and deepseek providers, we concatenate the prompts.
   */
  public async generateResponse(systemPrompt: string, userInput: string): Promise<LLMResponse> {
    if (this.provider === 'openai') {
      return this.runInference([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ]);
    }
    const fullPrompt = `### System:\n${systemPrompt}\n\n### User Input:\n${userInput}\n\n### Assistant:`;
    return this.runInference(fullPrompt);
  }
}
