import useSWR from 'swr'
import { useState, memo, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Settings, Loader2, TerminalSquare, PencilIcon, SaveIcon, XIcon, RefreshCcw, SortAsc } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { DocumentPreview } from '@/components/DocumentPreview'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Viewer, Plugin } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'

// Import styles
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'

import { Skeleton } from '@/components/ui/skeleton'
import clsx from 'clsx'

interface DocumentData {
  id: number;
  path: string;
  content: string;
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
    summary?: string;
    llmProcessed?: boolean;
    title?: string;
    todos?: {
      description: string;
      date: string;
    }[];
  };
  created_at: string;
  updated_at: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

type FormattedDate = string | { month: string; year: string } | { day: string; month: string; year: string };

function formatDate(dateString: string, format: 'full' | 'monthYear' | 'dayMonthYear' = 'full'): FormattedDate {
  const date = new Date(dateString);
  if (format === 'monthYear') {
    return {
      month: date.toLocaleString('en-US', { month: 'long' }),
      year: date.getFullYear().toString()
    };
  }
  if (format === 'dayMonthYear') {
    return {
      day: date.toLocaleString('en-US', { day: 'numeric' }),
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
    day?: string;
    documents: DocumentData[];
  };
};

function getSortDate(doc: DocumentData, sortField: 'date' | 'created_at'): string {
  return sortField === 'date' ? (doc.meta?.date || doc.created_at) : doc.created_at;
}

function groupDocumentsByDate(documents: DocumentData[], sortField: 'date' | 'created_at'): GroupedDocuments {
  const grouped = documents.reduce((acc: GroupedDocuments, doc) => {
    if (!doc.meta.llmProcessed) {
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

    // Use created_at as fallback if meta.date is not available
    const dateToUse = getSortDate(doc, sortField);
    const formatted = sortField === 'date' 
      ? formatDate(dateToUse, 'monthYear') as { month: string; year: string }
      : formatDate(dateToUse, 'dayMonthYear') as { day: string; month: string; year: string };
    
    const key = sortField === 'date'
      ? `${formatted.year}-${formatted.month}`
      : `${formatted.year}-${formatted.month}-${formatted.day}`;

    if (!acc[key]) {
      acc[key] = {
        year: formatted.year,
        month: formatted.month,
        ...(sortField === 'created_at' && { day: formatted.day }),
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
  onToggleSort: () => void;
  sortField: 'date' | 'created_at';
}

const SearchBar = memo(({ value, onChange, onToggleSort, sortField }: SearchBarProps) => (
  <div className="flex gap-4 items-center">
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 w-4 h-4 text-gray-400 transform -translate-y-1/2" />
      <Input
        type="text"
        placeholder="Suche"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 border-gray-200 focus:border-gray-400 focus:ring-gray-400"
      />
    </div>
    <button
      onClick={onToggleSort}
      className="p-2 rounded-md transition-colors hover:bg-gray-100"
      title={`Sort by ${sortField === 'date' ? 'created date' : 'document date'}`}
    >
      <SortAsc className="w-5 h-5 text-gray-600" />
    </button>
    <Link
      to="/logs"
      className="p-2 rounded-md transition-colors hover:bg-gray-100"
      title="Logs"
    >
      <TerminalSquare className="w-5 h-5 text-gray-600" />
    </Link>
    <Link
      to="/settings"
      className="p-2 rounded-md transition-colors hover:bg-gray-100"
      title="Settings"
    >
      <Settings className="w-5 h-5 text-gray-600" />
    </Link>
  </div>
))

interface DocumentGridProps {
  searchQuery: string;
  pdfPlugins: Plugin[];
  sortField: 'date' | 'created_at';
}

const DocumentGrid = memo(forwardRef<{ setShowAddedToday: (show: boolean) => void }, DocumentGridProps>((props) => {
  const handleReset = async (docId: number) => {
    try {
      const response = await fetch(`/api/documents/${docId}/reset`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to reset document');
      }
      
      toast({
        title: 'Document reset',
        description: 'The document will be reprocessed shortly.',
      });
      
      // Refresh the documents list
      mutate();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reset document. Please try again.',
        variant: 'destructive',
      });
    }
  };
  const { searchQuery, pdfPlugins, sortField } = props;
  const [editingDate, setEditingDate] = useState<number | null>(null);
  const [tempDate, setTempDate] = useState('');
  const endpoint = searchQuery
    ? `/api/documents?search=${encodeURIComponent(searchQuery)}`
    : '/api/documents'


  const { data, error, mutate } = useSWR<DocumentData[]>(endpoint, fetcher, { refreshInterval: searchQuery ? 0 : 1000 })

  if (error) return <div>Failed to load documents</div>
  if (!data) return <div>Loading...</div>

  // Filter only PDF files based on the file extension in the path.
  const documents = data.filter(doc => doc.path.toLowerCase().endsWith('.pdf'))

  // Group documents by date
  const groupedDocs = groupDocumentsByDate(documents, sortField);

  // Sort groups by date (newest first), with processing group always at the top


  const sortedGroups = Object.entries(groupedDocs)
    .sort(([keyA], [keyB]) => {
      if (keyA === 'processing') return -1;
      if (keyB === 'processing') return 1;
      return keyB.localeCompare(keyA);
    });


  return (
    <div className="px-4 space-y-12">
      {sortedGroups.map(([key, group]) => (
        <div key={key} className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">
            {key === 'processing' ? (
              <div className="space-y-1">
                <span className="flex gap-2 items-center">
                  Processing
                  <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                </span>
              </div>
            ) : (
              <>
                {sortField === 'date' ? (
                  <>
                    {group.month} <span className="font-normal text-gray-400">{group.year}</span>
                  </>
                ) : (
                  <>
                    {group.month} {group.day}, <span className="font-normal text-gray-400">{group.year}</span>
                  </>
                )}
              </>
            )}
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                        {doc.meta.title || extractFileName(doc.path)}
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
                    <SheetTitle>{doc.meta.title || extractFileName(doc.path)}</SheetTitle>
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
                    <div className="py-3 mt-2 text-sm">
                      <span className="block mb-2 font-medium">Summary</span>
                      {doc.meta.summary}
                    </div>
                    <div className={clsx("py-3 mt-2 text-sm", {
                      "hidden": doc.meta.todos?.length === 0
                    })}>
                      <span className="block mb-2 font-medium">Todos</span>
                      {doc.meta.todos?.map((todo, index) => (
                        <div key={index} className="flex items-center mb-2">
                          <span className="flex-grow">- {todo.description}</span>
                          <span className="text-gray-500">{todo.date}</span>
                        </div>
                      ))}
                    </div>
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
                      <div className="flex justify-between py-1 border-t border-gray-100">
                        <span className="text-gray-500">Actions</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2 h-6"
                            onClick={() => handleReset(doc.id)}
                            title="Reset document processing"
                          >
                            <RefreshCcw className="w-3 h-3" />
                            <span className="ml-2">Reset</span>
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between py-1 group">
                        <span className="text-gray-500">Date</span>
                        <div className="w-[300px] flex items-center gap-2 justify-end">
                          {editingDate === doc.id ? (
                            <>
                              <Input
                                type="date"
                                className="w-[150px] h-6 text-xs"
                                value={tempDate}
                                onChange={(e) => setTempDate(e.target.value)}
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="px-2 h-6"
                                  onClick={() => setEditingDate(null)}
                                >
                                  <XIcon className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="px-2 h-6"
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(`/api/document/${doc.id}/meta`, {
                                        method: 'PATCH',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          ...doc.meta,
                                          date: tempDate,
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
                                  }}
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
                        plugins={pdfPlugins}
                        renderLoader={() => (
                          <div className="flex justify-center items-center w-full h-full">
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
}))

function Documents() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'date' | 'created_at'>('date')
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs() {
      return []
    }
  })

  return (
    <div className="overflow-auto h-screen">
      <div className="container p-6 mx-auto bg-white">
        <div className="flex flex-col mt-5 space-y-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <SearchBar 
              key="a" 
              value={searchQuery} 
              onChange={setSearchQuery}
              sortField={sortField}
              onToggleSort={() => setSortField(current => current === 'date' ? 'created_at' : 'date')}
            />
          </div>
          <DocumentGrid 
            searchQuery={searchQuery} 
            pdfPlugins={[defaultLayoutPluginInstance]} 
            sortField={sortField}
          />
        </div>
      </div>
    </div>
  )
}

export default Documents
