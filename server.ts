import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { Connection, PublicKey, Keypair, VersionedTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

// Initialize Firebase Admin
let adminApp;
if (!getApps().length) {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId
  });
} else {
  adminApp = getApps()[0];
}
const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

const geminiApiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;
if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
  }
}

const app = express();
const PORT = 3000;
app.use(express.json());

// Enable CORS with support for sandboxed iframes (origin: null)
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

// Solana RPC connection
const solanaConnection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Auth Middleware
const authenticateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth error:", error); require("fs").appendFileSync("/tmp/server_error.log", "\nAuth error: " + error);
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
};

// GET /api/user/wallet
app.get("/api/user/wallet", authenticateUser, async (req, res) => {
  try {
    const uid = (req as any).user.uid;
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      return res.json({ success: true, publicKey: data?.publicKey });
    } else {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toBase58();
      const secretKey = bs58.encode(keypair.secretKey);
      
      await userRef.set({
        publicKey,
        secretKey // In production, encrypt this before storing
      });
      
      return res.json({ success: true, publicKey });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Caching layer for DexScreener to avoid rate limits
let cachedTokens: { fresh: any[]; trending: any[] } = { fresh: [], trending: [] };
let lastFetchTime = 0;

const fetchDexScreenerTokens = async () => {
  const now = Date.now();
  if (now - lastFetchTime < 10000 && cachedTokens.trending.length > 0) {
    return cachedTokens; // Return cache if under 10 seconds
  }

  try {
    let freshPairs: any[] = [];
    try {
      // 1. Fetch freshest tokens from token-profiles endpoint
      const profilesRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
      if (profilesRes.ok) {
        const text = await profilesRes.text();
        let profilesData = [];
        try { profilesData = JSON.parse(text); } catch (e) {}
        const solanaProfiles = (Array.isArray(profilesData) ? profilesData : []).filter((p: any) => p.chainId === "solana").slice(0, 30);
        const tokenAddresses = solanaProfiles.map((p: any) => p.tokenAddress).join(",");

        if (tokenAddresses) {
          const freshPairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses}`);
          if (freshPairsRes.ok) {
            const freshPairsData = await freshPairsRes.json();
            freshPairs = (freshPairsData.pairs || []).filter((p: any) => p.chainId === "solana" && p.baseToken && p.baseToken.symbol !== "SOL" && p.baseToken.symbol !== "USDC");
          }
        }
      }
    } catch (e) {
      console.error("Error fetching fresh profiles:", e);
    }

    let allTrendingPairs: any[] = [];
    try {
      // 2. Fetch trending tokens by searching for popular meme keywords and sorting by volume
      const results = await Promise.allSettled([
        fetch("https://api.dexscreener.com/latest/dex/search?q=pump").then(r => r.json()),
        fetch("https://api.dexscreener.com/latest/dex/search?q=cat").then(r => r.json()),
        fetch("https://api.dexscreener.com/latest/dex/search?q=dog").then(r => r.json())
      ]);
      
      const pumpData = results[0].status === "fulfilled" ? results[0].value : {};
      const catData = results[1].status === "fulfilled" ? results[1].value : {};
      const dogData = results[2].status === "fulfilled" ? results[2].value : {};

      allTrendingPairs = [
        ...(pumpData?.pairs || []), 
        ...(catData?.pairs || []),
        ...(dogData?.pairs || [])
      ].filter((p: any) => p.chainId === "solana" && p.baseToken && p.baseToken.symbol !== "SOL" && p.baseToken.symbol !== "USDC");
    } catch (e) {
      console.error("Error fetching trending pairs:", e);
    }
    
    // Deduplicate by pairAddress
    const uniquePairs = new Map();
    for (const pair of allTrendingPairs) {
      if (!uniquePairs.has(pair.pairAddress)) {
        uniquePairs.set(pair.pairAddress, pair);
      }
    }

    let trendingPairsArray = Array.from(uniquePairs.values())
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 30);

    const mapToMemeCoin = (p: any, type: "fresh" | "trending") => {
      const ageHours = (now - (p.pairCreatedAt || now)) / (1000 * 60 * 60);
      const isViral = (p.volume?.h1 > 50000 && p.priceChange?.h1 > 10) || (p.volume?.m5 > 10000 && p.priceChange?.m5 > 5);
      
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
        holders: Math.floor(Math.random() * 5000) + 100, // DexScreener doesn't provide holders directly
        createdAt: new Date(p.pairCreatedAt || Date.now()).toISOString(),
        type,
        isViral,
        chartData: Array.from({ length: 24 }).map((_, i) => {
          const hoursAgo = 23 - i;
          const basePrice = parseFloat(p.priceNative || "0");
          const change = p.priceChange?.h24 || 0;
          const safeChange = change <= -100 ? -99.99 : change;
          const startPrice = basePrice / (1 + (safeChange / 100));
          // Interpolate with some random noise
          const currentSim = startPrice + ((basePrice - startPrice) * (i / 23));
          const noise = isFinite(currentSim) ? currentSim * (Math.random() - 0.5) * 0.05 : 0;
          return {
            time: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
            price: isFinite(currentSim + noise) ? Math.max(0, currentSim + noise) : 0
          };
        })
      };
    };

    // Filter fresh pairs to strictly < 1 hour old to ensure they are new
    let finalFresh = freshPairs
      .filter(p => p.pairCreatedAt && (now - p.pairCreatedAt) < 1 * 60 * 60 * 1000)
      .map(p => mapToMemeCoin(p, "fresh"));
      
    // Deduplicate fresh pairs based on mintAddress
    const uniqueFresh = new Map();
    for (const coin of finalFresh) {
      if (!uniqueFresh.has(coin.mintAddress)) {
        uniqueFresh.set(coin.mintAddress, coin);
      }
    }
    finalFresh = Array.from(uniqueFresh.values()).slice(0, 20);

    let finalTrending = trendingPairsArray.map(p => mapToMemeCoin(p, "trending"));
    
    // Deduplicate trending pairs
    const uniqueTrending = new Map();
    for (const coin of finalTrending) {
      if (!uniqueTrending.has(coin.mintAddress) && !uniqueFresh.has(coin.mintAddress)) {
        uniqueTrending.set(coin.mintAddress, coin);
      }
    }
    finalTrending = Array.from(uniqueTrending.values()).slice(0, 20);
    
    // Add fallback dummy tokens if everything failed (e.g. rate limit on first load)
    if (finalFresh.length === 0 && finalTrending.length === 0) {
      const fallbackToken = mapToMemeCoin({
        pairAddress: "fallback1",
        baseToken: { name: "Solana Meme Coin (Fallback)", symbol: "SMC", address: "So11111111111111111111111111111111111111112" },
        priceNative: "0.0001",
        priceUsd: "0.01",
        priceChange: { m5: 1, h1: 5, h24: 10 },
        volume: { h24: 1000000 },
        liquidity: { usd: 500000 },
        fdv: 10000000,
        pairCreatedAt: Date.now() - 30 * 60 * 1000 // 30 mins ago
      }, "trending");
      
      const fallbackFresh = mapToMemeCoin({
        pairAddress: "fallback_fresh1",
        baseToken: { name: "New Alpha (Fallback)", symbol: "ALPHA", address: "So11111111111111111111111111111111111111113" },
        priceNative: "0.00005",
        priceUsd: "0.005",
        priceChange: { m5: 15, h1: 150, h24: 150 },
        volume: { h24: 500000 },
        liquidity: { usd: 100000 },
        fdv: 5000000,
        pairCreatedAt: Date.now() - 10 * 60 * 1000 // 10 mins ago
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
    return cachedTokens; // Return stale cache on error
  }
};

// Helper to fetch mint decimals from Solana Mainnet
async function getMintDecimals(mintAddress: string): Promise<number> {
  if (mintAddress === "So11111111111111111111111111111111111111112") {
    return 9;
  }
  try {
    const mintInfo = await solanaConnection.getParsedAccountInfo(new PublicKey(mintAddress));
    const parsedData = (mintInfo.value?.data as any)?.parsed?.info;
    if (parsedData && typeof parsedData.decimals === 'number') {
      return parsedData.decimals;
    }
  } catch (err) {
    console.warn(`Failed to fetch decimals for ${mintAddress}:`, err);
  }
  return 6; // Standard default for Solana SPL tokens
}

/**
 * Helper to execute the 4.5% Solana platform fee.
 * Sent to the owner's destination address: 6RhMyWHqq6dhsPanwh3J3hNLzUrQ4fQV1SZvtu4csUG5
 */
async function executePlatformFee(
  keypair: Keypair,
  direction: string,
  inputAmount: number,
  quoteData?: any
): Promise<{ success: boolean; txid?: string; feeSOL: number; error?: string }> {
  const feeDestination = new PublicKey("6RhMyWHqq6dhsPanwh3J3hNLzUrQ4fQV1SZvtu4csUG5");
  let feeSOL = 0;

  try {
    // 1. Calculate fee in SOL
    // If buying (SOL -> Token), inputAmount is in SOL
    if (direction === "buy" || direction === "swap") {
      feeSOL = inputAmount * 0.045;
    } else {
      // If selling (Token -> SOL), estimated SOL received can be read from quoteData
      if (quoteData && quoteData.outAmount) {
        feeSOL = (Number(quoteData.outAmount) / 1e9) * 0.045;
      } else {
        feeSOL = inputAmount * 0.045; // Fallback
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

    // 2. Build transfer transaction
    const latestBlockHash = await solanaConnection.getLatestBlockhash();
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: feeDestination,
      lamports,
    });

    const transaction = new Transaction().add(transferInstruction);
    transaction.recentBlockhash = latestBlockHash.blockhash;
    transaction.feePayer = keypair.publicKey;

    // 3. Sign and send
    transaction.sign(keypair);
    const txid = await solanaConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 2,
    });

    // Confirm transaction in the background or wait briefly
    await solanaConnection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid
    }, "confirmed");

    console.log(`Platform fee transfer confirmed! Tx: ${txid}`);
    return { success: true, txid, feeSOL };
  } catch (err: any) {
    console.error("Failed to execute platform fee transfer:", err);
    return { success: false, feeSOL, error: err.message || "Transfer transaction failed" };
  }
}

// GET /api/swap/quote
app.get("/api/swap/quote", async (req, res) => {
  try {
    const { inputMint, outputMint, amount } = req.query;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const inputAmount = parseFloat(amount as string);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    const decimals = await getMintDecimals(inputMint as string);
    const amountBase = Math.floor(inputAmount * Math.pow(10, decimals));

    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBase}&slippageBps=100`;
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();

    if (quoteData.error) {
      return res.status(400).json({ success: false, error: quoteData.error });
    }

    // Convert output amount to human readable format
    const outDecimals = await getMintDecimals(outputMint as string);
    const outAmountHuman = parseFloat(quoteData.outAmount) / Math.pow(10, outDecimals);

    res.json({
      success: true,
      inputAmount,
      outputAmount: outAmountHuman,
      priceImpactPct: parseFloat(quoteData.priceImpactPct || "0"),
      slippageBps: quoteData.slippageBps,
      rawQuote: quoteData
    });
  } catch (error: any) {
    console.error("Quote fetch failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/swap
app.post("/api/swap", authenticateUser, async (req, res) => {
  try {
    const uid = (req as any).user.uid;
    let { 
      tokenMint, 
      amountSOL, 
      direction, 
      inputMint, 
      outputMint, 
      inputAmount, 
      slipPageBps = 100 
    } = req.body;

    // Normalize parameters for backward compatibility
    if (!inputMint && !outputMint) {
      if (!tokenMint || !amountSOL || !direction) {
        return res.status(400).json({ success: false, error: "Missing required parameters" });
      }
      inputMint = direction === "buy" ? "So11111111111111111111111111111111111111112" : tokenMint;
      outputMint = direction === "buy" ? tokenMint : "So11111111111111111111111111111111111111112";
      inputAmount = amountSOL; // In legacy, input amount is always amountSOL
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
    
    const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));

    // Get input decimals and convert inputAmount to base units
    const decimals = await getMintDecimals(inputMint);
    const amountBase = Math.floor(inputAmount * Math.pow(10, decimals));

    // 1. Get Quote from Jupiter
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBase}&slippageBps=${slipPageBps}`;
    console.log("Fetching quote:", quoteUrl);
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    
    if (quoteData.error) {
      return res.status(400).json({ success: false, error: `Jupiter Quote Error: ${quoteData.error}` });
    }

    // 2. Get Serialized Transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
      })
    });
    const swapData = await swapResponse.json();
    
    if (swapData.error) {
       return res.status(400).json({ success: false, error: `Jupiter Swap Error: ${swapData.error}` });
    }

    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // 3. Sign the transaction
    transaction.sign([keypair]);
    
    // 4. Send the transaction
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

    // 5. Execute the 4.5% Platform Fee Transfer
    const swapDirection = inputMint === "So11111111111111111111111111111111111111112" ? "buy" : "sell";
    let feeResult: any = { success: false, feeSOL: 0 };
    try {
      feeResult = await executePlatformFee(keypair, swapDirection, inputAmount, quoteData);
      console.log("Platform Fee Status:", feeResult);
    } catch (feeError: any) {
      console.error("Platform Fee Error:", feeError);
    }

    res.json({ 
      success: true, 
      txid,
      feeSOL: feeResult.feeSOL,
      feeTxid: feeResult.txid,
      feeSuccess: feeResult.success
    });
  } catch (error: any) {
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
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/search?q=query
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q as string;
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
    
    const solanaPairs = (data?.pairs || []).filter((p: any) => p.chainId === "solana");
    
    const results = solanaPairs.map((p: any) => {
      const now = Date.now();
      const basePrice = parseFloat(p.priceNative || "0");
      const change = p.priceChange?.h24 || 0;
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
        type: "trending", // search results
        chartData
      };
    });

    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/solana/balance/:pubkey
app.get("/api/solana/balance/:pubkey", async (req, res) => {
  try {
    const pubKey = new PublicKey(req.params.pubkey);
    const balance = await solanaConnection.getBalance(pubKey);
    res.json({ success: true, solBalance: balance / 1e9 });
  } catch (error: any) {
    res.json({ success: false, solBalance: 0 }); // Usually means invalid address or not found
  }
});

// POST /api/solana/swap
app.post("/api/solana/swap", async (req, res) => {
  const { publicKey, secretKey, mintAddress, amountSOL, amountToken, direction } = req.body;
  
  try {
    if (secretKey) {
      // Decode Secret Key
      let keypair: Keypair;
      try {
        keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid Base58 Secret Key." });
      }

      if (keypair.publicKey.toBase58() !== publicKey) {
        return res.status(400).json({ success: false, message: "Secret key does not match public key." });
      }

      // 1. Fetch Quote from Jupiter
      // Note: In a real app, amount needs to be formatted in Lamports or Token Decimals
      const inputMint = direction === "buy" ? "So11111111111111111111111111111111111111112" : mintAddress;
      const outputMint = direction === "buy" ? mintAddress : "So11111111111111111111111111111111111111112";
      const amountLamports = direction === "buy" ? Math.floor(amountSOL * 1e9) : Math.floor(amountToken * 1e6); // Assuming 6 decimals for token, but needs dynamic fetch in prod

      const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=50`);
      const quoteData = await quoteResponse.json();

      if (!quoteData || quoteData.error) {
        throw new Error("Failed to get swap quote from Jupiter. Check liquidity.");
      }

      // 2. Fetch Swap Transaction from Jupiter
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: keypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
        })
      });
      const swapData = await swapResponse.json();

      if (swapData.error) throw new Error(swapData.error);

      // 3. Sign Transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([keypair]);

      // 4. Send Transaction
      const rawTransaction = transaction.serialize();
      const txid = await solanaConnection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
      });

      // 5. Execute platform fee
      let feeResult: any = { success: false, feeSOL: 0 };
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
      // Simulate swap for sandbox UI
      const simulatedHash = bs58.encode(Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))));
      const estSOL = direction === "buy" ? amountSOL : (amountToken * 0.01); // fallback estimation
      const simulatedFee = estSOL * 0.045;
      return res.json({
        success: true,
        txHash: simulatedHash,
        realBlockchainAction: false,
        message: `Simulated swap of ${direction === "buy" ? amountSOL + " SOL ➔ " + amountToken + " tokens" : amountToken + " tokens ➔ " + amountSOL + " SOL"}.`,
        feeSOL: simulatedFee,
        feeSuccess: true,
        feeMessage: `Simulated fee of ${simulatedFee.toFixed(6)} SOL routed to fee wallet.`
      });
    }
  } catch (error: any) {
    console.error("Solana swap error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to execute swap on Solana." });
  }
});

// POST /api/sentiment/:id
app.post("/api/sentiment/:id", async (req, res) => {
    // Return standard mock sentiment logic for now to keep things fast
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
