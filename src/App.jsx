import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, ArrowRight, Check, Clock, Loader2, PlusCircle, Globe, Sparkles, AppWindow, Download, Upload, Trash2, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

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
const storage = getStorage(app);

const appId = 'zenithurl';
// Only this Google account is allowed to add/edit. Enforced for real by the
// Firestore + Storage security rules — hiding the buttons is just cosmetic.
const ADMIN_EMAIL = 'ethan.barnacoat@gmail.com';

const STATUS_CONFIG = {
  finished: { icon: Check, color: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-950/50', border: 'border-emerald-800/50', label: 'Finished' },
  unfinished: { icon: XCircle, color: 'bg-rose-400', text: 'text-rose-300', bg: 'bg-rose-950/50', border: 'border-rose-800/50', label: 'Unfinished' },
  on_hold: { icon: Clock, color: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-950/50', border: 'border-amber-800/50', label: 'On Hold' }
};

// Turn a byte count into something readable like "12.4 MB".
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Reusable status pill. For visitors it's a plain read-only badge; for the
// admin it opens a dropdown to change finished / unfinished / on hold.
function StatusControl({ status, isAdmin, isOpen, onToggle, onSelect, onClose }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unfinished;
  return (
    <div className="relative z-50">
      <div
        onClick={isAdmin ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${cfg.bg} border ${cfg.border} shrink-0 ${isAdmin ? 'cursor-pointer hover:brightness-125' : ''} transition-all`}
      >
        <div className={`w-2 h-2 rounded-full ${cfg.color} shadow-[0_0_8px_currentColor]`} />
        <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
      </div>

      {isAdmin && isOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ cursor: 'default' }} onClick={(e) => { e.stopPropagation(); onClose(); }} />
          <div className="absolute right-0 top-full mt-2 w-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right z-50">
            <div className="p-1">
              {Object.entries(STATUS_CONFIG).map(([key, c]) => (
                <button
                  key={key}
                  onClick={(e) => onSelect(e, key)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors relative z-50 ${status === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${c.color}`} />
                  <span className="font-medium">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('sites'); // 'sites' | 'apps'

  // Sites (subdomain directory) state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [pages, setPages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(null);

  // Is the current signed-in user the allowed editor?
  const isAdmin = !!user && !user.isAnonymous && user.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  // Auth: visitors browse as anonymous (read-only). Signing in with Google as
  // the admin account unlocks editing; signing out drops back to anonymous.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) signInAnonymously(auth).catch((err) => console.error('Auth error:', err));
    });
    return () => unsubscribe();
  }, []);

  const handleAdminSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error('Sign-in failed', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth); // onAuthStateChanged re-signs in anonymously
    } catch (err) {
      console.error('Sign-out failed', err);
    }
  };

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
        // Auto-record a newly discovered live subdomain — admin only.
        if (!dbEntry && isAdmin) {
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
          if (!isBrandNew && isAdmin) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'domains', cleanQuery));
            setSearchResult('available');
          } else {
            setSearchResult(isBrandNew ? 'taken' : 'available');
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
    if (!isAdmin || !searchQuery || !targetUrl) return;
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
    e.stopPropagation();
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'domains', domainName), {
        status: newStatus
      });
      setOpenDropdown(null);
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const tabClass = (active) =>
    `px-5 py-2 rounded-full text-sm font-medium transition-all ${active ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'text-slate-400 hover:text-white'}`;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-slate-950 to-black text-slate-100 pb-32 font-sans selection:bg-indigo-500/30">

      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-40 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Admin sign-in / status bar */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        {isAdmin ? (
          <>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5" /> Editing as Ethan
            </span>
            <button onClick={handleSignOut} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium hover:bg-white/10 hover:text-white transition-all backdrop-blur-md">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </>
        ) : (
          <button onClick={handleAdminSignIn} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium hover:bg-white/10 hover:text-white transition-all backdrop-blur-md">
            <LogIn className="w-3.5 h-3.5" /> Admin sign in
          </button>
        )}
      </div>

      <header className="pt-24 pb-10 px-6 flex flex-col items-center text-center relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <Sparkles className="w-8 h-8 text-indigo-400" />
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300">
            ZenithURL
          </h1>
        </div>

        {/* View switch: subdomain directory vs installable apps */}
        <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
          <button onClick={() => setView('sites')} className={tabClass(view === 'sites')}>
            <span className="inline-flex items-center gap-2"><Globe className="w-4 h-4" /> Directory</span>
          </button>
          <button onClick={() => setView('apps')} className={tabClass(view === 'apps')}>
            <span className="inline-flex items-center gap-2"><AppWindow className="w-4 h-4" /> Apps</span>
          </button>
        </div>

        {view === 'sites' && (
          <>
            <form onSubmit={handleSearch} className="w-full max-w-xl relative">
              <div className="relative flex items-center w-full h-16 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl focus-within:border-indigo-400/50 focus-within:bg-white/10 transition-all">
                <Search className="w-6 h-6 text-indigo-300/50 absolute left-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(null); }}
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
                <div className="w-full animate-in fade-in slide-in-from-top-4 duration-300 flex flex-col items-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium mb-4 backdrop-blur-md">
                    <CheckCircle2 className="w-5 h-5" />
                    {searchQuery}.zenithurl.com is available!
                  </div>
                  {isAdmin && (
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
                  )}
                </div>
              )}
              {searchResult === 'error' && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 font-medium backdrop-blur-md">
                  <XCircle className="w-5 h-5" />
                  Something went wrong — try again
                </div>
              )}
            </div>
          </>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 relative">
        {view === 'sites' ? (
          <>
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
                  const isDropdownOpen = openDropdown === page.name;
                  return (
                    <div
                      key={page.id || page.name}
                      onClick={() => window.open(`https://${page.name}.zenithurl.com`, '_blank')}
                      className={`cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300 gap-4 hover:shadow-[0_8px_30px_rgba(79,70,229,0.1)] relative ${isDropdownOpen ? 'z-50' : 'z-0'}`}
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
                        <StatusControl
                          status={page.status}
                          isAdmin={isAdmin}
                          isOpen={isDropdownOpen}
                          onToggle={() => setOpenDropdown(isDropdownOpen ? null : page.name)}
                          onClose={() => setOpenDropdown(null)}
                          onSelect={(e, key) => handleStatusChange(e, page.name, key)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <AppsView isAdmin={isAdmin} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apps: installers for things that ship as an app instead of a website.
// Visitors browse and download; only the admin can upload, restatus, delete.
// ---------------------------------------------------------------------------
function AppsView({ isAdmin }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Upload form state
  const [form, setForm] = useState({ name: '', description: '', platform: 'Windows' });
  const [file, setFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const appsRef = collection(db, 'artifacts', appId, 'public', 'data', 'apps');
    const unsubscribe = onSnapshot(appsRef, (snapshot) => {
      const rows = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setApps(rows);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!isAdmin || !file || !form.name.trim()) return;
    setUploadError('');
    const slug = form.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const id = `${slug}-${Date.now()}`;
    const path = `apps/${id}/${file.name}`;
    const task = uploadBytesResumable(storageRef(storage, path), file);
    setUploadPct(0);
    task.on('state_changed',
      (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => {
        console.error('Upload failed', err);
        setUploadError('Upload failed — check that Storage is enabled and you are the admin.');
        setUploadPct(null);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'apps', id), {
            name: form.name.trim(),
            description: form.description.trim(),
            platform: form.platform,
            status: 'finished',
            fileUrl: url,
            fileName: file.name,
            storagePath: path,
            size: file.size,
            createdAt: Date.now()
          });
          setForm({ name: '', description: '', platform: 'Windows' });
          setFile(null);
          setUploadPct(null);
          setShowForm(false);
        } catch (err) {
          console.error('Saving app record failed', err);
          setUploadError('File uploaded but saving its details failed.');
          setUploadPct(null);
        }
      }
    );
  };

  const handleDelete = async (e, appRow) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!window.confirm(`Delete "${appRow.name}"? This removes the installer too.`)) return;
    try {
      if (appRow.storagePath) {
        await deleteObject(storageRef(storage, appRow.storagePath)).catch(() => {});
      }
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'apps', appRow.id));
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleStatus = async (e, id, status) => {
    e.stopPropagation();
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'apps', id), { status });
      setOpenDropdown(null);
    } catch (err) {
      console.error('Status update failed', err);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
        <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
          <AppWindow className="w-5 h-5 text-indigo-400" />
          Installable Apps
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {loading ? 'Loading...' : `${apps.length} apps`}
          </span>
          {isAdmin && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]"
            >
              <PlusCircle className="w-4 h-4" /> Add app
            </button>
          )}
        </div>
      </div>

      {/* Admin upload form */}
      {isAdmin && showForm && (
        <form onSubmit={handleUpload} className="mb-6 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="App name"
              className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-indigo-400/50 transition-all"
            />
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-indigo-400/50 transition-all"
            >
              <option className="bg-slate-900">Windows</option>
              <option className="bg-slate-900">macOS</option>
              <option className="bg-slate-900">Linux</option>
              <option className="bg-slate-900">Android</option>
              <option className="bg-slate-900">Other</option>
            </select>
          </div>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Short description (optional)"
            className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-indigo-400/50 transition-all"
          />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <label className="flex-1 flex items-center gap-3 h-11 px-4 rounded-xl bg-white/5 border border-dashed border-white/20 text-slate-400 cursor-pointer hover:border-indigo-400/50 hover:text-slate-200 transition-all">
              <Upload className="w-4 h-4 shrink-0" />
              <span className="truncate">{file ? `${file.name} (${formatSize(file.size)})` : 'Choose installer file...'}</span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
            <button
              type="submit"
              disabled={uploadPct !== null || !file || !form.name.trim()}
              className="h-11 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(5,150,105,0.3)] transition-all"
            >
              {uploadPct !== null ? <><Loader2 className="w-4 h-4 animate-spin" /> {uploadPct}%</> : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          </div>
          {uploadError && <p className="text-sm text-rose-300">{uploadError}</p>}
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No apps yet.</div>
      ) : (
        <div className="grid gap-3">
          {apps.map((appRow) => {
            const isDropdownOpen = openDropdown === appRow.id;
            return (
              <div
                key={appRow.id}
                onClick={() => appRow.fileUrl && window.open(appRow.fileUrl, '_blank')}
                className={`cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300 gap-4 hover:shadow-[0_8px_30px_rgba(79,70,229,0.1)] relative ${isDropdownOpen ? 'z-50' : 'z-0'}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 shrink-0 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-semibold text-lg text-slate-200 truncate group-hover:text-white transition-colors">{appRow.name}</h3>
                    <p className="text-sm text-slate-500 truncate">
                      {appRow.platform}
                      {appRow.size ? ` · ${formatSize(appRow.size)}` : ''}
                      {appRow.description ? ` · ${appRow.description}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:ml-auto shrink-0">
                  <StatusControl
                    status={appRow.status}
                    isAdmin={isAdmin}
                    isOpen={isDropdownOpen}
                    onToggle={() => setOpenDropdown(isDropdownOpen ? null : appRow.id)}
                    onClose={() => setOpenDropdown(null)}
                    onSelect={(e, key) => handleStatus(e, appRow.id, key)}
                  />
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDelete(e, appRow)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
                      title="Delete app"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
