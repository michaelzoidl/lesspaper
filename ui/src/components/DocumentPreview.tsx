import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

interface DocumentPreviewProps {
  documentId: number;
  fileName: string;
}

export function DocumentPreview({ documentId, fileName }: DocumentPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  
  const { targetRef, hasIntersected } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '100px'
  });

  // Start loading when the component enters viewport
  useEffect(() => {
    if (hasIntersected) {
      setShouldLoad(true);
    }
  }, [hasIntersected]);

  // Reset states when documentId changes
  useEffect(() => {
    setImageLoaded(false);
    setRetryCount(0);
    setError(false);
  }, [documentId]);

  // Setup retry interval if image hasn't loaded
  useEffect(() => {
    if (!shouldLoad || imageLoaded || error || retryCount >= 10) return; // Stop after 10 retries (20 seconds)

    const intervalId = setInterval(() => {
      setRetryCount(prev => prev + 1);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [shouldLoad, imageLoaded, error, retryCount]);

  // Force re-render of image when retryCount changes
  const imageUrl = `/api/preview/${documentId}?retry=${retryCount}`;

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.style.opacity = '1';
    setImageLoaded(true);
  };

  const handleError = () => {
    if (retryCount >= 10) {
      setError(true);
    }
  };

  return (
    <div ref={targetRef} className="absolute inset-0">
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <span className="text-sm text-gray-500">Preview not available</span>
        </div>
      ) : (
        <>
          {(!imageLoaded || !shouldLoad) && (
            <div className="absolute inset-0">
              <Skeleton className="w-full h-full" />
            </div>
          )}
          {shouldLoad && (
            <img
              key={retryCount} // Force re-render on retry
              src={imageUrl}
              alt={`Preview of ${fileName}`}
              className="absolute inset-0 object-cover w-full h-full"
              onLoad={handleLoad}
              onError={handleError}
              style={{ opacity: 0, transition: 'opacity 0.2s' }}
              loading="lazy"
            />
          )}
        </>
      )}
    </div>
  );
}
