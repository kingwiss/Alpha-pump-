import { useState, useEffect } from "react";
import { MessageSquare, ThumbsUp, Share2, Sparkles, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";
import { MemeCoin, SentimentData } from "../types";
import { getAbsoluteUrl } from "../utils";

interface SentimentScannerProps {
  coin: MemeCoin;
}

export default function SentimentScanner({ coin }: SentimentScannerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SentimentData | null>(null);

  const fetchSentiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getAbsoluteUrl(`/api/sentiment/${coin.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to load sentiment scanner (Status ${response.status})`);
      }
      const resData = await response.json();
      if (resData.success) {
        setData(resData);
      } else {
        throw new Error(resData.message || "Failed to parse sentiment scanning telemetry.");
      }
    } catch (err: any) {
      console.error("Sentiment scanning telemetry error:", err);
      setError(err.message || "Failed to scan live social sentiment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
  }, [coin.id]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-xs text-gray-400 font-mono animate-pulse">
          ⚡ Initializing Gemini Social Scanner for ${coin.symbol}...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-xl text-center">
        <AlertCircle className="mx-auto text-red-400 mb-2" size={24} />
        <p className="text-xs text-gray-300 font-mono mb-3">{error || "Unable to retrieve Twitter sentiment stats."}</p>
        <button
          onClick={fetchSentiment}
          className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer"
        >
          <RefreshCw size={12} />
          Retry Scan
        </button>
      </div>
    );
  }

  const sentimentColors = {
    bullish: {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      glow: "shadow-emerald-500/10",
      label: "STRONG BULLISH",
    },
    bearish: {
      text: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      glow: "shadow-red-500/10",
      label: "BEARISH REVERSAL",
    },
    neutral: {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      glow: "shadow-amber-500/10",
      label: "CONSOLIDATIVE NEUTRAL",
    },
  };

  const style = sentimentColors[data.sentiment] || sentimentColors.neutral;

  return (
    <div id={`sentiment-scanner-${coin.id}`} className="space-y-4">
      {/* Top Section: Sentiment Overview & Score Gauge */}
      <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
        {/* Glowing circular metric */}
        <div className={`relative flex items-center justify-center w-24 h-24 rounded-full border ${style.border} ${style.bg} ${style.glow} shadow-lg flex-shrink-0`}>
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/10 animate-spin" style={{ animationDuration: "30s" }} />
          <div className="text-center">
            <span className="text-2xl font-mono font-black text-gray-100">{data.score}%</span>
            <p className="text-[8px] text-gray-400 font-sans tracking-wide mt-0.5">SCORE</p>
          </div>
        </div>

        {/* Dynamic Gemini Summary */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-sans font-black tracking-wider px-2 py-0.5 rounded-full ${style.text} ${style.bg} border ${style.border}`}>
              {style.label}
            </span>
            {data.source === "gemini_sentiment_engine" && (
              <span className="text-[9px] font-mono text-cyan-400 flex items-center gap-0.5 px-2 py-0.5 bg-cyan-950/20 rounded-full border border-cyan-500/20">
                <Sparkles size={9} />
                Gemini 3.5 AI Verified
              </span>
            )}
          </div>
          <p className="text-xs text-gray-300 leading-relaxed font-sans">{data.summary}</p>
        </div>
      </div>

      {/* Title block */}
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-sans font-bold text-gray-300 tracking-wider flex items-center gap-1.5 uppercase">
          <MessageSquare size={13} className="text-cyan-400" />
          Viral Community Signals
        </h4>
        <span className="text-[10px] text-slate-500 font-mono">Live Stream</span>
      </div>

      {/* Tweet feed */}
      <div className="space-y-3">
        {data.viralTweets.map((tweet) => (
          <div
            key={tweet.id}
            id={tweet.id}
            className="p-3.5 bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/60 rounded-xl space-y-2.5 transition-colors"
          >
            {/* Tweet Author Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Simulated colorful avatar */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-inner">
                  {tweet.author.substring(1, 3).toUpperCase()}
                </div>
                <div>
                  <span className="text-[11px] font-sans font-semibold text-gray-200 leading-none block">
                    {tweet.author}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 leading-none">
                    {tweet.handle}
                  </span>
                </div>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">{tweet.time}</span>
            </div>

            {/* Tweet content */}
            <p className="text-xs text-gray-300 font-sans leading-relaxed">{tweet.text}</p>

            {/* Tweet Actions (Likes/Retweets) */}
            <div className="flex items-center gap-4 text-[9px] text-slate-500 font-mono border-t border-slate-800/40 pt-2">
              <div className="flex items-center gap-1.5 hover:text-red-400 transition-colors">
                <ThumbsUp size={11} />
                <span>{tweet.likes.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                <Share2 size={11} />
                <span>{tweet.retweets.toLocaleString()}</span>
              </div>
              <div className="ml-auto text-[8px] text-cyan-400/80 bg-cyan-950/20 px-1.5 py-0.5 rounded border border-cyan-500/10 flex items-center gap-0.5">
                <TrendingUp size={9} />
                High Impact
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
