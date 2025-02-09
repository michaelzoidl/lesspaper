import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './app.tsx'
import { Worker } from '@react-pdf-viewer/core'
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
} from 'kbar'
import Documents from './pages/documents'
import Settings from './pages/settings'


const searchStyle = {
  padding: '12px 16px',
  fontSize: '16px',
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
  border: 'none',
  background: 'var(--background)',
  color: 'var(--foreground)'
}

const animatorStyle = {
  maxWidth: '600px',
  width: '100%',
  background: 'var(--background)',
  color: 'var(--foreground)',
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)'
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: <Settings />
      },
      {
        path: '/documents',
        element: <Documents />
      },
      {
        path: '/settings',
        element: <Settings />
      }
    ]
  }
])

const actions = [
  {
    id: 'documents',
    name: 'Documents',
    shortcut: ['h'],
    perform: () => router.navigate('/documents')
  },
  {
    id: 'settings',
    name: 'Settings',
    shortcut: ['g'],
    perform: () => router.navigate('/settings')
  }
]

createRoot(document.getElementById('root')!).render(
  <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
    <React.StrictMode>
      <KBarProvider actions={actions}>
        <KBarPortal>
          <KBarPositioner style={{ zIndex: 10000 }}>
            <KBarAnimator style={animatorStyle}>
              <KBarSearch style={searchStyle} />
            </KBarAnimator>
          </KBarPositioner>
        </KBarPortal>
        <RouterProvider router={router} />
      </KBarProvider>
    </React.StrictMode>
  </Worker>,
)
