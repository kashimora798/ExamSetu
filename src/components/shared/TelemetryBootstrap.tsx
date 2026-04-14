import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { flushTelemetryQueue, trackError } from '../../lib/telemetry';

export default function TelemetryBootstrap() {
  const location = useLocation();

  useEffect(() => {
    flushTelemetryQueue();
  }, []);

  useEffect(() => {
    flushTelemetryQueue();
  }, [location.pathname]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      trackError(event.error || event.message, { source: 'window.onerror' });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      trackError(event.reason, { source: 'window.onunhandledrejection' });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
