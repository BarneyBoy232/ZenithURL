import React, { useState, useEffect } from 'react';
import { Search, Globe, CheckCircle, XCircle, ArrowRight, Loader2, ExternalLink } from 'lucide-react';

// --- CONFIGURATION ---
// Set this to your Python backend's URL (e.g., FastAPI on port 8000 or Flask on port 5000)
const API_BASE_URL = 'http://localhost:8000';

// --- NAVBAR COMPONENT ---
function Navbar() {
  return (
    <nav className="p-6 flex justify-between items-center max-w-5xl mx-auto border-b border-neutral-200">
      <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
        <Globe className="w-6 h-6 text-blue-600" />
        zenithurl
      </div>
    </nav>
  );
}

// --- HERO COMPONENT ---
function Hero() {
  return (
    <div className="text-center mb-12">
      <h1 className="text-5xl font-extrabold tracking-tight mb-6">
        Better than .vercel.app. <br className="hidden sm:block" />
        <span className="text-blue-600">Cheaper than a .com.</span>
      </h1>
      <p className="text-xl text-neutral-500">
        Ditch the clunky default hosting URLs. Give your project a memorable, branded home for free.
      </p>
    </div>
  );
}

// --- DOMAIN SEARCH COMPONENT ---
function DomainSearch() {
  const [subdomain, setSubdomain] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [status, setStatus] = useState('idle'); // idle, checking, available, taken, success

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!subdomain) return;
    setStatus('checking');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/check-domain?name=${subdomain}`);
      const data = await res.json();
      setStatus(data.isAvailable ? 'available' : 'taken');
    } catch {
      console.warn("Backend not connected yet. Waiting for Python API to check domain.");
      // Fallback behavior if backend isn't running yet so you can still test the UI
      if (subdomain === 'admin') {
        setStatus('taken');
      } else {
        setStatus('available');
      }
    }
  };

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!targetUrl) return;
    setStatus('checking');

    try {
      const res = await fetch(`${API_BASE_URL}/api/claim-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, targetUrl, isPublic })
      });
      
      if (res.ok) {
        setStatus('success');
      } else {
        console.error("Failed to claim domain");
        setStatus('idle');
      }
    } catch {
      console.warn("Backend not connected yet. Proceeding to success screen for UI testing.");
      setStatus('success'); // Allows you to see the success screen locally without the backend
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center py-8 animate-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
        <p className="text-neutral-500 mb-6">
          <strong>{subdomain}.zenithurl.com</strong> is now pointing to your project.
        </p>
        <button 
          onClick={() => { setStatus('idle'); setSubdomain(''); setTargetUrl(''); }}
          className="text-blue-600 font-medium hover:underline"
        >
          Register another node
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <label className="block text-sm font-semibold text-neutral-700">
        1. Find your perfect name
      </label>
      <form onSubmit={handleCheck} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center bg-neutral-100 rounded-lg px-4 border border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all">
          <Search className="w-5 h-5 text-neutral-400 mr-2" />
          <input
            type="text"
            placeholder="url"
            value={subdomain}
            onChange={(e) => {
              setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              setStatus('idle');
            }}
            className="flex-1 bg-transparent py-3 outline-none"
          />
          <span className="text-neutral-500 font-medium">.zenithurl.com</span>
        </div>
        <button 
          type="submit"
          disabled={!subdomain || status === 'checking'}
          className="bg-neutral-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[120px]"
        >
          {status === 'checking' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Check'}
        </button>
      </form>

      {status === 'taken' && (
        <div className="flex items-center text-red-600 bg-red-50 p-3 rounded-lg">
          <XCircle className="w-5 h-5 mr-2" />
          <span className="font-medium">Sorry, {subdomain}.zenithurl.com is taken.</span>
        </div>
      )}

      {status === 'available' && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-6">
          <div className="flex items-center text-green-600 bg-green-50 p-3 rounded-lg mb-6">
            <CheckCircle className="w-5 h-5 mr-2" />
            <span className="font-medium">Awesome! {subdomain}.zenithurl.com is available.</span>
          </div>

          <label className="block text-sm font-semibold text-neutral-700 mb-3">
            2. Where should it point?
          </label>
          <form onSubmit={handleClaim} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                required
                placeholder="https://your-project.vercel.app"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="flex-1 bg-neutral-50 py-3 px-4 rounded-lg border border-neutral-200 outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
              <button 
                type="submit"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center whitespace-nowrap"
              >
                Claim for Free <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer mt-1">
              <input 
                type="checkbox" 
                checked={isPublic} 
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              List this URL publicly in the Zenith directory
            </label>
          </form>
        </div>
      )}
    </div>
  );
}

// --- PUBLIC DIRECTORY COMPONENT ---
function PublicDirectory() {
  const [publicUrls, setPublicUrls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPublicUrls = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/public-directory`);
        if (res.ok) {
          const data = await res.json();
          setPublicUrls(data);
        } else {
          setPublicUrls([]);
        }
      } catch {
        console.warn("Backend not connected. Defaulting to empty directory.");
        setPublicUrls([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicUrls();
  }, []);

  if (isLoading) {
    return (
      <div className="mt-20 text-center text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        <p>Loading directory...</p>
      </div>
    );
  }

  return (
    <div className="mt-20">
      <h3 className="text-xl font-bold mb-6 text-neutral-800 flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-600" />
        Recently Claimed
      </h3>
      
      {publicUrls.length === 0 ? (
        <div className="text-center p-8 bg-neutral-100 rounded-xl border border-neutral-200 text-neutral-500">
          No public URLs claimed yet. Be the first!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicUrls.map((url, i) => (
            <a 
              key={i} 
              href={`https://${url.name}.zenithurl.com`} 
              target="_blank" 
              rel="noreferrer"
              className="group block p-5 bg-white rounded-xl border border-neutral-200 hover:border-blue-500 hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-lg text-neutral-900 group-hover:text-blue-600 transition-colors">
                  {url.name}
                </span>
                <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-blue-500" />
              </div>
              <p className="text-sm text-neutral-500 mb-4 truncate">
                {url.name}.zenithurl.com
              </p>
              <div className="text-xs font-medium text-neutral-400 bg-neutral-50 inline-block px-2 py-1 rounded">
                {url.views || 0} visits
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// --- MAIN APP (This is what renders everything) ---
export default function App() {
  // FOOLPROOF STYLING FALLBACK
  // This forces Tailwind CSS to load directly in the browser if local config is broken
  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-blue-200 pb-20">
      <Navbar />
      <main className="max-w-4xl mx-auto mt-20 px-6">
        <Hero />
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-neutral-100 max-w-3xl mx-auto">
          <DomainSearch />
        </div>
        <PublicDirectory />
      </main>
    </div>
  );
}