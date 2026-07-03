export interface MemeCoin {
  id: string;
  name: string;
  symbol: string;
  mintAddress: string;
  priceSOL: number;
  priceUSD: number;
  change5m: number;
  change1h: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  holders: number;
  createdAt: string;
  type: "fresh" | "trending";
  isViral?: boolean;
  chartData: { time: string; price: number }[];
  pairAddress?: string;
}

export interface Tweet {
  id: string;
  author: string;
  handle: string;
  avatarSeed: string;
  time: string;
  likes: number;
  retweets: number;
  text: string;
}

export interface SentimentData {
  success: boolean;
  source: "gemini_sentiment_engine" | "local_sentiment_scanner";
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  summary: string;
  viralTweets: Tweet[];
}

export interface SolanaWallet {
  publicKey: string;
  secretKey: string; // Base58 stored securely in client-side localStorage
  solBalance: number;
  memeBalances: { [symbol: string]: number };
}

export interface SwapLog {
  id: string;
  direction: "buy" | "sell";
  symbol: string;
  amountSOL: number;
  amountToken: number;
  txHash: string;
  timestamp: string;
  isSimulated: boolean;
}
