import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, ArrowRight, Check, Clock, Loader2, PlusCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

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
  finished: { icon: Check, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Finished' },
  unfinished: { icon: XCircle, color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Unfinished' },
  on_hold: { icon: Clock, color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'On Hold' }
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
      const filteredPages = fetchedPages.filter(p => !p.name.includes('.'));
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

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 pb-32">
      <header className="pt-16 pb-12 px-6 flex flex-col items-center text-center">
        <form onSubmit={handleSearch} className="w-full max-w-xl relative">
          <div className="relative flex items-center w-full h-16 rounded-2xl bg-white border border-neutral-200 shadow-sm focus-within:border-neutral-400 transition-all">
            <Search className="w-6 h-6 text-neutral-400 absolute left-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {setSearchQuery(e.target.value); setSearchResult(null);}}
              placeholder="Search domains..."
              className="w-full h-full pl-14 pr-32 bg-transparent text-lg outline-none"
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

        <div className="mt-6 w-full max-w-xl flex flex-col items-center">
          {searchResult === 'taken' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 text-rose-700 font-medium">
              <XCircle className="w-5 h-5" />
              {searchQuery}.zenithurl.com is taken
            </div>
          )}
          {searchResult === 'success' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              Claimed successfully!
            </div>
          )}
          {searchResult === 'available' && (
            <div className="w-full">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-medium mb-4">
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
                  className="flex-1 h-12 px-4 rounded-xl border border-neutral-200 outline-none focus:border-neutral-400"
                />
                <button
                  type="submit"
                  disabled={isClaiming || !targetUrl}
                  className="h-12 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  Claim
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6">
        <div className="flex items-center justify-between mb-6 border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-semibold text-neutral-800">Directory</h2>
          <span className="text-sm text-neutral-500">{isLoading ? 'Loading...' : `${pages.length} pages`}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-neutral-400" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {pages.map((page) => {
              const status = STATUS_CONFIG[page.status] || STATUS_CONFIG.unfinished;
              return (
                <div key={page.id || page.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-all gap-4">
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
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bg} shrink-0`}>
                      <div className={`w-2 h-2 rounded-full ${status.color}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${status.text}`}>{status.label}</span>
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