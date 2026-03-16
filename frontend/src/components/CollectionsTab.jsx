import { useState, useEffect } from 'react';

export default function CollectionsTab() {
  const [collections, setCollections] = useState([]);
  const [selectedColIndex, setSelectedColIndex] = useState(-1);
  const [files, setFiles] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [forceEmbed, setForceEmbed] = useState(false);
  const [embedProgress, setEmbedProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loadError, setLoadError] = useState('');

  const fetchCollections = async () => {
    try {
      setLoadError('');
      let data = null;

      const directRes = await fetch('/api/collections');
      if (directRes.ok) {
        data = await directRes.json();
      } else {
        const statusRes = await fetch('/api/status');
        if (!statusRes.ok) throw new Error('Failed to load collections');
        data = await statusRes.json();
      }

      const list = Array.isArray(data?.collections) ? data.collections : [];
      setCollections(list);
      setSelectedColIndex((prev) => (prev >= list.length ? -1 : prev));
    } catch (e) {
      console.error(e);
      setCollections([]);
      setSelectedColIndex(-1);
      setLoadError(e.message || 'Failed to load collections');
    }
  };

  useEffect(() => {
    // Keep a fixed dependency array to avoid noisy dev warnings during HMR.
    fetchCollections();
  }, []);

  const selectedCol = selectedColIndex >= 0 ? collections[selectedColIndex] : null;

  useEffect(() => {
    if (!selectedCol) {
      setFiles([]);
      return;
    }

    setFiles(['Loading...']);
    fetch(`/api/collections/${encodeURIComponent(selectedCol.name)}/files`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load files');
        }
        return res.json();
      })
      .then((data) => setFiles(data.files || []))
      .catch((e) => setFiles([`(Error: ${e.message})`]));
  }, [selectedCol]);

  const runMutation = async (url, options) => {
    const res = await fetch(url, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Request failed');
    }
    return res.json();
  };

  const handleRefresh = async () => {
    setIsBusy(true);
    setBusyMessage('Refreshing...');
    await fetchCollections();
    setIsBusy(false);
    setBusyMessage('');
  };

  const handleAdd = async () => {
    const name = prompt('Enter collection name:');
    if (!name) return;
    const path = prompt('Enter folder path to index:');
    if (!path) return;
    const mask = prompt('Enter glob mask (or leave empty for **/*.md):');
    
    setIsBusy(true);
    setBusyMessage(`Adding collection '${name}'...`);
    try {
      await runMutation('/api/collections/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, mask: mask || '' })
      });
      await fetchCollections();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleRename = async () => {
    if (!selectedCol) return;
    const newName = prompt('Enter new collection name:', selectedCol.name);
    if (!newName || newName === selectedCol.name) return;

    setIsBusy(true);
    setBusyMessage(`Renaming '${selectedCol.name}' to '${newName}'...`);
    try {
      await runMutation(`/api/collections/${encodeURIComponent(selectedCol.name)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
      });
      await fetchCollections();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleRemove = async () => {
    if (!selectedCol) return;
    if (!confirm(`Are you sure you want to remove '${selectedCol.name}'?\n\nThis removes the index only.`)) return;
    
    setIsBusy(true);
    setBusyMessage(`Removing '${selectedCol.name}'...`);
    try {
      await runMutation(`/api/collections/${encodeURIComponent(selectedCol.name)}`, { method: 'DELETE' });
      setSelectedColIndex(-1);
      await fetchCollections();
    } catch (e) {
      alert(e.message);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleUpdateIndex = async () => {
    const name = selectedCol ? selectedCol.name : '';
    setIsBusy(true);
    setBusyMessage(`Updating index for ${name || 'all collections'}...`);
    try {
      await runMutation(`/api/collections/${encodeURIComponent(name || 'all')}/update`, { method: 'POST' });
    } catch (e) {
      alert(e.message);
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleEmbed = () => {
    setIsBusy(true);
    setBusyMessage('Starting embedding...');
    setEmbedProgress(0);
    setLogs([]);

    const es = new EventSource(`/api/embed?force=${forceEmbed}`);
    
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'progress') {
          setEmbedProgress(msg.pct || 0);
          if (msg.detail) setBusyMessage(`Embedding... ${msg.pct}% (${msg.detail})`);
        } else if (msg.type === 'log') {
          setLogs((prev) => [...prev, msg.text]);
        } else if (msg.type === 'done') {
          es.close();
          setEmbedProgress(100);
          setBusyMessage('Embedding complete!');
          setTimeout(() => {
            setIsBusy(false);
            setBusyMessage('');
            fetchCollections();
          }, 3000);
        }
      } catch {
        // Ignore non-JSON SSE chunks.
      }
    };
    
    es.onerror = () => {
      es.close();
      setIsBusy(false);
      alert('Error connecting to embed stream');
    };
  };

  return (
    <div className="flex flex-col h-full w-full gap-1">
      {/* Toolbar */}
      <div className="flex gap-2 shrink-0 px-0.5 pt-0.5">
        <button className="qtx-button" onClick={handleAdd} disabled={isBusy}>+ Add</button>
        <button className="qtx-button" onClick={handleRemove} disabled={!selectedCol || isBusy}>- Remove</button>
        <button className="qtx-button" onClick={handleRename} disabled={!selectedCol || isBusy}>Rename</button>
        <div className="flex-1"></div>
        <button className="qtx-button" onClick={handleRefresh} disabled={isBusy}>Refresh</button>
      </div>

      {/* Main area: same structure as qmd-gui */}
      <div className="qtx-pane flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex border-b border-brand-border">
          <div className="relative w-[36%] min-w-[240px] border-r border-brand-border flex flex-col">
            <div className="qtx-section-title">Collections</div>
            <ul className="flex-1 overflow-y-auto font-mono text-[13px] py-1 mt-6">
              {collections.map((col, idx) => (
                <li
                  key={idx}
                  className={`cursor-pointer px-2 py-[1px] ${selectedColIndex === idx ? 'bg-brand-border' : 'hover:bg-[#313244]'}`}
                  onClick={() => setSelectedColIndex(idx)}
                >
                  {col.name} {col.documents ? `(${col.documents} docs)` : ''}
                </li>
              ))}
              {!collections.length && (
                <li className="px-2 py-[1px] text-[#a6adc8]">
                  {loadError ? `(Failed to load collections: ${loadError})` : '(No collections)'}
                </li>
              )}
            </ul>
          </div>

          <div className="relative flex-1 min-w-0 flex flex-col">
            <div className="qtx-section-title">Files</div>
            <ul className="flex-1 overflow-y-auto font-mono text-[13px] py-1 mt-6">
              {files.map((f, i) => <li key={i} className="px-2 py-[1px]">{f}</li>)}
              {selectedCol && !files.length && (
                <li className="px-2 py-[1px] text-[#a6adc8]">(No files)</li>
              )}
            </ul>
          </div>
        </div>

        <div className="h-28 shrink-0 p-2 overflow-auto">
          {logs.length > 0 ? (
            <div className="font-mono text-[12px] whitespace-pre">{logs.join('\n')}</div>
          ) : (
            selectedCol ? (
              <div className="font-mono text-[13px] leading-relaxed">
                <div>Name:       {selectedCol.name}</div>
                <div>Path:       {selectedCol.path || selectedCol.pwd || ''}</div>
                <div>Documents:  {selectedCol.doc_count || selectedCol.documents || 0}</div>
                <div>Pattern:    {selectedCol.pattern || '**/*.md'}</div>
              </div>
            ) : (
              <div className="font-mono text-[13px] text-[#a6adc8]">(Select a collection)</div>
            )
          )}
        </div>
      </div>

      {/* Index Actions & Progress */}
      <div className="flex gap-2 items-center shrink-0 px-0.5 pb-0.5">
        <button className="qtx-button" onClick={handleUpdateIndex} disabled={isBusy}>Update Index</button>
        <button className="qtx-button" onClick={handleEmbed} disabled={isBusy}>Generate Embeddings</button>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input 
            type="checkbox" 
            checked={forceEmbed}
            onChange={(e) => setForceEmbed(e.target.checked)}
            className="w-4 h-4 bg-brand-input border-brand-border rounded-sm cursor-pointer accent-brand-accent"
          />
          Force re-embed
        </label>
        
        {isBusy && (
          <div className="flex-1 flex items-center justify-end gap-4 ml-4 text-sm qtx-input px-3">
            <div className="flex-1 h-3 bg-brand-bg rounded overflow-hidden">
              <div 
                className="h-full bg-brand-accent transition-all duration-300"
                style={{ width: `${Math.max(5, embedProgress)}%` }}
              ></div>
            </div>
            <span className="shrink-0 w-48 truncate text-right text-brand-accent">{busyMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
