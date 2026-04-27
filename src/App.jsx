/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, ArrowRight, Check, Clock, Loader2, PlusCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- FIREBASE SETUP ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const STATUS_CONFIG = {
  finished: { icon: Check, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Finished' },
  unfinished: { icon: XCircle, color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Unfinished' },
  on_hold: { icon: Clock, color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'On Hold' }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null); 
  const [isSearching, setIsSearching] = useState(false);
  
  // Claiming state
  const [targetUrl, setTargetUrl] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  
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

  // 1. INITIALIZE AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. FETCH DIRECTORY FROM DATABASE
  useEffect(() => {
    if (!user) return;
    
    const domainsRef = collection(db, 'artifacts', appId, 'public', 'data', 'domains');
    const unsubscribe = onSnapshot(domainsRef, (snapshot) => {
      const fetchedPages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter out sub-subdomains
      const filteredPages = fetchedPages.filter(p => !p.name.includes('.'));
      setPages(filteredPages);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching directory:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    const cleanQuery = searchQuery.toLowerCase().replace(/[^a-z0-9-.]/g, '');
    
    try {
      const res = await fetch(`https://dns.google/resolve?name=${cleanQuery}.zenithurl.com`);
      const data = await res.json();
      
      // Also check if someone claimed it in our DB but hasn't set up DNS yet
      const isClaimedInDb = pages.some(p => p.name === cleanQuery);

      if (isClaimedInDb || data.Status === 0) {
        setSearchResult('taken');
      } else if (data.Status === 3) {
        setSearchResult('available');
      } else {
        setSearchResult('error');
      }
    } catch {
      console.warn("DNS Search failed.");
      setSearchResult('error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!user || !searchQuery || !targetUrl) return;
    
    setIsClaiming(true);
    const cleanName = searchQuery.toLowerCase().replace(/[^a-z0-9-.]/g, '');

    try {
      const domainRef = doc(db, 'artifacts', appId, 'public', 'data', 'domains', cleanName);
      await setDoc(domainRef, {
        name: cleanName,
        targetUrl: targetUrl,
        status: 'finished', // Default status
        ownerId: user.uid,
        createdAt: Date.now()
      });
      setSearchResult('success');
      setTargetUrl('');
    } catch (err) {
      console.error("Error claiming domain:", err);
      setSearchResult('error');
    } finally {
      setIsClaiming(false);
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

        {/* SEARCH & CLAIM RESULTS */}
        <div className="mt-6 w-full max-w-xl flex flex-col items-center">
          {searchResult === 'taken' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 text-rose-700 font-medium animate-in fade-in slide-in-from-bottom-2">
              <XCircle className="w-5 h-5" />
              {searchQuery}.zenithurl.com is taken
            </div>
          )}
          
          {searchResult === 'error' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100 text-neutral-600 font-medium animate-in fade-in slide-in-from-bottom-2">
              <XCircle className="w-5 h-5" />
              Something went wrong.
            </div>
          )}

          {searchResult === 'success' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-medium animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 className="w-5 h-5" />
              Successfully claimed to directory! (Update Vercel DNS to finish)
            </div>
          )}

          {searchResult === 'available' && (
            <div className="w-full animate-in fade-in slide-in-from-bottom-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-medium mb-4">
                <CheckCircle2 className="w-5 h-5" />
                {searchQuery}.zenithurl.com is available!
              </div>
              
              {/* CLAIM FORM */}
              <form onSubmit={handleClaim} className="flex gap-2 w-full">
                <input
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://your-site.vercel.app"
                  className="flex-1 h-12 px-4 rounded-xl border border-neutral-200 outline-none focus:border-neutral-400 transition-all"
                />
                <button
                  type="submit"
                  disabled={isClaiming || !targetUrl}
                  className="h-12 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  Claim
                </button>
              </form>
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
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md hover:border-neutral-200 transition-all cursor-default gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 text-neutral-400 shrink-0">
                      <ArrowRight className="w-4 h-4 -rotate-45" />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-semibold text-lg text-neutral-900 truncate">{page.name}</h3>
                      <p className="text-sm text-neutral-400 truncate">{page.name}.zenithurl.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:ml-auto">
                    {page.targetUrl && (
                      <span className="text-xs text-neutral-400 truncate max-w-[150px]" title={page.targetUrl}>
                        → {new URL(page.targetUrl).hostname}
                      </span>
                    )}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bg} shrink-0`}>
                      <div className={`w-2 h-2 rounded-full ${status.color}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
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