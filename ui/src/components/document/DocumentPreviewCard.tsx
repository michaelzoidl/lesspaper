import { memo } from 'react'
import { DocumentPreview } from '@/components/DocumentPreview'
import { formatFileSize } from '@/utils/format'
import { ShineBorder } from '@/components/magicui/shine-border'

interface DocumentPreviewCardProps {
  doc: {
    id: number
    path: string
    meta: {
      size: number
      llmProcessed?: boolean
      llm_tags?: string[]
    }
  }
  extractFileName: (path: string) => string
  onClick: () => void
}

export const DocumentPreviewCard = memo(({ doc, extractFileName, onClick }: DocumentPreviewCardProps) => {
  const isProcessing = !doc.meta.llmProcessed && !doc.meta.llm_tags;

  return (
    <div className="relative">
      <div
        className={`absolute inset-0 rounded-lg transition-opacity ${isProcessing ? 'opacity-100' : 'opacity-0'}`}
      >
        <ShineBorder
          borderRadius={8}
          borderWidth={2}
          duration={4}
          color={['#3b82f6', '#10b981']}
        />
      </div>
      <div
        onClick={onClick}
        className="flex-shrink-0 flex flex-col bg-white rounded-lg overflow-hidden shadow-sm ring-1 ring-gray-200 hover:shadow-md transition-all w-full cursor-pointer hover:scale-[1.02] relative z-10"
      >
        <div className="relative aspect-[3/4] bg-gray-50">
          <DocumentPreview
            documentId={doc.id}
            fileName={extractFileName(doc.path)}
          />
        </div>
        <div className="p-4">
          <div className="text-sm font-medium text-gray-900 truncate" title={extractFileName(doc.path)}>
            {extractFileName(doc.path)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {formatFileSize(doc.meta.size)}
          </div>
        </div>
      </div>
    </div>
  );
});
