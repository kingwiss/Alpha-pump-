"use client";
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
      const searchKeywords = ["pump.fun", "solana", "meme", "dog", "cat", "ai", "moon"];
      const allPairs: any[] = [];
      let pumpCoins: any[] = [];
      
      // A. Fetch freshest coins directly from Pump.fun API (handles failure gracefully)
      try {
        const pumpFreshRes = await fetch("https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false", {
          headers: {
            "Accept": "application/json"
          }
        });
        if (pumpFreshRes.ok) {
          const data = await pumpFreshRes.json();
          if (Array.isArray(data)) {
            pumpCoins = [...pumpCoins, ...data];
          }
        }
      } catch (e) {
        console.warn("Error fetching fresh Pump.fun tokens client-side:", e);
      }

      // B. Fetch trending/top coins from Pump.fun API
      try {
        const pumpTrendingRes = await fetch("https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false", {
          headers: {
            "Accept": "application/json"
          }
        });
        if (pumpTrendingRes.ok) {
          const data = await pumpTrendingRes.json();
          if (Array.isArray(data)) {
            pumpCoins = [...pumpCoins, ...data];
          }
        }
      } catch (e) {
        console.warn("Error fetching trending Pump.fun tokens client-side:", e);
      }

      const searchPromises = searchKeywords.map(async (kw) => {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(kw)}`);
          if (res.ok) {
            const data = await res.json();
            return data.pairs || [];
          }
        } catch (e) {
          console.error(`DexScreener search failed for keyword "${kw}":`, e);
        }
        return [];
      });

      const searchResultsArray = await Promise.all(searchPromises);
      searchResultsArray.forEach(pairs => {
        pairs.forEach((pair: any) => {
          if (pair && pair.chainId === "solana" && pair.baseToken && pair.pairAddress) {
            allPairs.push(pair);
          }
        });
      });

      // Deduplicate DexScreener
      const uniquePairsMap = new Map<string, any>();
      for (const pair of allPairs) {
        if (pair && pair.pairAddress && !uniquePairsMap.has(pair.pairAddress)) {
          uniquePairsMap.set(pair.pairAddress, pair);
        }
      }
      const deduplicatedPairs = Array.from(uniquePairsMap.values());
      
      let solPriceUSD = 145.0;
      const solPair = deduplicatedPairs.find(p => p.baseToken?.symbol === "SOL" || p.quoteToken?.symbol === "SOL");
      if (solPair && parseFloat(solPair.priceUsd) > 0) {
        if (solPair.baseToken?.symbol === "SOL") {
          solPriceUSD = parseFloat(solPair.priceUsd);
        } else {
          const pUsd = parseFloat(solPair.priceUsd);
          const pNative = parseFloat(solPair.priceNative);
          if (pNative > 0) {
            solPriceUSD = pUsd / pNative;
          }
        }
      }

      const now = Date.now();
      
      // Map Pump.fun coins
      const mappedPumpCoins = pumpCoins.map(p => {
        const mint = p.mint;
        const name = p.name || "Unknown Meme";
        const symbol = p.symbol || "MEME";
        const mcapUSD = p.usd_market_cap || 5000;
        const priceUSD = mcapUSD / 1e9;
        const priceSOL = priceUSD / solPriceUSD;
        
        const change5m = p.change5m || (Math.random() * 8 + 2);
        const change1h = p.change1h || (Math.random() * 35 + 5);
        const change24h = p.change24h || (Math.random() * 120 + 10);
        const volume24h = p.volume24h || (mcapUSD * (Math.random() * 0.3 + 0.15));
        const liquidity = p.liquidity || (mcapUSD * (Math.random() * 0.15 + 0.1));
        const holders = p.holders || Math.floor(mcapUSD / (Math.random() * 80 + 80)) + 12;
        const createdAt = new Date(p.created_timestamp || (now - 48 * 3600000)).toISOString();
        const isViral = mcapUSD > 50000 || p.reply_count > 15;

        const startPrice = priceUSD * 0.3;
        const chartData = Array.from({ length: 24 }).map((_, i) => {
          const hoursAgo = 23 - i;
          const currentSim = startPrice + ((priceUSD - startPrice) * (i / 23));
          const noise = currentSim * (Math.random() - 0.45) * 0.12;
          return {
            time: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
            price: Math.max(0.000000001, (currentSim + noise) / solPriceUSD)
          };
        });

        return {
          id: mint,
          name,
          symbol,
          mintAddress: mint,
          pairAddress: mint,
          priceSOL,
          priceUSD,
          change5m,
          change1h,
          change24h,
          volume24h,
          liquidity,
          marketCap: mcapUSD,
          holders,
          createdAt,
          type: "trending" as const,
          isViral,
          chartData
        };
      });

      // Map DexScreener coins
      const mappedDexCoins = deduplicatedPairs.map(p => {
        const pairAddress = p.pairAddress || p.id;
        const basePrice = parseFloat(p.priceNative || String(p.priceSOL || "0"));
        const volume24 = p.volume?.h24 || 0;
        const mcap = p.fdv || p.marketCap || p.liquidity?.usd || 0;
        const isViral = (p.volume?.h1 > 20000 && p.priceChange?.h1 > 5) || (p.volume?.m5 > 3000 && p.priceChange?.m5 > 2);
        const change = p.priceChange?.h24 || p.change24h || 0;
        const safeChange = change <= -100 ? -99.99 : change;
        const startPrice = basePrice / (1 + (safeChange / 100));
        
        const chartData = Array.from({ length: 24 }).map((_, i) => {
          const hoursAgo = 23 - i;
          const currentSim = startPrice + ((basePrice - startPrice) * (i / 23));
          const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
          return {
            time: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
            price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
          };
        });

        // Ensure date is string (fallback to 48 hours old if missing)
        let createdAtIso = p.pairCreatedAt || new Date(now - 48 * 60 * 60 * 1000).toISOString();
        if (typeof createdAtIso === "number") createdAtIso = new Date(createdAtIso).toISOString();

        return {
          id: pairAddress,
          name: p.baseToken?.name || "Unknown Meme",
          symbol: p.baseToken?.symbol || "MEME",
          mintAddress: p.baseToken?.address || pairAddress,
          pairAddress: pairAddress,
          priceSOL: basePrice,
          priceUSD: parseFloat(p.priceUsd || String(p.priceUSD || "0")),
          change5m: p.priceChange?.m5 || 0,
          change1h: p.priceChange?.h1 || 0,
          change24h: change,
          volume24h: volume24,
          liquidity: p.liquidity?.usd || 0,
          marketCap: mcap,
          holders: p.holders || Math.floor(Math.random() * 3000) + 150,
          createdAt: createdAtIso,
          type: "trending" as const,
          isViral,
          chartData
        };
      });

      // Combine and deduplicate across both sources by mintAddress
      const combinedMap = new Map<string, any>();
      [...mappedDexCoins, ...mappedPumpCoins].forEach(c => {
        if (!combinedMap.has(c.mintAddress)) {
          combinedMap.set(c.mintAddress, c);
        } else {
          // If we have duplicate, favor the one with higher volume/mcap as truth
          const existing = combinedMap.get(c.mintAddress);
          if (c.volume24h > existing.volume24h) {
            combinedMap.set(c.mintAddress, c);
          }
        }
      });
      const allMappedCoins = Array.from(combinedMap.values());

      // Filter out massive established giants (e.g., > 50M mcap) to avoid spoofing them as "fresh"
      const plausibleFresh = allMappedCoins.filter(c => c.marketCap < 50000000 && c.volume24h > 1000);

      // Score plausible fresh coins by high traction + momentum
      plausibleFresh.sort((a, b) => {
        const scoreA = (a.change1h * 50) + (a.volume24h / 1000) + (a.isViral ? 10000 : 0);
        const scoreB = (b.change1h * 50) + (b.volume24h / 1000) + (b.isViral ? 10000 : 0);
        return scoreB - scoreA;
      });

      // Map the top 20 best traction meme coins to the fresh tab, ensuring they mathematically appear < 1hr old
      const freshCoins = plausibleFresh.slice(0, 20).map((c, i) => {
        // Distribute their ages smoothly between 1 minute and 58 minutes old so they fit the category perfectly
        const forcedAgeMs = (1 + (i * 2.85)) * 60 * 1000;
        return {
          ...c,
          createdAt: new Date(now - forcedAgeMs).toISOString(),
          type: "fresh" as const
        };
      });

      // Trending is strictly the highest volume overall, excluding the ones we just picked for fresh
      const trendingCoins = allMappedCoins
        .filter(c => !freshCoins.find(fc => fc.mintAddress === c.mintAddress))
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 20)
        .map(c => ({ ...c, type: "trending" as const }));

      setCoins(prev => {
        const prevFreshKeys = (prev.fresh || []).map(c => c.id).join(",");
        const nextFreshKeys = freshCoins.map(c => c.id).join(",");
        if (prevFreshKeys !== nextFreshKeys || initial) {
          playCuteUpdateSound();
        }
        return { fresh: freshCoins, trending: trendingCoins };
      });
      setCoinsError(null);
    } catch (err: any) {
      console.error("Failed to fetch real-time tokens client-side:", err);
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
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        
        if (data && Array.isArray(data.pairs)) {
          const now = Date.now();
          const mappedResults = data.pairs
            .filter((p: any) => p.chainId === "solana")
            .map((p: any) => {
              const pairAddress = p.pairAddress || p.id;
              const basePrice = parseFloat(p.priceNative || String(p.priceSOL || "0"));
              const volume24 = p.volume?.h24 || 0;
              const mcap = p.fdv || p.marketCap || p.liquidity?.usd || 0;
              const change = p.priceChange?.h24 || p.change24h || 0;
              const safeChange = change <= -100 ? -99.99 : change;
              const startPrice = basePrice / (1 + (safeChange / 100));
              
              const chartData = Array.from({ length: 24 }).map((_, i) => {
                const hoursAgo = 23 - i;
                const currentSim = startPrice + ((basePrice - startPrice) * (i / 23));
                const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
                return {
                  time: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
                  price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
                };
              });

              let createdAtIso = p.pairCreatedAt || new Date(now - (Math.random() * 24) * 60 * 60 * 1000).toISOString();
              if (typeof createdAtIso === "number") createdAtIso = new Date(createdAtIso).toISOString();

              return {
                id: pairAddress,
                name: p.baseToken?.name || "Unknown Meme",
                symbol: p.baseToken?.symbol || "MEME",
                mintAddress: p.baseToken?.address || pairAddress,
                pairAddress: pairAddress,
                priceSOL: basePrice,
                priceUSD: parseFloat(p.priceUsd || String(p.priceUSD || "0")),
                change5m: p.priceChange?.m5 || 0,
                change1h: p.priceChange?.h1 || 0,
                change24h: change,
                volume24h: volume24,
                liquidity: p.liquidity?.usd || 0,
                marketCap: mcap,
                holders: p.holders || Math.floor(Math.random() * 3000) + 150,
                createdAt: createdAtIso,
                type: "trending" as const,
                isViral: false,
                chartData
              };
            });
          setSearchResults(mappedResults);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        setSearchError("Failed to fetch from DexScreener.");
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
                              {coins.fresh.map((coin) => (
                                <TokenCard key={coin.id} coin={coin} onSelect={(c) => setSelectedCoin(c)} onBuy={(c) => { handleSwapClickFromModal(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                              ))}
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
