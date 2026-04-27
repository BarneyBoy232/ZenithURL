import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, ArrowRight, Check, Clock, Loader2 } from 'lucide-react';

// Connect this to your real Python backend
const API_BASE_URL = 'http://localhost:8000';

const STATUS_CONFIG = {
  finished: { icon: Check, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Finished' },
  unfinished: { icon: XCircle, color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Unfinished' },
  on_hold: { icon: Clock, color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'On Hold' }
};

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null); 
  const [isSearching, setIsSearching] = useState(false);
  
  const [pages, setPages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // FOOLPROOF STYLING FALLBACK
  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  // Fetch real directory data on load
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/directory`);
        if (res.ok) {
          const data = await res.json();
          // Filter out sub-subdomains (any name that contains a dot like 'xx.xx')
          const filteredPages = data.filter(page => !page.name.includes('.'));
          setPages(filteredPages);
        }
      } catch {
        // Changed to warn so it doesn't trigger the red error console in the preview environment
        console.warn("Failed to fetch directory. Backend is likely not running yet.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDirectory();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    const cleanQuery = searchQuery.toLowerCase().replace(/[^a-z0-9-.]/g, '');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/check-domain?name=${cleanQuery}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data.isAvailable ? 'available' : 'taken');
      } else {
        setSearchResult('error');
      }
    } catch {
      console.warn("Search failed. Backend is likely not running yet.");
      setSearchResult('error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setSearchResult(null);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 font-sans selection:bg-neutral-200 pb-32">
      
      {/* SEARCH SECTION */}
      <header className="pt-16 pb-12 px-6 flex flex-col items-center text-center">
        <form onSubmit={handleSearch} className="w-full max-w-xl relative">
          <div className="relative flex items-center w-full h-16 rounded-2xl bg-white border border-neutral-200 shadow-sm focus-within:border-neutral-400 focus-within:ring-4 focus-within:ring-neutral-100 transition-all">
            <Search className="w-6 h-6 text-neutral-400 absolute left-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleInputChange}
              placeholder="Search domains..."
              className="w-full h-full pl-14 pr-32 bg-transparent text-lg outline-none placeholder:text-neutral-300"
            />
            <button 
              type="submit"
              disabled={isSearching || !searchQuery}
              className="absolute right-2 h-12 px-6 bg-neutral-900 text-white font-medium rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[100px]"
            >
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Check'}
            </button>
          </div>
        </form>

        {/* SEARCH RESULTS */}
        <div className="h-14 mt-6">
          {searchResult === 'available' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-medium animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 className="w-5 h-5" />
              {searchQuery}.zenithurl.com is available
            </div>
          )}
          {searchResult === 'taken' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 text-rose-700 font-medium animate-in fade-in slide-in-from-bottom-2">
              <XCircle className="w-5 h-5" />
              {searchQuery}.zenithurl.com is taken
            </div>
          )}
           {searchResult === 'error' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100 text-neutral-600 font-medium animate-in fade-in slide-in-from-bottom-2">
              <XCircle className="w-5 h-5" />
              Failed to connect to server.
            </div>
          )}
        </div>
      </header>

      {/* DIRECTORY SECTION */}
      <main className="max-w-3xl mx-auto px-6">
        <div className="flex items-center justify-between mb-6 border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-semibold text-neutral-800">Directory</h2>
          <span className="text-sm text-neutral-500 font-medium">
            {isLoading ? 'Loading...' : `${pages.length} pages`}
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : pages.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 bg-white rounded-2xl border border-neutral-100 border-dashed">
            No public pages found in the directory.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pages.map((page) => {
              const status = STATUS_CONFIG[page.status] || STATUS_CONFIG.unfinished;

              return (
                <div 
                  key={page.id || page.name} 
                  className="group flex items-center justify-between p-5 bg-white rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md hover:border-neutral-200 transition-all cursor-default"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 text-neutral-400">
                      <ArrowRight className="w-4 h-4 -rotate-45" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-neutral-900">{page.name}</h3>
                      <p className="text-sm text-neutral-400">{page.name}.zenithurl.com</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bg}`}>
                    <div className={`w-2 h-2 rounded-full ${status.color}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}