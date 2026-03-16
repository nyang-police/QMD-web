import { useState } from 'react';
import SearchTab from './components/SearchTab';
import CollectionsTab from './components/CollectionsTab';
import StatusTab from './components/StatusTab';

function App() {
  const [activeTab, setActiveTab] = useState('search');

  return (
    <div className="flex flex-col h-screen w-full bg-brand-bg text-brand-text">
      {/* Top Header / Tab Bar */}
      <div className="flex justify-center items-end px-2 pt-1.5 bg-brand-bg border-b border-brand-border h-10 shrink-0">
        <button
          className={`qtx-tab ${activeTab === 'search' ? 'qtx-tab-active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
        <button
          className={`qtx-tab ${activeTab === 'collections' ? 'qtx-tab-active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
        <button
          className={`qtx-tab ${activeTab === 'status' ? 'qtx-tab-active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative p-1">
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'status' && <StatusTab />}
      </div>
      
      {/* Status Bar */}
      <div className="h-5 bg-brand-pane text-[#a6adc8] text-sm flex items-center px-2 shrink-0 border-t border-brand-border">
        Ready
      </div>
    </div>
  );
}

export default App;
