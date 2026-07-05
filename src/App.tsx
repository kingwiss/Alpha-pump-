import { useState, useEffect } from "react";
import { Sparkles, Coins, Zap, Heart, AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MemeCoin, SolanaWallet, SwapLog } from "./types";
import Header from "./components/Header";
import TokenCard from "./components/TokenCard";
import TokenModal from "./components/TokenModal";
import SwapEngine from "./components/SwapEngine";
import Portfolio from "./components/Portfolio";
import ErrorBoundary from "./components/ErrorBoundary";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getAbsoluteUrl, playCuteUpdateSound } from "./utils";

export default function App() {
  const [activeTab, setActiveTab] = useState<"home" | "portfolio">("home");
  const [homeFeedTab, setHomeFeedTab] = useState<"fresh" | "trending">("fresh");
  
  // Applet tokens list data state
  const [coins, setCoins] = useState<{ fresh: MemeCoin[]; trending: MemeCoin[] }>({
    fresh: [],
    trending: [],
  });
  const [loadingCoins, setLoadingCoins] = useState(true);
  const [coinsError, setCoinsError] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemeCoin[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Modal and select states
  const [selectedCoin, setSelectedCoin] = useState<MemeCoin | null>(null);
  const [swapCoin, setSwapCoin] = useState<MemeCoin | null>(null);

  // Wallet and local logs persistence
  const [wallet, setWallet] = useState<SolanaWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [logs, setLogs] = useState<SwapLog[]>([]);

  // Load wallet and logs from local storage on mount
  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem("solana_meme_alerts_logs");
      if (savedLogs) setLogs(JSON.parse(savedLogs));
    } catch (e) {
      console.error("Failed to restore logs from localStorage:", e);
    }
  }, []);

  const handleLogin = async (token: string) => {
    try {
      setWalletError(null);
      localStorage.setItem("firebase_auth_token", token);
      
      const { auth, db } = await import("./firebase");
      const { doc, getDoc, setDoc } = await import("firebase/firestore");
      
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data && data.publicKey) {
          const newWallet: SolanaWallet = {
            publicKey: data.publicKey,
            secretKey: data.secretKey || "",
            solBalance: 0,
            memeBalances: {}
          };
          setWallet(newWallet);
          handleRefreshBalances(newWallet);
        }
      } else {
        // Generate new burner wallet
        const { Keypair } = await import("@solana/web3.js");
        const bs58 = (await import("bs58")).default;
        
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const secretKey = bs58.encode(keypair.secretKey);
        
        await setDoc(userRef, {
          publicKey,
          secretKey,
          createdAt: Date.now()
        });
        
        const newWallet: SolanaWallet = {
          publicKey,
          secretKey,
          solBalance: 0,
          memeBalances: {}
        };
        setWallet(newWallet);
        handleRefreshBalances(newWallet);
      }
    } catch (error: any) {
      console.error("Failed to fetch user wallet:", error);
      setWalletError(error.message || String(error));
    }
  };

  const handleLogout = () => {
    setWallet(null);
    localStorage.removeItem("firebase_auth_token");
  };

  const fetchTokens = async (initial = false) => {
    if (initial) setLoadingCoins(true);
    try {
      const response = await fetch(getAbsoluteUrl("/api/tokens"));
      if (!response.ok) throw new Error(`Server returned status ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setCoins((prev) => {
          // Helper to merge newly fetched coins with old coins that are "still doing good"
          const merge = (oldList: MemeCoin[], newList: MemeCoin[], type: "fresh" | "trending") => {
            const mergedMap = new Map<string, MemeCoin>();
            
            // 1. Add all new coins so they are always in the list with freshest prices/data
            (newList || []).forEach((coin) => {
              if (coin && coin.mintAddress) {
                // If type is fresh, strictly ensure it's under 1 hour old
                if (type === "fresh") {
                  const ageMs = Date.now() - new Date(coin.createdAt).getTime();
                  if (ageMs > 0 && ageMs < 3600000) {
                    mergedMap.set(coin.mintAddress, coin);
                  }
                } else {
                  mergedMap.set(coin.mintAddress, coin);
                }
              }
            });
            
            // 2. Add old coins that are "still doing good" but not in the new list
            (oldList || []).forEach((coin) => {
              if (coin && coin.mintAddress && !mergedMap.has(coin.mintAddress)) {
                // For fresh section, MUST still be under 1 hour old!
                if (type === "fresh") {
                  const ageMs = Date.now() - new Date(coin.createdAt).getTime();
                  if (ageMs <= 0 || ageMs >= 3600000) {
                    return; // Strictly ignore if 1 hour or older
                  }
                }
                // Keep it if it's doing good: positive price change over 5m, 1h, or 24h, or is viral, or has high volume
                const isDoingGood = coin.change1h > 0 || coin.change24h > 0 || coin.change5m > 0 || coin.isViral || coin.volume24h > 5000;
                if (isDoingGood) {
                  mergedMap.set(coin.mintAddress, coin);
                }
              }
            });
            
            let mergedList = Array.from(mergedMap.values());
            
            // Double filter fresh list to be 100% bulletproof
            if (type === "fresh") {
              mergedList = mergedList.filter((coin) => {
                const ageMs = Date.now() - new Date(coin.createdAt).getTime();
                return ageMs > 0 && ageMs < 3600000; // Under 1 hour old!
              });
            }
            
            // 3. Sort correctly: Fresh by newest age first, Trending by volume (descending)
            if (type === "fresh") {
              return mergedList
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 20);
            } else {
              return mergedList
                .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
                .slice(0, 20);
            }
          };

          const mergedFresh = merge(prev.fresh, data.fresh, "fresh");
          const mergedTrending = merge(prev.trending, data.trending, "trending");

          // Play sound if there are actual list updates (new coins added or order changed/moved around) or if manually refreshed
          const prevFreshKeys = (prev.fresh || []).map(c => c.id).join(",");
          const nextFreshKeys = mergedFresh.map(c => c.id).join(",");
          const prevTrendingKeys = (prev.trending || []).map(c => c.id).join(",");
          const nextTrendingKeys = mergedTrending.map(c => c.id).join(",");

          if (prevFreshKeys !== nextFreshKeys || prevTrendingKeys !== nextTrendingKeys || initial) {
            playCuteUpdateSound();
          }

          return { fresh: mergedFresh, trending: mergedTrending };
        });
        setCoinsError(null);
      } else {
        throw new Error(data.error || "Failed to scan token lists.");
      }
    } catch (err: any) {
      console.error("Failed to fetch real-time tokens:", err);
      if (coins.fresh.length === 0) setCoinsError("DEX scanner congested. Displaying cached metrics.");
    } finally {
      if (initial) setLoadingCoins(false);
    }
  };

  useEffect(() => {
    fetchTokens(true);
    const interval = setInterval(() => fetchTokens(false), 8000);
    return () => clearInterval(interval);
  }, []);

  // Real-time search handler
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(getAbsoluteUrl(`/api/search?q=${encodeURIComponent(searchQuery)}`));
        const data = await response.json();
        if (data.success) {
          setSearchResults(data.results);
        } else {
          setSearchError("Search failed.");
        }
      } catch (err) {
        setSearchError("Failed to connect to search API.");
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Refresh Solana blockchain wallet balance
  const handleRefreshBalances = async (targetWallet = wallet) => {
    if (!targetWallet) return;
    try {
      const response = await fetch(getAbsoluteUrl(`/api/solana/balance/${targetWallet.publicKey}`));
      const data = await response.json();
      
      if (data.success) {
        const updated: SolanaWallet = {
          ...targetWallet,
          solBalance: data.solBalance,
        };
        setWallet(updated);
        localStorage.setItem("solana_meme_alerts_wallet", JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Failed to fetch live Solana balance:", err);
    }
  };

  // Generate completely new random Solana Keypair securely
  const handleGenerateKeypair = () => {
    try {
      const keypair = Keypair.generate();
      const newWallet: SolanaWallet = {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: bs58.encode(keypair.secretKey),
        solBalance: 0.00,
        memeBalances: {},
      };
      setWallet(newWallet);
      localStorage.setItem("solana_meme_alerts_wallet", JSON.stringify(newWallet));
    } catch (error) {
      console.error("Failed to generate keypair:", error);
    }
  };

  // Callback on successful swaps
  const handleSwapSuccess = (newLog: SwapLog, isSimulated: boolean) => {
    const updatedLogs = [newLog, ...logs].slice(0, 50);
    setLogs(updatedLogs);
    localStorage.setItem("solana_meme_alerts_logs", JSON.stringify(updatedLogs));

    if (wallet) {
      let updatedSOL = wallet.solBalance;
      const updatedMeme = { ...wallet.memeBalances };

      if (newLog.direction === "buy") {
        updatedSOL = Math.max(0, updatedSOL - newLog.amountSOL);
        updatedMeme[newLog.symbol] = (updatedMeme[newLog.symbol] || 0) + newLog.amountToken;
      } else {
        updatedSOL = updatedSOL + newLog.amountSOL;
        updatedMeme[newLog.symbol] = Math.max(0, (updatedMeme[newLog.symbol] || 0) - newLog.amountToken);
      }

      const updatedWallet: SolanaWallet = {
        ...wallet,
        solBalance: updatedSOL,
        memeBalances: updatedMeme,
      };

      setWallet(updatedWallet);
      localStorage.setItem("solana_meme_alerts_wallet", JSON.stringify(updatedWallet));

      if (!isSimulated) {
        setTimeout(() => handleRefreshBalances(updatedWallet), 2500);
      }
    }
  };

  const handleSwapClickFromModal = (coin: MemeCoin) => {
    setSwapCoin(coin);
    setSelectedCoin(null);
  };

  const allCoinsList = [...coins.fresh, ...coins.trending, ...searchResults];

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200 antialiased font-sans">
      
      <Header activeTab={activeTab} setActiveTab={setActiveTab} wallet={wallet} onLogin={handleLogin} onLogout={handleLogout} />

      <main className="max-w-7xl w-full mx-auto p-4 md:p-6 flex-grow space-y-6">
        
        {coinsError && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center gap-2 text-xs font-mono">
            <AlertTriangle size={14} />
            <span>{coinsError}</span>
            <button onClick={() => fetchTokens(true)} className="ml-auto flex items-center gap-1 hover:underline cursor-pointer">
              <RefreshCw size={10} />
              Re-sync
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "home" ? (
            <motion.div
              key="home-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col space-y-4"
            >
              {/* Unified Search Bar */}
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="Search any Solana Meme Coin or Mint Address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-3.5 bg-slate-900 border border-slate-800 focus:border-cyan-500/50 rounded-2xl text-xs font-sans text-white placeholder:text-slate-500 transition-all outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                    className="absolute inset-y-0 right-4 flex items-center text-slate-500 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Main Content Area */}
              {searchQuery ? (
                /* Search Results View */
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 min-h-[500px]">
                  <h3 className="text-xs font-sans font-black tracking-wider text-gray-400 uppercase mb-4 flex items-center gap-2">
                    Search Results
                    {isSearching && <RefreshCw size={12} className="animate-spin text-cyan-500" />}
                  </h3>
                  
                  {searchError && (
                    <p className="text-xs text-red-400 font-mono p-4 text-center">{searchError}</p>
                  )}

                  <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1">
                    {!isSearching && searchResults.length === 0 && !searchError && (
                      <p className="text-xs text-slate-500 font-mono text-center py-12">No coins found matching "{searchQuery}" on DexScreener.</p>
                    )}
                    {searchResults.map(coin => (
                      <TokenCard key={coin.id} coin={coin} onSelect={(c) => setSelectedCoin(c)} onBuy={(c) => { handleSwapClickFromModal(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                    ))}
                  </div>
                </div>
              ) : (
                  /* Standard Feeds View */
                  <>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Sparkles className="text-cyan-400" size={16} />
                        <span className="text-xs font-sans font-black tracking-wider uppercase text-gray-300">
                          Live Social Scanners
                        </span>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 flex-grow md:flex-grow-0">
                          <button
                            onClick={() => setHomeFeedTab("fresh")}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-sans font-bold uppercase transition-all cursor-pointer ${
                              homeFeedTab === "fresh" ? "bg-slate-900 text-cyan-400 border border-slate-800" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Zap size={11} className={homeFeedTab === "fresh" ? "animate-pulse" : ""} />
                            Under 1 Hour
                          </button>
                          <button
                            onClick={() => setHomeFeedTab("trending")}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-sans font-bold uppercase transition-all cursor-pointer ${
                              homeFeedTab === "trending" ? "bg-slate-900 text-emerald-400 border border-slate-800" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Coins size={11} />
                            Verified &amp; Trending
                          </button>
                        </div>

                        {/* Refresh list button at top right corner of the meme coins section */}
                        <button
                          onClick={() => fetchTokens(true)}
                          disabled={loadingCoins}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-cyan-400 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-sans font-bold uppercase transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Refresh list of meme coins"
                        >
                          <RefreshCw size={12} className={loadingCoins ? "animate-spin" : ""} />
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>

                    <div className="relative overflow-hidden w-full flex-grow min-h-[500px]">
                      {loadingCoins ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-slate-950/20 backdrop-blur-sm z-10 rounded-3xl">
                          <div className="w-10 h-10 border-2 border-cyan-500/10 border-t-cyan-400 rounded-full animate-spin mb-4" />
                          <p className="text-xs text-gray-400 font-mono animate-pulse uppercase tracking-widest">
                            Scraping DexScreener APIs...
                          </p>
                        </div>
                      ) : (
                        <div className="w-full h-full lg:grid lg:grid-cols-2 gap-6">
                          
                          {/* Column 1: Fresh < 1h */}
                          <div className={`flex flex-col space-y-3.5 transition-all duration-300 ${
                            homeFeedTab === "fresh" ? "block w-full" : "max-lg:hidden"
                          }`}>
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1 leading-none">
                                <Zap size={10} />
                                Fresh Launches (Age &lt; 1h)
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                {coins.fresh.length} scanned
                              </span>
                            </div>

                            <div className="space-y-3 max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-900 pr-1">
                              {coins.fresh.length === 0 ? (
                                <p className="text-xs text-slate-500 font-mono p-4 text-center border border-dashed border-slate-800 rounded-xl mt-4">
                                  No strictly new coins (&lt;1hr) currently trending on DexScreener volume charts. Check back in a few minutes!
                                </p>
                              ) : (
                                coins.fresh.map((coin) => (
                                  <TokenCard key={coin.id} coin={coin} onSelect={(c) => setSelectedCoin(c)} onBuy={(c) => { handleSwapClickFromModal(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                ))
                              )}
                            </div>
                          </div>

                          {/* Column 2: Trending */}
                          <div className={`flex flex-col space-y-3.5 transition-all duration-300 ${
                            homeFeedTab === "trending" ? "block w-full" : "max-lg:hidden"
                          }`}>
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 leading-none">
                                <Coins size={10} />
                                High Traffic Viral Assets
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                {coins.trending.length} active
                              </span>
                            </div>

                            <div className="space-y-3 max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-900 pr-1">
                              {coins.trending.map((coin) => (
                                <TokenCard key={coin.id} coin={coin} onSelect={(c) => setSelectedCoin(c)} onBuy={(c) => { handleSwapClickFromModal(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
            </motion.div>
          ) : (
            <motion.div
              key="portfolio-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <ErrorBoundary fallbackTitle="Portfolio Section Crashed">
                <Portfolio
                  wallet={wallet}
                  logs={logs}
                  onGenerateKeypair={handleGenerateKeypair}
                  onRefreshBalances={handleRefreshBalances}
                  onBack={() => setActiveTab("home")}
                  walletError={walletError}
                  onSwapAsset={(symbol) => {
                    const targetCoin = allCoinsList.find(c => c.symbol === symbol) || {
                      id: symbol.toLowerCase(),
                      symbol: symbol,
                      name: `${symbol} Token`,
                      mintAddress: "", // Unknown mint
                      priceUSD: 0,
                      priceSOL: 0,
                      volume24h: 0,
                      change5m: 0,
                      change1h: 0,
                      change24h: 0,
                      liquidity: 0,
                      marketCap: 0,
                      holders: 0,
                      createdAt: new Date().toISOString(),
                      type: "trending" as const,
                      chartData: []
                    };
                    handleSwapClickFromModal(targetCoin as MemeCoin);
                  }}
                />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-slate-950 border-t border-slate-900/60 py-6 px-6 text-center text-[10px] text-slate-600 font-mono space-y-1">
        <p>Alpha pump © 2026 • Powered by Solana Mainnet, DexScreener APIs, and Jupiter Aggregator</p>
        <p className="flex items-center justify-center gap-1 text-slate-500">
          Crafted with <Heart size={10} className="text-cyan-500 fill-cyan-500" /> on Web3
        </p>
      </footer>

      {selectedCoin && (
        <TokenModal coin={selectedCoin} onClose={() => setSelectedCoin(null)} onSwapClick={(c) => { handleSwapClickFromModal(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}

      {swapCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSwapCoin(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSwapCoin(null)}
              className="absolute -top-12 right-0 p-2 text-slate-400 hover:text-white bg-slate-900 rounded-full border border-slate-800 z-20 cursor-pointer"
            >
              <X size={20} />
            </button>
            <SwapEngine
              coins={allCoinsList}
              activeWallet={wallet}
              selectedCoinFromModal={swapCoin}
              onSwapSuccess={(log, sim) => {
                handleSwapSuccess(log, sim);
                setTimeout(() => setSwapCoin(null), 3000);
              }}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}
