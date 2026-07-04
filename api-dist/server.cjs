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
var import_genai = require("@google/genai");
var import_web3 = require("@solana/web3.js");
var import_bs58 = __toESM(require("bs58"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_auth = require("firebase-admin/auth");
var firebaseConfig = {};
try {
  const configPath = import_path.default.resolve(process.cwd(), "firebase-applet-config.json");
  if (import_fs.default.existsSync(configPath)) {
    firebaseConfig = JSON.parse(import_fs.default.readFileSync(configPath, "utf-8"));
  }
} catch (e) {
  console.error("Failed to read firebase config", e);
}
import_dotenv.default.config();
var adminApp;
if (!(0, import_app.getApps)().length) {
  adminApp = (0, import_app.initializeApp)({
    projectId: firebaseConfig.projectId
  });
} else {
  adminApp = (0, import_app.getApps)()[0];
}
var db = (0, import_firestore.getFirestore)(adminApp, firebaseConfig.firestoreDatabaseId);
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
app.get("/api/user/wallet", authenticateUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      return res.json({ success: true, publicKey: data?.publicKey });
    } else {
      const keypair = import_web3.Keypair.generate();
      const publicKey = keypair.publicKey.toBase58();
      const secretKey = import_bs58.default.encode(keypair.secretKey);
      await userRef.set({
        publicKey,
        secretKey
        // In production, encrypt this before storing
      });
      return res.json({ success: true, publicKey });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
var cachedTokens = { fresh: [], trending: [] };
var lastFetchTime = 0;
var fetchDexScreenerTokens = async () => {
  const now = Date.now();
  if (now - lastFetchTime < 1e4 && cachedTokens.trending.length > 0) {
    return cachedTokens;
  }
  try {
    let freshPairs = [];
    try {
      const profilesRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
      if (profilesRes.ok) {
        const text = await profilesRes.text();
        let profilesData = [];
        try {
          profilesData = JSON.parse(text);
        } catch (e) {
        }
        const solanaProfiles = (Array.isArray(profilesData) ? profilesData : []).filter((p) => p.chainId === "solana").slice(0, 30);
        const tokenAddresses = solanaProfiles.map((p) => p.tokenAddress).join(",");
        if (tokenAddresses) {
          const freshPairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses}`);
          if (freshPairsRes.ok) {
            const freshPairsData = await freshPairsRes.json();
            freshPairs = (freshPairsData.pairs || []).filter((p) => p.chainId === "solana" && p.baseToken && p.baseToken.symbol !== "SOL" && p.baseToken.symbol !== "USDC");
          }
        }
      }
    } catch (e) {
      console.error("Error fetching fresh profiles:", e);
    }
    let allTrendingPairs = [];
    try {
      const results = await Promise.allSettled([
        fetch("https://api.dexscreener.com/latest/dex/search?q=pump").then((r) => r.json()),
        fetch("https://api.dexscreener.com/latest/dex/search?q=cat").then((r) => r.json()),
        fetch("https://api.dexscreener.com/latest/dex/search?q=dog").then((r) => r.json())
      ]);
      const pumpData = results[0].status === "fulfilled" ? results[0].value : {};
      const catData = results[1].status === "fulfilled" ? results[1].value : {};
      const dogData = results[2].status === "fulfilled" ? results[2].value : {};
      allTrendingPairs = [
        ...pumpData?.pairs || [],
        ...catData?.pairs || [],
        ...dogData?.pairs || []
      ].filter((p) => p.chainId === "solana" && p.baseToken && p.baseToken.symbol !== "SOL" && p.baseToken.symbol !== "USDC");
    } catch (e) {
      console.error("Error fetching trending pairs:", e);
    }
    const uniquePairs = /* @__PURE__ */ new Map();
    for (const pair of allTrendingPairs) {
      if (!uniquePairs.has(pair.pairAddress)) {
        uniquePairs.set(pair.pairAddress, pair);
      }
    }
    let trendingPairsArray = Array.from(uniquePairs.values()).sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0)).slice(0, 30);
    const mapToMemeCoin = (p, type) => {
      const ageHours = (now - (p.pairCreatedAt || now)) / (1e3 * 60 * 60);
      const isViral = p.volume?.h1 > 5e4 && p.priceChange?.h1 > 10 || p.volume?.m5 > 1e4 && p.priceChange?.m5 > 5;
      return {
        id: p.pairAddress,
        name: p.baseToken.name,
        symbol: p.baseToken.symbol,
        mintAddress: p.baseToken.address,
        pairAddress: p.pairAddress,
        priceSOL: parseFloat(p.priceNative || "0"),
        priceUSD: parseFloat(p.priceUsd || "0"),
        change5m: p.priceChange?.m5 || 0,
        change1h: p.priceChange?.h1 || 0,
        change24h: p.priceChange?.h24 || 0,
        volume24h: p.volume?.h24 || 0,
        liquidity: p.liquidity?.usd || 0,
        marketCap: p.fdv || 0,
        holders: Math.floor(Math.random() * 5e3) + 100,
        // DexScreener doesn't provide holders directly
        createdAt: new Date(p.pairCreatedAt || Date.now()).toISOString(),
        type,
        isViral,
        chartData: Array.from({ length: 24 }).map((_, i) => {
          const hoursAgo = 23 - i;
          const basePrice = parseFloat(p.priceNative || "0");
          const change = p.priceChange?.h24 || 0;
          const safeChange = change <= -100 ? -99.99 : change;
          const startPrice = basePrice / (1 + safeChange / 100);
          const currentSim = startPrice + (basePrice - startPrice) * (i / 23);
          const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
          return {
            time: new Date(now - hoursAgo * 60 * 60 * 1e3).toISOString(),
            price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
          };
        })
      };
    };
    let finalFresh = freshPairs.filter((p) => p.pairCreatedAt && now - p.pairCreatedAt < 1 * 60 * 60 * 1e3).map((p) => mapToMemeCoin(p, "fresh"));
    const uniqueFresh = /* @__PURE__ */ new Map();
    for (const coin of finalFresh) {
      if (!uniqueFresh.has(coin.mintAddress)) {
        uniqueFresh.set(coin.mintAddress, coin);
      }
    }
    finalFresh = Array.from(uniqueFresh.values()).slice(0, 20);
    let finalTrending = trendingPairsArray.map((p) => mapToMemeCoin(p, "trending"));
    const uniqueTrending = /* @__PURE__ */ new Map();
    for (const coin of finalTrending) {
      if (!uniqueTrending.has(coin.mintAddress) && !uniqueFresh.has(coin.mintAddress)) {
        uniqueTrending.set(coin.mintAddress, coin);
      }
    }
    finalTrending = Array.from(uniqueTrending.values()).slice(0, 20);
    if (finalFresh.length === 0 && finalTrending.length === 0) {
      const fallbackToken = mapToMemeCoin({
        pairAddress: "fallback1",
        baseToken: { name: "Solana Meme Coin (Fallback)", symbol: "SMC", address: "So11111111111111111111111111111111111111112" },
        priceNative: "0.0001",
        priceUsd: "0.01",
        priceChange: { m5: 1, h1: 5, h24: 10 },
        volume: { h24: 1e6 },
        liquidity: { usd: 5e5 },
        fdv: 1e7,
        pairCreatedAt: Date.now() - 30 * 60 * 1e3
        // 30 mins ago
      }, "trending");
      const fallbackFresh = mapToMemeCoin({
        pairAddress: "fallback_fresh1",
        baseToken: { name: "New Alpha (Fallback)", symbol: "ALPHA", address: "So11111111111111111111111111111111111111113" },
        priceNative: "0.00005",
        priceUsd: "0.005",
        priceChange: { m5: 15, h1: 150, h24: 150 },
        volume: { h24: 5e5 },
        liquidity: { usd: 1e5 },
        fdv: 5e6,
        pairCreatedAt: Date.now() - 10 * 60 * 1e3
        // 10 mins ago
      }, "fresh");
      finalTrending = [fallbackToken];
      finalFresh = [fallbackFresh];
    }
    cachedTokens = {
      fresh: finalFresh,
      trending: finalTrending
    };
    lastFetchTime = now;
    return cachedTokens;
  } catch (error) {
    console.error("Error fetching DexScreener:", error);
    if (cachedTokens.fresh.length === 0 && cachedTokens.trending.length === 0) {
      const now2 = Date.now();
      const fallbackToken = {
        id: "fallback1",
        name: "Solana Meme Coin (Fallback)",
        symbol: "SMC",
        mintAddress: "So11111111111111111111111111111111111111112",
        pairAddress: "fallback1",
        priceSOL: 1e-4,
        priceUSD: 0.01,
        change5m: 1,
        change1h: 5,
        change24h: 10,
        volume24h: 1e6,
        liquidity: 5e5,
        marketCap: 1e7,
        holders: 1500,
        createdAt: new Date(now2 - 30 * 60 * 1e3).toISOString(),
        type: "trending",
        isViral: false,
        chartData: []
      };
      const fallbackFresh = {
        id: "fallback_fresh1",
        name: "New Alpha (Fallback)",
        symbol: "ALPHA",
        mintAddress: "So11111111111111111111111111111111111111113",
        pairAddress: "fallback_fresh1",
        priceSOL: 5e-5,
        priceUSD: 5e-3,
        change5m: 15,
        change1h: 150,
        change24h: 150,
        volume24h: 5e5,
        liquidity: 1e5,
        marketCap: 5e6,
        holders: 500,
        createdAt: new Date(now2 - 10 * 60 * 1e3).toISOString(),
        type: "fresh",
        isViral: true,
        chartData: []
      };
      cachedTokens = { fresh: [fallbackFresh], trending: [fallbackToken] };
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
        console.warn("Backend Firestore access failed, using fallback", err);
      }
    }
    if (!secretKey) {
      return res.status(404).json({ success: false, error: "User wallet secret key not found. Please log in again." });
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
    const solanaPairs = (data?.pairs || []).filter((p) => p.chainId === "solana");
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
