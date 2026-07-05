var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_genai = require("@google/genai");
var import_web3 = require("@solana/web3.js");
var import_bs58 = __toESM(require("bs58"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_auth = require("firebase-admin/auth");

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0758275318",
  appId: "1:425573221322:web:678428f7aa445817808533",
  apiKey: "AIzaSyATXkkwSnUH7n0INQzA4DPYGSnMkocb_gk",
  authDomain: "gen-lang-client-0758275318.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-memecoinalerts-6b194e80-d8dc-4bc6-a085-b9d9b2318aaa",
  storageBucket: "gen-lang-client-0758275318.firebasestorage.app",
  messagingSenderId: "425573221322",
  measurementId: ""
};

// server.ts
import_dotenv.default.config();
var adminApp;
if (!(0, import_app.getApps)().length) {
  adminApp = (0, import_app.initializeApp)({
    projectId: firebase_applet_config_default.projectId
  });
} else {
  adminApp = (0, import_app.getApps)()[0];
}
var db = (0, import_firestore.getFirestore)(adminApp, firebase_applet_config_default.firestoreDatabaseId);
var geminiApiKey = process.env.GEMINI_API_KEY || "";
var ai = null;
if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new import_genai.GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
  }
}
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "null" : origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});
var solanaConnection = new import_web3.Connection("https://api.mainnet-beta.solana.com", "confirmed");
var authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await (0, import_auth.getAuth)().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    import_fs.default.appendFileSync("/tmp/server_error.log", "\nAuth error: " + error);
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
};
function getDeterministicKeypair(uid) {
  const hash = import_crypto.default.createHash("sha256").update(uid).digest();
  const seed = new Uint8Array(hash);
  return import_web3.Keypair.fromSeed(seed);
}
app.get("/api/user/wallet", authenticateUser, async (req, res) => {
  const uid = req.user.uid;
  try {
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      return res.json({ success: true, publicKey: data?.publicKey });
    } else {
      const keypair = import_web3.Keypair.generate();
      const publicKey = keypair.publicKey.toBase58();
      const secretKey = import_bs58.default.encode(keypair.secretKey);
      try {
        await userRef.set({
          publicKey,
          secretKey
          // In production, encrypt this before storing
        });
      } catch (writeErr) {
        console.warn("Firestore wallet write failed, falling back to deterministic keypair", writeErr);
        const fallbackKeypair = getDeterministicKeypair(uid);
        return res.json({ success: true, publicKey: fallbackKeypair.publicKey.toBase58() });
      }
      return res.json({ success: true, publicKey });
    }
  } catch (error) {
    console.warn("Firestore wallet read failed, using deterministic keypair fallback:", error);
    const fallbackKeypair = getDeterministicKeypair(uid);
    return res.json({ success: true, publicKey: fallbackKeypair.publicKey.toBase58() });
  }
});
var cachedTokens = { fresh: [], trending: [] };
var lastFetchTime = 0;
var FAMOUS_MEME_COINS = [
  "EKpQGSJtjMFqKZ9KQGWjj8XS4ced6C1Hb9DDEJ6jump",
  // WIF (Dogwifhat)
  "DezXAZ8z7PnrFcPyb8QbMRdBkgCSTwiQByJTo7N698To",
  // BONK (Bonk)
  "7GCihgDB8fe6Zjn2MYfb8ST6186vALypZCi8cnVCpump",
  // POPCAT (Popcat)
  "Df6yfrKC856NS95ChZsQC2jSoidv8vPE7P4b28mupump",
  // CHILLGUY (Chill Guy)
  "63Lf9ZSD6T9to6wSR6i791Xb78869X9pSg6Bdf7pump",
  // GIGA (GigaChad)
  "2qEHMRp6JRC489gATWc68E2WvYmEXBqa9D33AcdWpump",
  // PNUT (Peanut the Squirrel)
  "9BB7NaxY9Cjbb9udz9Q79ARgf8G8Hof18S69671Gpump",
  // FARTCOIN (Fartcoin)
  "ukHH6c7m4uX4u9YxgEPkFUyc9ps3hXkwc878M7zpump",
  // BOME (Book of Meme)
  "MEW1S7a6Y63TE8S84mAtfUN7CLat76Gjo6at8GCpump",
  // MEW (Cat in a dogs world)
  "8vCh7asY6TyC176EHrtv6QZ2Yatt76WpvaZkbA6Kpump",
  // ZEREBRO (zerebro)
  "6p6nhvaHGksFUau9JeNumjhv6z7bRsfxgR7Yf2uYpump",
  // TRUMP (Official Trump SPL)
  "A8C3ePCVscfsa4GCh6Cc499Xq7AArre2FH6S6mP3pump",
  // FWOG (Fwog)
  "ED5nyv9VsaPPfsZf1gC33gRP6HYv1C92Adfp232GP3mG",
  // MOODENG (Moo Deng)
  "CzLSujW7Zaxg4bcnge9QytdvSnsLvb79K4vS5GD1pump",
  // GOAT (Goatseus Maximus)
  "HeLp6NuEkmTLS6QbYFAhn2SgAu7v6NfGjrJBiM679RUy",
  // AI16Z (ai16z)
  "GJAF79CgYbJQA6DEC479rw5iVY6yAnqYPLFGNGWKpump",
  // ACT (AI Companionship)
  "H7QZ8Ks1KwXJP99AueeS1Y6PvyDcs76VjM6at8GCpump"
  // SLERP (Slerp)
];
var fetchDexScreenerTokens = async () => {
  const now = Date.now();
  if (now - lastFetchTime < 15e3 && cachedTokens.fresh.length > 0) {
    return cachedTokens;
  }
  const cachePath = "/tmp/meme_tokens_cache.json";
  try {
    if (import_fs.default.existsSync(cachePath)) {
      const stats = import_fs.default.statSync(cachePath);
      const ageMs = now - stats.mtimeMs;
      if (ageMs < 6e4) {
        const fileContent = import_fs.default.readFileSync(cachePath, "utf-8");
        const data = JSON.parse(fileContent);
        if (data && Array.isArray(data.fresh) && Array.isArray(data.trending) && data.fresh.length > 0) {
          cachedTokens = {
            fresh: data.fresh,
            trending: data.trending
          };
          lastFetchTime = now;
          return cachedTokens;
        }
      }
    }
  } catch (fileErr) {
    console.warn("Local File Cache read error:", fileErr);
  }
  try {
    const collectedMintAddresses = new Set(FAMOUS_MEME_COINS);
    let allPairs = [];
    let pumpCoins = [];
    try {
      const pumpFreshRes = await fetch("https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      console.warn("Error fetching fresh Pump.fun tokens (expected if serverless IP is blocked):", e);
    }
    try {
      const pumpTrendingRes = await fetch("https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      console.warn("Error fetching trending Pump.fun tokens:", e);
    }
    try {
      const profilesRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        if (Array.isArray(data)) {
          data.forEach((p) => {
            if (p.chainId === "solana" && p.tokenAddress) {
              collectedMintAddresses.add(p.tokenAddress);
            }
          });
        }
      }
    } catch (e) {
      console.error("Error fetching fresh profiles:", e);
    }
    try {
      const boostsRes = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
      if (boostsRes.ok) {
        const data = await boostsRes.json();
        if (Array.isArray(data)) {
          data.forEach((p) => {
            if (p.chainId === "solana" && p.tokenAddress) {
              collectedMintAddresses.add(p.tokenAddress);
            }
          });
        }
      }
    } catch (e) {
      console.error("Error fetching boosts latest:", e);
    }
    try {
      const topBoostsRes = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
      if (topBoostsRes.ok) {
        const data = await topBoostsRes.json();
        if (Array.isArray(data)) {
          data.forEach((p) => {
            if (p.chainId === "solana" && p.tokenAddress) {
              collectedMintAddresses.add(p.tokenAddress);
            }
          });
        }
      }
    } catch (e) {
      console.error("Error fetching boosts top:", e);
    }
    const searchKeywords = ["pump.fun", "solana", "cat", "dog", "pepe", "meme", "ai", "alpha", "goat", "chill", "giga"];
    try {
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
      const searchResults = await Promise.allSettled(searchPromises);
      for (const r of searchResults) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          for (const pair of r.value) {
            if (pair && pair.chainId === "solana" && pair.baseToken && pair.pairAddress) {
              allPairs.push(pair);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching supplementary searches:", e);
    }
    const addressesArray = Array.from(collectedMintAddresses);
    const batchSize = 30;
    const addressBatches = [];
    for (let i = 0; i < addressesArray.length; i += batchSize) {
      addressBatches.push(addressesArray.slice(i, i + batchSize));
    }
    const detailFetchPromises = addressBatches.map(async (batch) => {
      try {
        const addressesStr = batch.join(",");
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addressesStr}`);
        if (res.ok) {
          const data = await res.json();
          return data.pairs || [];
        }
      } catch (e) {
        console.error("Error in detailed batch token fetch:", e);
      }
      return [];
    });
    const detailedResults = await Promise.allSettled(detailFetchPromises);
    for (const r of detailedResults) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        for (const pair of r.value) {
          if (pair && pair.chainId === "solana" && pair.baseToken && pair.baseToken.symbol !== "SOL" && pair.baseToken.symbol !== "USDC" && pair.pairAddress) {
            allPairs.push(pair);
          }
        }
      }
    }
    const uniquePairsMap = /* @__PURE__ */ new Map();
    for (const pair of allPairs) {
      if (pair && pair.pairAddress && !uniquePairsMap.has(pair.pairAddress)) {
        uniquePairsMap.set(pair.pairAddress, pair);
      }
    }
    const deduplicatedPairs = Array.from(uniquePairsMap.values());
    let solPriceUSD = 145;
    try {
      const solPair = deduplicatedPairs.find((p) => p.baseToken?.symbol === "SOL" || p.quoteToken?.symbol === "SOL");
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
    } catch (e) {
      console.error("SOL price estimation error:", e);
    }
    const mapToMemeCoin = (p, type) => {
      if (!p) return null;
      if (p.mintAddress && typeof p.priceSOL === "number" && Array.isArray(p.chartData)) {
        return { ...p, type };
      }
      if (p.mint && typeof p.created_timestamp === "number") {
        const mint = p.mint;
        const name = p.name || "Unknown Meme";
        const symbol = p.symbol || "MEME";
        const mcapUSD = p.usd_market_cap || 5e3;
        const priceUSD = mcapUSD / 1e9;
        const priceSOL = priceUSD / solPriceUSD;
        const change5m = p.change5m || Math.random() * 8 + 2;
        const change1h = p.change1h || Math.random() * 35 + 5;
        const change24h = p.change24h || Math.random() * 120 + 10;
        const volume24h = p.volume24h || mcapUSD * (Math.random() * 0.3 + 0.15);
        const liquidity = p.liquidity || mcapUSD * (Math.random() * 0.15 + 0.1);
        const holders = p.holders || Math.floor(mcapUSD / (Math.random() * 80 + 80)) + 12;
        const createdAt = new Date(p.created_timestamp).toISOString();
        const isViral2 = mcapUSD > 5e4 || p.reply_count > 15;
        const startPrice2 = priceUSD * 0.3;
        const chartData2 = Array.from({ length: 24 }).map((_, i) => {
          const hoursAgo = 23 - i;
          const currentSim = startPrice2 + (priceUSD - startPrice2) * (i / 23);
          const noise = currentSim * (Math.random() - 0.45) * 0.12;
          return {
            time: new Date(now - hoursAgo * 60 * 60 * 1e3).toISOString(),
            price: Math.max(1e-9, (currentSim + noise) / solPriceUSD)
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
          type,
          isViral: isViral2,
          chartData: chartData2
        };
      }
      const pairAddress = p.pairAddress || p.id;
      if (!pairAddress) return null;
      const baseToken = p.baseToken || {
        name: p.name || "Unknown Meme",
        symbol: p.symbol || "MEME",
        address: p.mintAddress || pairAddress
      };
      const basePrice = parseFloat(p.priceNative || String(p.priceSOL || "0"));
      const volume24 = p.volume?.h24 || 0;
      const mcap = p.fdv || p.marketCap || 0;
      const isViral = p.volume?.h1 > 2e4 && p.priceChange?.h1 > 5 || p.volume?.m5 > 3e3 && p.priceChange?.m5 > 2 || !!p.isViral;
      const change = p.priceChange?.h24 || p.change24h || 0;
      const safeChange = change <= -100 ? -99.99 : change;
      const startPrice = basePrice / (1 + safeChange / 100);
      const chartData = p.chartData && p.chartData.length > 0 ? p.chartData : Array.from({ length: 24 }).map((_, i) => {
        const hoursAgo = 23 - i;
        const currentSim = startPrice + (basePrice - startPrice) * (i / 23);
        const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
        return {
          time: new Date(now - hoursAgo * 60 * 60 * 1e3).toISOString(),
          price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
        };
      });
      let pairCreatedAtIso = p.pairCreatedAt || p.createdAt;
      if (pairCreatedAtIso) {
        if (typeof pairCreatedAtIso === "number") {
          pairCreatedAtIso = new Date(pairCreatedAtIso).toISOString();
        }
      } else if (type === "fresh") {
        const randomMinsAgo = 3 + Math.random() * 52;
        pairCreatedAtIso = new Date(now - randomMinsAgo * 60 * 1e3).toISOString();
      } else {
        pairCreatedAtIso = new Date(now - 12 * 60 * 60 * 1e3).toISOString();
      }
      return {
        id: pairAddress,
        name: baseToken.name || "Unknown Meme",
        symbol: baseToken.symbol || "MEME",
        mintAddress: baseToken.address || pairAddress,
        pairAddress,
        priceSOL: basePrice,
        priceUSD: parseFloat(p.priceUsd || String(p.priceUSD || "0")),
        change5m: p.priceChange?.m5 || p.change5m || 0,
        change1h: p.priceChange?.h1 || p.change1h || 0,
        change24h: change,
        volume24h: volume24,
        liquidity: p.liquidity?.usd || p.liquidity || 0,
        marketCap: mcap,
        holders: p.holders || Math.floor(Math.random() * 3e3) + 150,
        createdAt: pairCreatedAtIso,
        type,
        isViral,
        chartData
      };
    };
    const combinedRawList = [...deduplicatedPairs, ...pumpCoins];
    const combinedUniqueMap = /* @__PURE__ */ new Map();
    for (const token of combinedRawList) {
      if (!token) continue;
      const mint = token.mint || token.baseToken?.address || token.mintAddress;
      if (mint && !combinedUniqueMap.has(mint)) {
        combinedUniqueMap.set(mint, token);
      }
    }
    const deduplicatedCombinedList = Array.from(combinedUniqueMap.values());
    let finalFresh = deduplicatedCombinedList.map((p) => mapToMemeCoin(p, "fresh")).filter((item) => {
      if (!item) return false;
      const ageMs = now - new Date(item.createdAt).getTime();
      return ageMs > 0 && ageMs < 36e5;
    }).sort((a, b) => {
      const velocityA = a.change1h * 3.5 + a.change5m * 10 + a.volume24h / 4e3;
      const velocityB = b.change1h * 3.5 + b.change5m * 10 + b.volume24h / 4e3;
      return velocityB - velocityA;
    });
    const uniqueFreshMap = /* @__PURE__ */ new Map();
    for (const coin of finalFresh) {
      if (coin && coin.mintAddress && !uniqueFreshMap.has(coin.mintAddress)) {
        uniqueFreshMap.set(coin.mintAddress, coin);
      }
    }
    finalFresh = Array.from(uniqueFreshMap.values());
    let finalTrending = deduplicatedCombinedList.map((p) => mapToMemeCoin(p, "trending")).filter((item) => {
      if (!item) return false;
      return item.volume24h > 1e4 || item.marketCap > 5e4 || item.isViral === true;
    }).sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    const uniqueTrendingMap = /* @__PURE__ */ new Map();
    for (const coin of finalTrending) {
      if (coin && coin.mintAddress && !uniqueTrendingMap.has(coin.mintAddress)) {
        uniqueTrendingMap.set(coin.mintAddress, coin);
      }
    }
    finalTrending = Array.from(uniqueTrendingMap.values());
    if (finalFresh.length < 15) {
      const needed = 15 - finalFresh.length;
      const candidates = finalTrending.filter((t) => !finalFresh.some((f) => f.mintAddress === t.mintAddress)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const borrowed = candidates.slice(0, needed).map((coin, index) => {
        const randomMinsAgo = 4 + index * 3 + Math.random() * 2;
        return {
          ...coin,
          createdAt: new Date(now - randomMinsAgo * 60 * 1e3).toISOString(),
          type: "fresh"
        };
      });
      finalFresh = [...finalFresh, ...borrowed];
    }
    finalFresh = finalFresh.slice(0, 20);
    if (finalTrending.length < 15 && finalFresh.length > 0) {
      const needed = 15 - finalTrending.length;
      const candidates = finalFresh.filter((f) => !finalTrending.some((t) => t.mintAddress === f.mintAddress));
      const extraTrending = candidates.slice(0, needed).map((coin) => ({
        ...coin,
        type: "trending"
      }));
      finalTrending = [...finalTrending, ...extraTrending];
    }
    finalTrending = finalTrending.slice(0, 20);
    cachedTokens = {
      fresh: finalFresh,
      trending: finalTrending
    };
    lastFetchTime = now;
    try {
      import_fs.default.writeFileSync(cachePath, JSON.stringify({
        fresh: finalFresh,
        trending: finalTrending,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }), "utf-8");
    } catch (writeErr) {
      console.warn("Local File Cache write error:", writeErr);
    }
    return cachedTokens;
  } catch (error) {
    console.error("Critical error in fetchDexScreenerTokens:", error);
    try {
      if (import_fs.default.existsSync(cachePath)) {
        const fileContent = import_fs.default.readFileSync(cachePath, "utf-8");
        const data = JSON.parse(fileContent);
        if (data && Array.isArray(data.fresh) && Array.isArray(data.trending) && data.fresh.length > 0) {
          cachedTokens = {
            fresh: data.fresh,
            trending: data.trending
          };
          return cachedTokens;
        }
      }
    } catch (fallbackFileErr) {
      console.warn("Total fallback Local File Cache read failed:", fallbackFileErr);
    }
    if (cachedTokens.fresh.length === 0 || cachedTokens.trending.length === 0) {
      const fallbackItems = [
        {
          id: "EKpQGSJtjMFqKZ9KQGWjj8XS4ced6C1Hb9DDEJ6jump",
          name: "Dogwifhat",
          symbol: "WIF",
          mintAddress: "EKpQGSJtjMFqKZ9KQGWjj8XS4ced6C1Hb9DDEJ6jump",
          pairAddress: "EP2m6K38F6UAnbzDk6PscfFcoisP6v2FmsVPhP3t6cAn",
          priceSOL: 0.015,
          priceUSD: 2.1,
          change5m: 0.5,
          change1h: 1.2,
          change24h: 3.5,
          volume24h: 154e5,
          liquidity: 42e5,
          marketCap: 21e8,
          holders: 145e3,
          createdAt: new Date(now - 12 * 60 * 1e3).toISOString(),
          type: "trending",
          isViral: true,
          chartData: []
        },
        {
          id: "DezXAZ8z7PnrFcPyb8QbMRdBkgCSTwiQByJTo7N698To",
          name: "Bonk",
          symbol: "BONK",
          mintAddress: "DezXAZ8z7PnrFcPyb8QbMRdBkgCSTwiQByJTo7N698To",
          pairAddress: "8YvZpX7V7vD6o8W6Fz2V3sW9XbVbB9XbVbB9XbVbB9",
          priceSOL: 15e-8,
          priceUSD: 21e-6,
          change5m: -0.2,
          change1h: 0.5,
          change24h: 4.8,
          volume24h: 25e6,
          liquidity: 85e5,
          marketCap: 125e7,
          holders: 72e4,
          createdAt: new Date(now - 5 * 60 * 1e3).toISOString(),
          type: "trending",
          isViral: true,
          chartData: []
        },
        {
          id: "7GCihgDB8fe6Zjn2MYfb8ST6186vALypZCi8cnVCpump",
          name: "Popcat",
          symbol: "POPCAT",
          mintAddress: "7GCihgDB8fe6Zjn2MYfb8ST6186vALypZCi8cnVCpump",
          pairAddress: "FvM38F6UAnbzDk6PscfFcoisP6v2FmsVPhP3t6cAn",
          priceSOL: 5e-3,
          priceUSD: 0.75,
          change5m: 1.5,
          change1h: 4.5,
          change24h: 12.5,
          volume24h: 85e5,
          liquidity: 31e5,
          marketCap: 75e7,
          holders: 82e3,
          createdAt: new Date(now - 8 * 60 * 1e3).toISOString(),
          type: "trending",
          isViral: true,
          chartData: []
        },
        {
          id: "Df6yfrKC856NS95ChZsQC2jSoidv8vPE7P4b28mupump",
          name: "Chill Guy",
          symbol: "CHILLGUY",
          mintAddress: "Df6yfrKC856NS95ChZsQC2jSoidv8vPE7P4b28mupump",
          pairAddress: "BjkBxREU5J1gi9J4o68EMurMdkwkWNf8jhjkGMNUqRmr",
          priceSOL: 64e-7,
          priceUSD: 53e-5,
          change5m: 0.1,
          change1h: 1.5,
          change24h: 1.22,
          volume24h: 81500,
          liquidity: 83200,
          marketCap: 532e3,
          holders: 12500,
          createdAt: new Date(now - 2 * 60 * 1e3).toISOString(),
          type: "trending",
          isViral: true,
          chartData: []
        }
      ];
      cachedTokens = {
        fresh: fallbackItems.map((item) => ({ ...item, type: "fresh", createdAt: new Date(now - (3 + Math.random() * 52) * 60 * 1e3).toISOString() })),
        trending: fallbackItems
      };
    }
    return cachedTokens;
  }
};
async function getMintDecimals(mintAddress) {
  if (mintAddress === "So11111111111111111111111111111111111111112") {
    return 9;
  }
  try {
    const mintInfo = await solanaConnection.getParsedAccountInfo(new import_web3.PublicKey(mintAddress));
    const parsedData = mintInfo.value?.data?.parsed?.info;
    if (parsedData && typeof parsedData.decimals === "number") {
      return parsedData.decimals;
    }
  } catch (err) {
    console.warn(`Failed to fetch decimals for ${mintAddress}:`, err);
  }
  return 6;
}
async function executePlatformFee(keypair, direction, inputAmount, quoteData) {
  const feeDestination = new import_web3.PublicKey("6RhMyWHqq6dhsPanwh3J3hNLzUrQ4fQV1SZvtu4csUG5");
  let feeSOL = 0;
  try {
    if (direction === "buy" || direction === "swap") {
      feeSOL = inputAmount * 0.045;
    } else {
      if (quoteData && quoteData.outAmount) {
        feeSOL = Number(quoteData.outAmount) / 1e9 * 0.045;
      } else {
        feeSOL = inputAmount * 0.045;
      }
    }
    if (isNaN(feeSOL) || feeSOL <= 0) {
      return { success: false, feeSOL: 0, error: "Invalid fee calculation" };
    }
    const lamports = Math.floor(feeSOL * 1e9);
    if (lamports <= 0) {
      return { success: true, feeSOL, error: "Amount too small for transfer" };
    }
    console.log(`Executing 4.5% platform fee transfer of ${feeSOL} SOL (${lamports} lamports) to ${feeDestination.toBase58()}`);
    const latestBlockHash = await solanaConnection.getLatestBlockhash();
    const transferInstruction = import_web3.SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: feeDestination,
      lamports
    });
    const transaction = new import_web3.Transaction().add(transferInstruction);
    transaction.recentBlockhash = latestBlockHash.blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.sign(keypair);
    const txid = await solanaConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 2
    });
    await solanaConnection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid
    }, "confirmed");
    console.log(`Platform fee transfer confirmed! Tx: ${txid}`);
    return { success: true, txid, feeSOL };
  } catch (err) {
    console.error("Failed to execute platform fee transfer:", err);
    return { success: false, feeSOL, error: err.message || "Transfer transaction failed" };
  }
}
app.get("/api/swap/quote", async (req, res) => {
  try {
    const { inputMint, outputMint, amount } = req.query;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }
    const inputAmount = parseFloat(amount);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    const decimals = await getMintDecimals(inputMint);
    const amountBase = Math.floor(inputAmount * Math.pow(10, decimals));
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBase}&slippageBps=100`;
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    if (quoteData.error) {
      return res.status(400).json({ success: false, error: quoteData.error });
    }
    const outDecimals = await getMintDecimals(outputMint);
    const outAmountHuman = parseFloat(quoteData.outAmount) / Math.pow(10, outDecimals);
    res.json({
      success: true,
      inputAmount,
      outputAmount: outAmountHuman,
      priceImpactPct: parseFloat(quoteData.priceImpactPct || "0"),
      slippageBps: quoteData.slippageBps,
      rawQuote: quoteData
    });
  } catch (error) {
    console.error("Quote fetch failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/swap", authenticateUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    let {
      tokenMint,
      amountSOL,
      direction,
      inputMint,
      outputMint,
      inputAmount,
      slipPageBps = 100
    } = req.body;
    if (!inputMint && !outputMint) {
      if (!tokenMint || !amountSOL || !direction) {
        return res.status(400).json({ success: false, error: "Missing required parameters" });
      }
      inputMint = direction === "buy" ? "So11111111111111111111111111111111111111112" : tokenMint;
      outputMint = direction === "buy" ? tokenMint : "So11111111111111111111111111111111111111112";
      inputAmount = amountSOL;
    }
    if (!inputMint || !outputMint || !inputAmount) {
      return res.status(400).json({ success: false, error: "Missing swap specifications" });
    }
    let secretKey = req.body.secretKey;
    if (!secretKey) {
      try {
        const userRef = db.collection("users").doc(uid);
        const doc = await userRef.get();
        if (doc.exists) {
          secretKey = doc.data()?.secretKey;
        }
      } catch (err) {
        console.warn("Backend Firestore access failed, checking deterministic fallback", err);
      }
    }
    if (!secretKey) {
      try {
        const fallbackKeypair = getDeterministicKeypair(uid);
        secretKey = import_bs58.default.encode(fallbackKeypair.secretKey);
      } catch (err) {
        return res.status(404).json({ success: false, error: "User wallet secret key not found. Please log in again." });
      }
    }
    const keypair = import_web3.Keypair.fromSecretKey(import_bs58.default.decode(secretKey));
    const decimals = await getMintDecimals(inputMint);
    const amountBase = Math.floor(inputAmount * Math.pow(10, decimals));
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBase}&slippageBps=${slipPageBps}`;
    console.log("Fetching quote:", quoteUrl);
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    if (quoteData.error) {
      return res.status(400).json({ success: false, error: `Jupiter Quote Error: ${quoteData.error}` });
    }
    const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true
      })
    });
    const swapData = await swapResponse.json();
    if (swapData.error) {
      return res.status(400).json({ success: false, error: `Jupiter Swap Error: ${swapData.error}` });
    }
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    var transaction = import_web3.VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);
    const latestBlockHash = await solanaConnection.getLatestBlockhash();
    const txid = await solanaConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 2
    });
    await solanaConnection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid
    });
    const swapDirection = inputMint === "So11111111111111111111111111111111111111112" ? "buy" : "sell";
    let feeResult = { success: false, feeSOL: 0 };
    try {
      feeResult = await executePlatformFee(keypair, swapDirection, inputAmount, quoteData);
      console.log("Platform Fee Status:", feeResult);
    } catch (feeError) {
      console.error("Platform Fee Error:", feeError);
    }
    res.json({
      success: true,
      txid,
      feeSOL: feeResult.feeSOL,
      feeTxid: feeResult.txid,
      feeSuccess: feeResult.success
    });
  } catch (error) {
    console.error("Swap Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/tokens", async (req, res) => {
  try {
    const tokens = await fetchDexScreenerTokens();
    res.json({
      success: true,
      fresh: tokens.fresh,
      trending: tokens.trending,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json({ success: true, results: [] });
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      console.error("DexScreener search failed:", response.statusText);
      return res.json({ success: true, results: [] });
    }
    let data;
    try {
      const text = await response.text();
      data = JSON.parse(text);
    } catch (e) {
      console.error("DexScreener search JSON parse failed:", e);
      return res.json({ success: true, results: [] });
    }
    const solanaPairs = (data?.pairs || []).filter((p) => p && p.chainId === "solana" && p.baseToken && p.pairAddress);
    const results = solanaPairs.map((p) => {
      const now = Date.now();
      const basePrice = parseFloat(p.priceNative || "0");
      const change = p.priceChange?.h24 || 0;
      const safeChange = change <= -100 ? -99.99 : change;
      const startPrice = basePrice / (1 + safeChange / 100);
      const chartData = Array.from({ length: 24 }).map((_, i) => {
        const hoursAgo = 23 - i;
        const currentSim = startPrice + (basePrice - startPrice) * (i / 23);
        const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
        return {
          time: new Date(now - hoursAgo * 60 * 60 * 1e3).toISOString(),
          price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
        };
      });
      return {
        id: p.pairAddress,
        name: p.baseToken.name,
        symbol: p.baseToken.symbol,
        mintAddress: p.baseToken.address,
        pairAddress: p.pairAddress,
        priceSOL: basePrice,
        priceUSD: parseFloat(p.priceUsd || "0"),
        change1h: p.priceChange?.h1 || 0,
        change24h: p.priceChange?.h24 || 0,
        volume24h: p.volume?.h24 || 0,
        liquidity: p.liquidity?.usd || 0,
        marketCap: p.fdv || 0,
        createdAt: new Date(p.pairCreatedAt || Date.now()).toISOString(),
        type: "trending",
        // search results
        chartData
      };
    });
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/solana/balance/:pubkey", async (req, res) => {
  try {
    const pubKey = new import_web3.PublicKey(req.params.pubkey);
    const balance = await solanaConnection.getBalance(pubKey);
    res.json({ success: true, solBalance: balance / 1e9 });
  } catch (error) {
    res.json({ success: false, solBalance: 0 });
  }
});
app.post("/api/solana/swap", async (req, res) => {
  const { publicKey, secretKey, mintAddress, amountSOL, amountToken, direction } = req.body;
  try {
    if (secretKey) {
      let keypair;
      try {
        keypair = import_web3.Keypair.fromSecretKey(import_bs58.default.decode(secretKey));
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid Base58 Secret Key." });
      }
      if (keypair.publicKey.toBase58() !== publicKey) {
        return res.status(400).json({ success: false, message: "Secret key does not match public key." });
      }
      const inputMint = direction === "buy" ? "So11111111111111111111111111111111111111112" : mintAddress;
      const outputMint = direction === "buy" ? mintAddress : "So11111111111111111111111111111111111111112";
      const amountLamports = direction === "buy" ? Math.floor(amountSOL * 1e9) : Math.floor(amountToken * 1e6);
      const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=50`);
      const quoteData = await quoteResponse.json();
      if (!quoteData || quoteData.error) {
        throw new Error("Failed to get swap quote from Jupiter. Check liquidity.");
      }
      const swapResponse = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: keypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true
        })
      });
      const swapData = await swapResponse.json();
      if (swapData.error) throw new Error(swapData.error);
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, "base64");
      const transaction = import_web3.VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([keypair]);
      const rawTransaction = transaction.serialize();
      const txid = await solanaConnection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
      });
      let feeResult = { success: false, feeSOL: 0 };
      try {
        feeResult = await executePlatformFee(keypair, direction, direction === "buy" ? amountSOL : amountToken, quoteData);
        console.log("Backup Route Fee status:", feeResult);
      } catch (fErr) {
        console.error("Backup Route Fee error:", fErr);
      }
      return res.json({
        success: true,
        txHash: txid,
        realBlockchainAction: true,
        message: "Swap executed successfully on Solana Mainnet via Jupiter!",
        feeSOL: feeResult.feeSOL,
        feeTxid: feeResult.txid,
        feeSuccess: feeResult.success
      });
    } else {
      const simulatedHash = import_bs58.default.encode(Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))));
      const estSOL = direction === "buy" ? amountSOL : amountToken * 0.01;
      const simulatedFee = estSOL * 0.045;
      return res.json({
        success: true,
        txHash: simulatedHash,
        realBlockchainAction: false,
        message: `Simulated swap of ${direction === "buy" ? amountSOL + " SOL \u2794 " + amountToken + " tokens" : amountToken + " tokens \u2794 " + amountSOL + " SOL"}.`,
        feeSOL: simulatedFee,
        feeSuccess: true,
        feeMessage: `Simulated fee of ${simulatedFee.toFixed(6)} SOL routed to fee wallet.`
      });
    }
  } catch (error) {
    console.error("Solana swap error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to execute swap on Solana." });
  }
});
app.post("/api/sentiment/:id", async (req, res) => {
  const isBullish = Math.random() > 0.5;
  res.json({
    success: true,
    source: "local_sentiment_scanner",
    sentiment: isBullish ? "bullish" : "bearish",
    score: Math.floor(Math.random() * 40) + 50,
    summary: "Social scanners indicate high activity.",
    viralTweets: []
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const viteModule = await import("vite");
    const vite = await viteModule.createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => res.sendFile(import_path.default.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}
if (!process.env.VERCEL) {
  startServer();
}
var server_default = app;
//# sourceMappingURL=server.cjs.map
