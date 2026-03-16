import { useState, useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('query');
  const [collection, setCollection] = useState('');
  const [limit, setLimit] = useState(20);
  const [minScorePct, setMinScorePct] = useState(0);

  const [collections, setCollections] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedResultIdx, setSelectedResultIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  
  const [docContent, setDocContent] = useState('Loading...');
  const [docTab, setDocTab] = useState('preview');

  // Fetch collections for the dropdown
  useEffect(() => {
    fetch('/api/collections')
      .then(res => res.json())
      .then(data => setCollections(data.collections || []))
      .catch(console.error);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedResultIdx(-1);
    setDocContent('Loading...');

    const minScore = minScorePct / 100.0;
    const url = new URL('/api/search', window.location.origin);
    url.searchParams.append('query', query.trim());
    url.searchParams.append('mode', mode);
    if (collection) url.searchParams.append('collection', collection);
    url.searchParams.append('limit', limit);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        let message = `Search failed: ${res.statusText}`;
        try {
          const errorBody = await res.json();
          if (errorBody?.error) message = errorBody.error;
        } catch {
          // Keep fallback message.
        }
        throw new Error(message);
      }
      const data = await res.json();
      
      const filtered = (data || []).filter(item => (item.score || 0) >= minScore);
      setResults(filtered);
    } catch (e) {
      alert(e.message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectedResult = selectedResultIdx >= 0 ? results[selectedResultIdx] : null;

  // Fetch document when selection changes
  useEffect(() => {
    if (!selectedResult) {
      setDocContent('Select a document to view...');
      return;
    }

    const docIdOrPath = selectedResult.docid 
      ? (selectedResult.docid.startsWith('#') ? selectedResult.docid : `#${selectedResult.docid}`) 
      : selectedResult.path;

    if (!docIdOrPath) {
      setDocContent('(no path or docid available)');
      return;
    }

    setDocContent('Loading...');
    fetch(`/api/document?path=${encodeURIComponent(docIdOrPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.text) setDocContent(data.text);
        else if (data && data.body) setDocContent(data.body);
        else if (data && data.content) setDocContent(data.content);
        else setDocContent(JSON.stringify(data, null, 2));
      })
      .catch((e) => setDocContent(`Error loading document:\n${e.message}`));
  }, [selectedResult]);

  const getScoreColorClass = (score) => {
    if (score >= 0.7) return 'text-brand-green';
    if (score >= 0.4) return 'text-brand-orange';
    return 'text-brand-gray';
  };

  return (
    <div className="flex flex-col h-full w-full p-2 gap-2">
      {/* Search Header Group */}
      <div className="flex flex-col qtx-pane p-2">
        <div className="flex gap-2">
          <input 
            type="text"
            placeholder="Enter search query..."
            className="flex-5 qtx-input text-lg font-mono"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <select className="flex-1 qtx-input font-mono bg-brand-input hover:bg-[#45475a]" value={mode} onChange={e => setMode(e.target.value)}>
            <option value="search">search (BM25)</option>
            <option value="vsearch">vsearch (Vector)</option>
            <option value="query">query (Hybrid)</option>
          </select>
          <select className="flex-1 qtx-input font-mono bg-brand-input hover:bg-[#45475a]" value={collection} onChange={e => setCollection(e.target.value)}>
            <option value="">All Collections</option>
            {collections.map(c => (
              <option key={c.name} value={c.name}>{c.name} {c.documents ? `(${c.documents} docs)` : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-4 items-center mt-2">
          <span className="text-sm">Max results:</span>
          <input 
            type="number" 
            min="1" max="100" 
            className="qtx-input w-20 text-sm py-1"
            value={limit} 
            onChange={e => setLimit(Number(e.target.value))}
          />
          
          <span className="text-sm ml-4">Min score (%):</span>
          <input 
            type="number" 
            min="0" max="100" 
            className="qtx-input w-20 text-sm py-1"
            value={minScorePct} 
            onChange={e => setMinScorePct(Number(e.target.value))}
          />

          <div className="flex-1"></div>
          <button className="qtx-button shadow-sm" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Main Splitter Area */}
      <PanelGroup direction="horizontal" className="flex-1 mt-1">
        {/* Left: Result List */}
        <Panel defaultSize={35} minSize={20} className="qtx-pane flex flex-col">
          <div className="px-3 py-1 bg-[#1e1e2e] border-b border-brand-border text-xs text-brand-text mb-1 flex items-center h-8 shrink-0">
            Results ({results.length})
          </div>
          <ul className="flex-1 overflow-y-auto font-mono text-sm py-1 decoration-clone">
            {results.map((r, idx) => {
              const displayScore = r.score <= 1.0 ? Math.round(r.score * 100) : Math.round(r.score);
              return (
                <li 
                  key={idx}
                  className={`cursor-pointer px-3 py-1.5 flex gap-2 ${selectedResultIdx === idx ? 'bg-brand-border bg-opacity-70' : 'hover:bg-[#313244]'}`}
                  onClick={() => setSelectedResultIdx(idx)}
                >
                  <span className={`w-12 text-right shrink-0 ${getScoreColorClass(r.score)}`}>
                    [{displayScore}%]
                  </span>
                  <span className={`truncate ${getScoreColorClass(r.score)}`}>
                    {r.title || r.path || r.displayPath} {r.collection && <span className="text-[#a6adc8] ml-2 text-xs">({r.collection})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        {/* Right: Document Viewer */}
        <Panel defaultSize={65} minSize={30} className="qtx-pane flex flex-col">
          <div className="flex text-xs bg-[#1e1e2e] border-b border-brand-border h-8 shrink-0 items-end">
            {['preview', 'snippet', 'document', 'metadata'].map(t => (
              <div 
                key={t}
                className={`px-4 py-1.5 cursor-pointer border-t-2 border-transparent transition-colors ${docTab === t ? 'bg-[#181825] border-t-brand-accent text-brand-text relative top-[1px] border-l border-r border-brand-border font-bold' : 'text-[#a6adc8] hover:text-brand-text'}`}
                onClick={() => setDocTab(t)}
              >
                {t === 'document' ? 'Full Document' : t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-auto bg-[#181825]">
            {!selectedResult ? (
              <div className="p-4 text-brand-gray font-mono">Select a document to view</div>
            ) : (
              <>
                {docTab === 'snippet' && (
                  <pre className="p-4 font-mono text-sm whitespace-pre-wrap">{selectedResult.snippet || '(no snippet)'}</pre>
                )}
                {docTab === 'document' && (
                  <pre className="p-4 font-mono text-sm whitespace-pre-wrap">{docContent}</pre>
                )}
                {docTab === 'preview' && (
                  <div className="markdown-preview">
                    <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                      {docContent}
                    </ReactMarkdown>
                  </div>
                )}
                {docTab === 'metadata' && (
                  <pre className="p-4 font-mono text-sm whitespace-pre-wrap">
                    {JSON.stringify({
                      title: selectedResult.title,
                      path: selectedResult.path,
                      docid: selectedResult.docid,
                      collection: selectedResult.collection,
                      context: selectedResult.context,
                      score: selectedResult.score
                    }, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
