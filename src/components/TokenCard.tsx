import { useState, useEffect, MouseEvent } from "react";
import { Copy, Check, ExternalLink, ArrowUpRight, ArrowDownRight, Clock, Users, Activity, Trophy } from "lucide-react";
import { MemeCoin } from "../types";
import Sparkline from "./Sparkline";

interface TokenCardProps {
  key?: string | number;
  coin: MemeCoin;
  onSelect: (coin: MemeCoin) => void;
  onBuy?: (coin: MemeCoin) => void;
}

export default function TokenCard({ coin, onSelect, onBuy }: TokenCardProps) {
  const [copied, setCopied] = useState(false);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);
  const [prevPrice, setPrevPrice] = useState(coin.priceSOL);

  // Monitor price changes to trigger flash animations
  useEffect(() => {
    if (coin.priceSOL > prevPrice) {
      setPriceFlash("up");
      const timer = setTimeout(() => setPriceFlash(null), 1000);
      setPrevPrice(coin.priceSOL);
      return () => clearTimeout(timer);
    } else if (coin.priceSOL < prevPrice) {
      setPriceFlash("down");
      const timer = setTimeout(() => setPriceFlash(null), 1000);
      setPrevPrice(coin.priceSOL);
      return () => clearTimeout(timer);
    }
  }, [coin.priceSOL]);

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent opening modal when clicking copy
    navigator.clipboard.writeText(coin.mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = coin.change1h >= 0;

  return (
    <div
      onClick={() => onSelect(coin)}
      id={`token-card-${coin.id}`}
      className={`group relative p-4 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 backdrop-blur-md flex flex-col justify-between overflow-hidden ${
        priceFlash === "up"
          ? "ring-1 ring-emerald-500/50 bg-emerald-950/10"
          : priceFlash === "down"
          ? "ring-1 ring-red-500/50 bg-red-950/10"
          : ""
      }`}
    >
      {/* Absolute Glow Background Accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-cyan-500/5 to-transparent rounded-full blur-xl group-hover:from-cyan-500/10 transition-all duration-300 pointer-events-none" />

      {/* Card Header: Logo, Name, Age */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Custom Styled Avatar with Neon Theme */}
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center font-sans font-black text-sm text-cyan-400 group-hover:text-cyan-300 transition-colors shadow-inner shadow-cyan-500/10">
            {(coin.symbol || "UNK").substring(0, 3)}
            <span className="absolute -bottom-1 -right-1 flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${coin.type === "fresh" ? "bg-cyan-400" : "bg-emerald-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${coin.type === "fresh" ? "bg-cyan-500" : "bg-emerald-500"}`}></span>
            </span>
          </div>

          <div>
            <h3 className="text-sm font-sans font-semibold text-gray-200 group-hover:text-white transition-colors flex items-center gap-1.5 leading-tight">
              {coin.name}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-850 text-gray-400 font-medium">
                {coin.symbol}
              </span>
              {coin.isViral && (
                <span title="High Viral Potential">
                  <Trophy size={12} className="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)] animate-pulse" />
                </span>
              )}
            </h3>
            
            {/* Age or Creation Timestamp */}
            <p className="text-[10px] text-gray-400 font-mono mt-0.5 flex items-center gap-1">
              <Clock size={10} className="text-slate-500" />
              <span className={coin.type === "fresh" ? "text-cyan-400/90 font-semibold animate-pulse" : "text-slate-400"}>
                {(() => {
                  const diffMs = Date.now() - new Date(coin.createdAt).getTime();
                  if (diffMs <= 0) return "Just now";
                  const diffMins = Math.floor(diffMs / 60000);
                  if (diffMins < 1) {
                    const diffSecs = Math.max(1, Math.floor(diffMs / 1000));
                    return `${diffSecs}s ago`;
                  }
                  if (diffMins < 60) {
                    return `${diffMins}m ago`;
                  }
                  const diffHours = Math.floor(diffMins / 60);
                  if (diffHours < 24) {
                    return `${diffHours}h ago`;
                  }
                  return `${Math.floor(diffHours / 24)}d ago`;
                })()}
              </span>
            </p>
          </div>
        </div>

        {/* Copy Address Button */}
        <button
          onClick={handleCopy}
          id={`copy-mint-${coin.id}`}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-all cursor-pointer ${
            copied
              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
              : "bg-slate-950/50 hover:bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700"
          }`}
          title="Copy Mint Address"
        >
          {copied ? (
            <>
              <Check size={10} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              <span className="max-w-[48px] truncate">{(coin.mintAddress || "Unknown").substring(0, 4)}...</span>
            </>
          )}
        </button>
      </div>

      {/* Price & Sparkline */}
      <div className="flex items-center justify-between gap-4 mt-1 mb-2">
        <div>
          {/* SOL Price */}
          <div className="flex items-baseline gap-1">
            <span className={`text-md font-mono font-bold leading-none ${
              priceFlash === "up" ? "text-emerald-400" : priceFlash === "down" ? "text-red-400" : "text-gray-100"
            } transition-colors duration-300`}>
              {coin.priceSOL < 0.000001 ? coin.priceSOL.toFixed(9) : coin.priceSOL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">SOL</span>
          </div>

          {/* USD Price */}
          <p className="text-[11px] text-gray-400 font-mono mt-0.5">
            ${coin.priceUSD < 0.0001 ? coin.priceUSD.toFixed(7) : coin.priceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
        </div>

        {/* Custom Vector Sparkline (if available) */}
        {coin.chartData && coin.chartData.length > 0 ? (
          <div className="opacity-95 group-hover:opacity-100 transition-opacity">
            <Sparkline data={coin.chartData} isPositive={isPositive} width={80} height={28} />
          </div>
        ) : (
           <div className="h-7 w-20 flex items-center justify-center opacity-50 bg-slate-900 rounded border border-slate-800/50">
             <Activity size={12} className="text-slate-600" />
           </div>
        )}
      </div>

      {/* Footer Metrics (Holders, Vol, change) */}
      <div className="flex items-center justify-between border-t border-slate-800/60 pt-2.5 mt-2 text-[10px] text-gray-400 font-mono">
        {/* Vol / Holders */}
        <div className="flex items-center gap-1">
          <Activity size={11} className="text-slate-500" />
          <span>Vol: ${(coin.volume24h || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>

        {/* Change badge */}
        <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full font-sans font-bold text-[10px] ${
          isPositive 
            ? "bg-emerald-500/10 text-emerald-400" 
            : "bg-red-500/10 text-red-400"
        }`}>
          {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          <span>{isPositive ? "+" : ""}{(coin.change1h || 0).toFixed(2)}% <span className="font-light text-[9px] opacity-75">(1h)</span></span>
        </div>
      </div>
      
      {onBuy && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBuy(coin);
          }}
          className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/40 hover:to-teal-500/40 border border-emerald-500/30 text-[10px] font-sans font-black text-emerald-400 rounded-lg transition-all"
        >
          Buy Now
        </button>
      )}
    </div>
  );
}
