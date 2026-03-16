import { useState, useEffect } from 'react';

export default function StatusTab() {
  const [status, setStatus] = useState('Loading...');

  const fetchStatus = async () => {
    setStatus('Loading...');
    try {
      const res = await fetch('/api/status');
      if (!res.ok) {
        let message = 'Failed to fetch status';
        try {
          const errorBody = await res.json();
          if (errorBody?.error) message = errorBody.error;
        } catch {
          // Keep fallback message if response body is not JSON.
        }
        throw new Error(message);
      }
      const data = await res.json();
      if (typeof data?.statusText === 'string' && data.statusText.trim()) {
        setStatus(data.statusText);
      } else {
        setStatus(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setStatus(`Error loading status:\n${err.message}`);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="flex flex-col h-full w-full p-2">
      <div className="flex mb-2">
        <button className="qtx-button" onClick={fetchStatus}>
          Refresh
        </button>
      </div>
      <textarea
        className="flex-1 qtx-input font-mono text-sm resize-none whitespace-pre"
        readOnly
        value={status}
      />
    </div>
  );
}
