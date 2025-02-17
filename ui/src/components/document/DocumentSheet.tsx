import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { PencilIcon, SaveIcon } from 'lucide-react'
import { Viewer } from '@react-pdf-viewer/core'
import { formatFileSize, formatDate } from '@/utils/format'
import { toast } from '@/components/ui/use-toast'
import { DocumentPreviewCard } from './DocumentPreviewCard'

interface DocumentSheetProps {
  doc: {
    id: number
    path: string
    meta: {
      size: number
      lastModified: string
      date?: string
      type?: string
      sender?: string
      receiver?: string
      emails?: string[]
      phones?: string[]
      persons?: string[]
      llm_tags?: string[]
      llm_summary?: string
    }
  }
  editingDate: number | null
  tempDate: string
  setEditingDate: (id: number | null) => void
  setTempDate: (date: string) => void
  mutate: () => void
  extractFileName: (path: string) => string
}

export const DocumentSheet = memo(({
  doc,
  editingDate,
  tempDate,
  setEditingDate,
  setTempDate,
  mutate,
  extractFileName
}: DocumentSheetProps) => {
  const handleDateUpdate = async () => {
    try {
      const response = await fetch(`/api/document/${doc.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meta: {
            date: tempDate,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update date');
      }

      setEditingDate(null);
      mutate();
      toast({
        title: "Success",
        description: "Date updated successfully",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update date",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <DocumentPreviewCard
          doc={doc}
          extractFileName={extractFileName}
          onClick={() => {}}
        />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="fixed inset-y-0 right-0 h-full w-[500] sm:min-w-[800px] border-l transition-transform duration-300 ease-in-out transform translate-x-full data-[state=open]:translate-x-0"
      >
        <SheetHeader>
          <SheetTitle>{extractFileName(doc.path)}</SheetTitle>
          {doc.meta.llm_tags && doc.meta.llm_tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {doc.meta.llm_tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="py-2 mt-4 font-mono text-xs border-t border-b border-gray-100">
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Size</span>
              <span className="text-gray-900">{formatFileSize(doc.meta.size)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Modified</span>
              <span className="text-gray-900">{formatDate(doc.meta.lastModified).toString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">System-Path</span>
              <div className="w-[300px] flex overflow-hidden">
                <span
                  className="block text-gray-900 whitespace-nowrap hover:animate-marquee"
                  title={doc.path}
                >
                  {doc.path}
                </span>
              </div>
            </div>
            {doc.meta.type && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-900">{doc.meta.type}</span>
              </div>
            )}
            {doc.meta.sender && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Sender</span>
                <div className="w-[300px] flex overflow-hidden">
                  <span className="block text-gray-900 whitespace-nowrap hover:animate-marquee" title={doc.meta.sender}>
                    {doc.meta.sender}
                  </span>
                </div>
              </div>
            )}
            {doc.meta.receiver && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Receiver</span>
                <div className="w-[300px] flex overflow-hidden">
                  <span className="block text-gray-900 whitespace-nowrap hover:animate-marquee" title={doc.meta.receiver}>
                    {doc.meta.receiver}
                  </span>
                </div>
              </div>
            )}
            {doc.meta.emails && doc.meta.emails.length > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Emails</span>
                <div className="w-[300px] flex flex-col items-end">
                  {doc.meta.emails.map((email, i) => (
                    <span key={i} className="text-gray-900">{email}</span>
                  ))}
                </div>
              </div>
            )}
            {doc.meta.phones && doc.meta.phones.length > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Phones</span>
                <div className="w-[300px] flex flex-col items-end">
                  {doc.meta.phones.map((phone, i) => (
                    <span key={i} className="text-gray-900">{phone}</span>
                  ))}
                </div>
              </div>
            )}
            {doc.meta.persons && doc.meta.persons.length > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Persons</span>
                <div className="w-[300px] flex flex-col items-end">
                  {doc.meta.persons.map((person, i) => (
                    <span key={i} className="text-gray-900">{person}</span>
                  ))}
                </div>
              </div>
            )}
            {doc.meta.llm_summary && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Summary</span>
                <span className="text-gray-900 text-right max-w-[500px]">{doc.meta.llm_summary}</span>
              </div>
            )}
            <div className="flex justify-between py-1 group">
              <span className="text-gray-500">Date</span>
              <div className="w-[300px] flex items-center gap-2 justify-end">
                {editingDate === doc.id ? (
                  <>
                    <div className="flex gap-2">
                      <label htmlFor="docDate">Date:</label>
                      <input
                        type="date"
                        id="docDate"
                        value={tempDate}
                        onChange={(e) => setTempDate(e.target.value)}
                        className="h-6 px-2 text-xs border rounded"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 h-6"
                        onClick={handleDateUpdate}
                      >
                        <SaveIcon className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 h-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => {
                        setEditingDate(doc.id);
                        setTempDate(doc.meta.date || '');
                      }}
                    >
                      <PencilIcon className="w-3 h-3" />
                    </Button>
                    <span className="text-gray-900">{doc.meta.date || '-'}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>
        <div className="mt-6">
          <div className="h-[calc(100vh-200px)] bg-gray-50 overflow-hidden">
            <Viewer
              fileUrl={`/api/document/${doc.id}`}
              defaultScale={1}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
