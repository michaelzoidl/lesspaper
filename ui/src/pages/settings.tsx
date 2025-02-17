import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Config {
  storage_path?: string
  extensions?: string[]
  port?: string
  'document-sources': string[]
  llm_enabled?: string
  llm_model_path?: string
  llm_provider?: string
  openai_api_key?: string
  deepseek_api_key?: string
  llm_custom_context?: string
}

export default function Settings() {
  const [config, setConfig] = useState<Config>({ 'document-sources': [] })
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config')
        if (!response.ok) throw new Error('Failed to load configuration')
        const configData = await response.json()

        // Transform the array of {setting, value} into a config object
        const configObject = configData.reduce((acc: Config, item: { setting: string, value: string }) => {
          if (item.setting.startsWith('document-source-')) {
            // Collect all document sources into an array
            if (!acc['document-sources']) acc['document-sources'] = []
            acc['document-sources'].push(item.value)
          } else {
            const key = item.setting as keyof Config
            if (key === 'extensions') {
              acc[key] = item.value.split(',')
            } else if (key === 'storage_path' || key === 'port' || key === 'llm_provider' || key === 'llm_custom_context' || key === 'openai_api_key' || key === 'deepseek_api_key' || key === 'llm_enabled' || key === 'llm_model_path') {
              acc[key] = item.value
            }
          }
          return acc
        }, { 'document-sources': [] } as Config)

        setConfig(configObject)
      } catch (err) {
        console.error('Failed to load config:', err)
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load configuration"
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [toast])

  const handleSave = async () => {
    try {
      // Save each config setting individually
      // First, delete all existing document sources
      const existingSources = await fetch('/api/config').then(r => r.json());
      const deletePromises = existingSources
        .filter((item: { setting: string }) => item.setting.startsWith('document-source-'))
        .map((item: { setting: string }) =>
          fetch('/api/config', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setting: item.setting })
          })
        );
      await Promise.all(deletePromises);

      // Then save all settings
      const savePromises = Object.entries(config).map(([setting, value]) => {
        if (setting === 'document-sources') {
          // Save each document source with an indexed key
          return Promise.all(
            (value as string[]).map((sourcePath, index) =>
              fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  setting: `document-source-${index + 1}`, 
                  value: sourcePath 
                })
              }).then(response => {
                if (!response.ok) throw new Error(`Failed to save document source ${sourcePath}`)
              })
            )
          );
        }

        if (value === undefined || value === '') return Promise.resolve();

        return fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setting, value })
        }).then(response => {
          if (!response.ok) throw new Error(`Failed to save ${setting}`)
        })
      });

      await Promise.all(savePromises);

      toast({
        title: "Success",
        description: "Configuration saved successfully"
      })
    } catch (err) {
      console.error('Failed to save config:', err)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save configuration"
      })
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="container py-6 mx-auto">
      <Link
        to="/"
        className="inline-flex gap-2 items-center mb-6 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Manage your Lesspaper configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              value={config.port || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                if (value.length <= 4) {
                  setConfig({ ...config, port: value })
                }
              }}
              placeholder="Enter port (e.g. 9493)"
            />
          </div>

          <div className="space-y-2">
            <Label>Document Sources</Label>
            <div className="space-y-2">
              {config['document-sources']?.map((source, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={source}
                    onChange={(e) => {
                      const newSources = [...config['document-sources']];
                      newSources[index] = e.target.value;
                      setConfig({ ...config, 'document-sources': newSources });
                    }}
                    placeholder="Enter document source path"
                    className="flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const newSources = config['document-sources'].filter((_, i) => i !== index);
                      setConfig({ ...config, 'document-sources': newSources });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => {
                  const newSources = [...(config['document-sources'] || []), ''];
                  setConfig({ ...config, 'document-sources': newSources });
                }}
                className="w-full"
              >
                Add Document Source
              </Button>
            </div>
          </div>

          <div className="pt-6 space-y-4 border-t">
            <div>
              <CardTitle className="mb-2 text-lg">LLM Analysis</CardTitle>
              <CardDescription className="mb-4">
                Enable AI-powered document analysis using a local LLM model
              </CardDescription>
            </div>

            <div className="flex items-center mb-4 space-x-2">
              <input
                type="checkbox"
                id="llm_enabled"
                className="w-4 h-4"
                checked={config.llm_enabled === 'true'}
                onChange={(e) => {
                  const newValue = e.target.checked.toString();
                  setConfig({ ...config, llm_enabled: newValue });
                }}
              />
              <Label htmlFor="llm_enabled">Enable LLM Analysis</Label>
            </div>

            {config.llm_enabled === 'true' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>LLM Provider</Label>
                  <select
                    className="p-2 w-full rounded-md border"
                    value={config.llm_provider || 'local'}
                    onChange={(e) => setConfig({ ...config, llm_provider: e.target.value })}
                  >
                    <option value="local">Local LLM</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                </div>

                {config.llm_provider === 'local' && (
                  <div className="space-y-2">
                    <Label>Local Model Path</Label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="/path/to/llm/model"
                        value={config.llm_model_path || ''}
                        onChange={(e) => setConfig({ ...config, llm_model_path: e.target.value })}
                        className="flex-1"
                      />
                      <Button
                        onClick={async () => {
                          try {
                            const modelUrl = 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf';
                            const response = await fetch('/api/models/download', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ modelUrl })
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to download model');
                            }
                            
                            const result = await response.json();
                            if (result.modelPath) {
                              setConfig(prev => ({ ...prev, llm_model_path: result.modelPath }));
                            }
                            
                            toast({
                              title: "Success",
                              description: "LLM model downloaded successfully"
                            });
                          } catch (error) {
                            console.error('Failed to download model:', error);
                            toast({
                              variant: "destructive",
                              title: "Error",
                              description: "Failed to download LLM model"
                            });
                          }
                        }}
                      >
                        Download Model
                      </Button>
                    </div>
                    {config.llm_model_path && (
                      <div className="text-sm text-gray-500">
                        Model installed at: {config.llm_model_path}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Custom Context</Label>
                  <Textarea
                    placeholder="Add custom context for document analysis (e.g., company name, document handling preferences)"
                    value={config.llm_custom_context || ''}
                    onChange={(e) => setConfig({ ...config, llm_custom_context: e.target.value })}
                    className="min-h-[100px]"
                  />
                  <p className="text-sm text-gray-500">
                    This context will be used to enhance the LLM's understanding of your documents.
                  </p>
                </div>

                {config.llm_provider === 'openai' && (
                  <div className="space-y-2">
                    <Label>OpenAI API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={config.openai_api_key || ''}
                      onChange={(e) => setConfig({ ...config, openai_api_key: e.target.value })}
                    />
                  </div>
                )}

                {config.llm_provider === 'deepseek' && (
                  <div className="space-y-2">
                    <Label>DeepSeek API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={config.deepseek_api_key || ''}
                      onChange={(e) => setConfig({ ...config, deepseek_api_key: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

        <Button onClick={handleSave} className="mt-4">
          Save Changes
        </Button>
      </CardContent>
    </Card>
    </div >
  )
}
