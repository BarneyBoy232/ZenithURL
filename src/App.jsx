import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, ArrowRight, Check, Clock, Loader2, PlusCircle, Globe, Sparkles } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCqc2f3mxV9tIqaSimur4mGOsHIxsWNN8A",
  authDomain: "zenithurl-e9909.firebaseapp.com",
  projectId: "zenithurl-e9909",
  storageBucket: "zenithurl-e9909.firebasestorage.app",
  messagingSenderId: "7083366833",
  appId: "1:7083366833:web:0a4f9837b24de6b1f30590",
  measurementId: "G-P20NWPE2ZZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = 'zenithurl'; 

const STATUS_CONFIG = {
  finished: { icon: Check, color: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-950/50', border: 'border-emerald-800/50', label: 'Finished' },
  unfinished: { icon: XCircle, color: 'bg-rose-400', text: 'text-rose-300', bg: 'bg-rose-950/50', border: 'border-rose-800/50', label: 'Unfinished' },
  on_hold: { icon: Clock, color: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-950/50', border: 'border-amber-800/50', label: 'On Hold' }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null); 
  const [isSearching, setIsSearching] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [pages, setPages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(null);

  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const domainsRef = collection(db, 'artifacts', appId, 'public', 'data', 'domains');
    const unsubscribe = onSnapshot(domainsRef, (snapshot) => {
      const fetchedPages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filteredPages = fetchedPages.filter(p => !p.name.includes('.') && p.name !== 'www');
      setPages(filteredPages);
      setIsLoading(false);
    }, () => setIsLoading(false));
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
      const dbEntry = pages.find(p => p.name === cleanQuery);
      if (data.Status === 0) {
        setSearchResult('taken');
        if (!dbEntry) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'domains', cleanQuery), {
            name: cleanQuery,
            status: 'finished',
            createdAt: Date.now(),
            autoDetected: true
          });
        }
      } else if (data.Status === 3) {
        if (dbEntry) {
          const isBrandNew = (Date.now() - dbEntry.createdAt) < (60 * 60 * 1000); 
          if (!isBrandNew) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'domains', cleanQuery));
            setSearchResult('available');
          } else {
            setSearchResult('taken');
          }
        } else {
          setSearchResult('available');
        }
      } else {
        setSearchResult('error');
      }
    } catch {
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
        status: 'unfinished', 
        ownerId: user.uid,
        createdAt: Date.now()
      });
      setSearchResult('success');
      setTargetUrl('');
    } catch {
      setSearchResult('error');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleStatusChange = async (e, domainName, newStatus) => {
    e.preventDefault(); // Stop link navigation
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'domains', domainName), {
        status: newStatus
      });
      setOpenDropdown(null);
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-slate-950 to-black text-slate-100 pb-32 font-sans selection:bg-indigo-500/30">
      
      {/* Invisible overlay to close dropdown when clicking outside */}
      {openDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(null);
          }} 
        />
      )}

      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-40 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <header className="pt-24 pb-16 px-6 flex flex-col items-center text-center relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <Sparkles className="w-8 h-8 text-indigo-400" />
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300">
            ZenithURL
          </h1>
        </div>

        <form onSubmit={handleSearch} className="w-full max-w-xl relative">
          <div className="relative flex items-center w-full h-16 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl focus-within:border-indigo-400/50 focus-within:bg-white/10 transition-all">
            <Search className="w-6 h-6 text-indigo-300/50 absolute left-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {setSearchQuery(e.target.value); setSearchResult(null);}}
              placeholder="Search domains..."
              className="w-full h-full pl-14 pr-32 bg-transparent text-lg text-white placeholder:text-slate-500 outline-none"
            />
            <button 
              type="submit"
              disabled={isSearching || !searchQuery}
              className="absolute right-2 h-12 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl disabled:opacity-50 transition-all flex items-center justify-center min-w-[100px] shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]"
            >
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Check'}
            </button>
          </div>
        </form>

        <div className="mt-6 w-full max-w-xl flex flex-col items-center">
          {searchResult === 'taken' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 font-medium backdrop-blur-md">
              <XCircle className="w-5 h-5" />
              {searchQuery}.zenithurl.com is taken
            </div>
          )}
          {searchResult === 'success' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium backdrop-blur-md">
              <CheckCircle2 className="w-5 h-5" />
              Claimed successfully!
            </div>
          )}
          {searchResult === 'available' && (
            <div className="w-full animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium mb-4 backdrop-blur-md">
                <CheckCircle2 className="w-5 h-5" />
                {searchQuery}.zenithurl.com is available!
              </div>
              <form onSubmit={handleClaim} className="flex gap-2 w-full">
                <input
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://your-site.com"
                  className="flex-1 h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-indigo-400/50 focus:bg-white/10 backdrop-blur-md transition-all"
                />
                <button
                  type="submit"
                  disabled={isClaiming || !targetUrl}
                  className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(5,150,105,0.3)] transition-all"
                >
                  {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  Claim
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 relative z-10">
        <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Active Directory
          </h2>
          <span className="text-sm text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {isLoading ? 'Loading...' : `${pages.length} nodes`}
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
        ) : (
          <div className="grid gap-3">
            {pages.map((page) => {
              const status = STATUS_CONFIG[page.status] || STATUS_CONFIG.unfinished;
              const isDropdownOpen = openDropdown === page.name;

              return (
                <a 
                  key={page.id || page.name} 
                  href={`https://${page.name}.zenithurl.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300 gap-4 hover:shadow-[0_8px_30px_rgba(79,70,229,0.1)] relative ${isDropdownOpen ? 'z-50' : 'z-0'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 shrink-0 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                      <ArrowRight className="w-4 h-4 -rotate-45" />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-semibold text-lg text-slate-200 truncate group-hover:text-white transition-colors">{page.name}</h3>
                      <p className="text-sm text-slate-500 truncate">{page.name}.zenithurl.com</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 sm:ml-auto">
                    {/* Custom Dropdown Container */}
                    <div className="relative z-50">
                      <div 
                        onClick={(e) => {
                          e.preventDefault();
                          setOpenDropdown(isDropdownOpen ? null : page.name);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bg} border ${status.border} shrink-0 cursor-pointer hover:brightness-125 transition-all`}
                      >
                        <div className={`w-2 h-2 rounded-full ${status.color} shadow-[0_0_8px_currentColor]`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${status.text}`}>{status.label}</span>
                      </div>
                      
                      {/* Custom Dropdown Menu */}
                      {isDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                          <div className="p-1">
                            {Object.entries(STATUS_CONFIG).map(([statusKey, config]) => (
                              <button
                                key={statusKey}
                                onClick={(e) => handleStatusChange(e, page.name, statusKey)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                                  page.status === statusKey 
                                    ? 'bg-white/10 text-white' 
                                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full ${config.color}`} />
                                <span className="font-medium">{config.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}