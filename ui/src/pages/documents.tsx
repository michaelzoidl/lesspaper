import useSWR from 'swr'
import { useState, memo } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Settings, Loader2, TerminalSquare } from 'lucide-react'
import { DocumentPreview } from '@/components/DocumentPreview'
import { Link } from 'react-router-dom'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Viewer, Plugin } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'

// Import styles
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'

import { Skeleton } from '@/components/ui/skeleton'

interface DocumentData {
  id: number;
  path: string;
  meta: {
    size: number;
    lastModified: string;
    date?: string;
    type?: string;
    sender?: string;
    receiver?: string;
    emails?: string[];
    phones?: string[];
    persons?: string[];
    llm_tags?: string[];
    llm_summary?: string;
  };
  created_at: string;
  updated_at: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

type FormattedDate = string | { month: string; year: string };

function formatDate(dateString: string, format: 'full' | 'monthYear' = 'full'): FormattedDate {
  const date = new Date(dateString);
  if (format === 'monthYear') {
    return {
      month: date.toLocaleString('en-US', { month: 'long' }),
      year: date.getFullYear().toString()
    };
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

type GroupedDocuments = {
  [key: string]: {
    year: string;
    month: string;
    documents: DocumentData[];
  };
};

function groupDocumentsByDate(documents: DocumentData[]): GroupedDocuments {
  const grouped = documents.reduce((acc: GroupedDocuments, doc) => {
    if (!doc.meta?.date) {
      const key = 'processing';
      if (!acc[key]) {
        acc[key] = {
          year: '',
          month: 'Processing',
          documents: []
        };
      }
      acc[key].documents.push(doc);
      return acc;
    }

    const formatted = formatDate(doc.meta.date, 'monthYear') as { month: string; year: string };
    const { month, year } = formatted;
    const key = `${year}-${month}`;

    if (!acc[key]) {
      acc[key] = {
        year,
        month,
        documents: []
      };
    }

    acc[key].documents.push(doc);
    return acc;
  }, {});
  
  return grouped;
}

function formatFileSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

function extractFileName(filePath: string) {
  return filePath.split('/').pop() || filePath
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

const SearchBar = memo(({ value, onChange }: SearchBarProps) => (
  <div className="flex items-center gap-4">
    <div className="relative w-full max-w-sm">
      <Search className="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-3 top-1/2" />
      <Input
        type="text"
        placeholder="Suche"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-gray-200 pl-9 focus:border-gray-400 focus:ring-gray-400"
      />
    </div>
    <Link 
      to="/logs" 
      className="p-2 rounded-md hover:bg-gray-100 transition-colors"
      title="Logs"
    >
      <TerminalSquare className="w-5 h-5 text-gray-600" />
    </Link>
    <Link 
      to="/settings" 
      className="p-2 rounded-md hover:bg-gray-100 transition-colors"
      title="Settings"
    >
      <Settings className="w-5 h-5 text-gray-600" />
    </Link>
  </div>
))

interface DocumentGridProps {
  searchQuery: string;
  pdfPlugins: Plugin[];
}

const DocumentGrid = memo(({ searchQuery, pdfPlugins }: DocumentGridProps) => {
  const endpoint = searchQuery 
    ? `/api/documents?search=${encodeURIComponent(searchQuery)}` 
    : '/api/documents'
  const { data, error } = useSWR<DocumentData[]>(endpoint, fetcher, { refreshInterval: searchQuery ? 0 : 1000 })

  if (error) return <div>Failed to load documents</div>
  if (!data) return <div>Loading...</div>

  // Filter only PDF files based on the file extension in the path.
  const documents = data.filter(doc => doc.path.toLowerCase().endsWith('.pdf'))

  // Group documents by date
  const groupedDocs = groupDocumentsByDate(documents);
  
  // Sort groups by date (newest first), with processing group always at the top
  const sortedGroups = Object.entries(groupedDocs)
    .sort(([keyA], [keyB]) => {
      if (keyA === 'processing') return -1;
      if (keyB === 'processing') return 1;
      return keyB.localeCompare(keyA);
    });

  return (
    <div className="space-y-12 px-4">
      {sortedGroups.map(([key, group]) => (
        <div key={key} className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">
            {key === 'processing' ? (
              <span className="flex items-center gap-2">
                {group.month}
                <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
              </span>
            ) : (
              <>
                {group.month} <span className="text-gray-400 font-normal">{group.year}</span>
              </>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {group.documents.map(doc => (
              <Sheet key={doc.id}>
          <SheetTrigger asChild>
            <div
              className="flex-shrink-0 flex flex-col bg-white rounded-lg overflow-hidden shadow-sm ring-1 ring-gray-200 hover:shadow-md transition-all w-full cursor-pointer hover:scale-[1.02]"
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
          </SheetTrigger>
          <SheetContent
            side="right"
            className="fixed inset-y-0 right-0 h-full w-[500] sm:min-w-[800px] border-l transition-transform duration-300 ease-in-out transform translate-x-full data-[state=open]:translate-x-0"
          >
            <SheetHeader>
              <SheetTitle>{extractFileName(doc.path)}</SheetTitle>
              {doc.meta.llm_tags && doc.meta.llm_tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
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
              <div className="font-mono text-xs mt-4 border-t border-b border-gray-100 py-2">
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
                      className="text-gray-900 whitespace-nowrap block hover:animate-marquee"
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
                      <span className="text-gray-900 whitespace-nowrap block hover:animate-marquee" title={doc.meta.sender}>
                        {doc.meta.sender}
                      </span>
                    </div>
                  </div>
                )}
                {doc.meta.receiver && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Receiver</span>
                    <div className="w-[300px] flex overflow-hidden">
                      <span className="text-gray-900 whitespace-nowrap block hover:animate-marquee" title={doc.meta.receiver}>
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
                </div>
            </SheetHeader>
            <div className="mt-6">
              <div className="h-[calc(100vh-200px)] bg-gray-50 overflow-hidden">
                <Viewer
                  fileUrl={`/api/document/${doc.id}`}
                  defaultScale={1}
                  plugins={pdfPlugins}
                  renderLoader={() => (
                    <div className="h-full w-full flex items-center justify-center">
                      <Skeleton className="absolute inset-0" />
                    </div>
                  )}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ))}
          </div>
        </div>
      ))}
    </div>
  )
})

function Documents() {
  const [searchQuery, setSearchQuery] = useState('')
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs() {
      return []
    }
  })

  return (
    <div className="h-screen overflow-auto">
      <div className="container p-6 mx-auto bg-white">
        <div className="flex flex-col space-y-8 mt-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
            <SearchBar key="a" value={searchQuery} onChange={setSearchQuery} />
          </div>
          <DocumentGrid searchQuery={searchQuery} pdfPlugins={[defaultLayoutPluginInstance]} />
        </div>
      </div>
    </div>
  )
}

export default Documents
