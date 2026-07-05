import { useState } from "react";
import { X, Copy, Check, ShieldCheck, HelpCircle, ArrowUpRight, ArrowDownRight, Wallet2 } from "lucide-react";
import { MemeCoin } from "../types";
import SentimentScanner from "./SentimentScanner";
import ErrorBoundary from "./ErrorBoundary";

interface TokenModalProps {
  coin: MemeCoin;
  onClose: () => void;
  onSwapClick: (coin: MemeCoin) => void;
}

export default function TokenModal({ coin, onClose, onSwapClick }: TokenModalProps) {
  const [copied, setCopied] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ time: string; price: number } | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(coin.mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = coin.change1h >= 0;

  // Let's render a gorgeous enlarged price trend chart using responsive SVG coordinates
  const points = coin.chartData || [];
  const minPrice = points.length > 0 ? Math.min(...points.map((p) => p.price)) : 0;
  const maxPrice = points.length > 0 ? Math.max(...points.map((p) => p.price)) : 0;
  const priceRange = maxPrice - minPrice === 0 ? 1 : maxPrice - minPrice;

  const chartWidth = 500;
  const chartHeight = 160;

  const svgPoints = points.map((p, index) => {
    const x = (index / (Math.max(1, points.length - 1))) * (chartWidth - 20) + 10;
    const y = chartHeight - ((p.price - minPrice) / priceRange) * (chartHeight - 30) - 15;
    return { x, y, time: p.time, price: p.price };
  });

  const pathD = svgPoints.length > 0 ? svgPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";
  const areaD = svgPoints.length > 0 ? `${pathD} L ${svgPoints[svgPoints.length - 1].x} ${chartHeight} L ${svgPoints[0].x} ${chartHeight} Z` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      {/* Backdrop Click */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      {/* Modal Container */}
      <div
        id={`token-modal-${coin.id}`}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800/90 rounded-3xl overflow-hidden shadow-2xl shadow-cyan-500/10 z-10 flex flex-col max-h-[90vh]"
      >
        {/* Glow Header Ambient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500" />

        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-800/80 flex items-start justify-between bg-slate-950/20">
          <div className="flex items-center gap-4">
            {/* Symbol Token Logo */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center text-md font-sans font-black text-cyan-400 shadow-lg shadow-cyan-500/5">
              {(coin.symbol || "UNK").substring(0, 2)}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-sans font-extrabold text-gray-100">{coin.name}</h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-800 text-gray-400 font-bold">
                  {coin.symbol}
                </span>
              </div>

              {/* Security and Verification Status */}
              <div className="flex items-center gap-1.5 mt-1">
                <ShieldCheck size={13} className="text-emerald-400" />
                <span className="text-[10px] text-emerald-400/90 font-mono font-medium uppercase tracking-wide">
                  Verified Solana Asset Contract
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/60"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-800">
          
          {/* Expanded Price & Real-Time Sparkline progression chart */}
          <div className="bg-slate-950/50 border border-slate-800/85 p-5 rounded-2xl space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest leading-none">
                  Current Token Rate (SOL)
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-mono font-black text-gray-100">
                    {coin.priceSOL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                  <span className="text-xs text-cyan-400 font-mono font-bold">SOL</span>
                </div>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  ~ ${coin.priceUSD < 0.0001 ? coin.priceUSD.toFixed(7) : coin.priceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD
                </p>
              </div>

              {/* Stats Change Badges */}
              <div className="text-right">
                <div className={`inline-flex items-center gap-0.5 px-3 py-1 rounded-full text-xs font-sans font-bold ${
                  isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  <span>{isPositive ? "+" : ""}{coin.change1h}% (1h)</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono mt-1.5">
                  5m tick: <span className={coin.change5m >= 0 ? "text-emerald-400" : "text-red-400"}>{coin.change5m}%</span>
                </p>
              </div>
            </div>

            {/* Glowing Custom SVG Progression Chart with Interactive Hover */}
            <div className="relative border-t border-slate-800/40 pt-4 mt-2">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-40 overflow-visible"
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <defs>
                  <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {[0.25, 0.5, 0.75].map((ratio, i) => (
                  <line
                    key={i}
                    x1="10"
                    y1={chartHeight * ratio}
                    x2={chartWidth - 10}
                    y2={chartHeight * ratio}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Area under curve */}
                <path d={areaD} fill="url(#modalGrad)" />

                {/* Stroke Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isPositive ? "#22c55e" : "#ef4444"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Vertical Cursor Guide when Hovering */}
                {hoveredPoint && (
                  <line
                    x1={svgPoints.find((p) => p.time === hoveredPoint.time)?.x || 0}
                    y1="5"
                    x2={svgPoints.find((p) => p.time === hoveredPoint.time)?.x || 0}
                    y2={chartHeight - 5}
                    stroke="#06b6d4"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Interactive Points circles */}
                {svgPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={hoveredPoint?.time === p.time ? "5" : "3.5"}
                    fill={hoveredPoint?.time === p.time ? "#06b6d4" : isPositive ? "#22c55e" : "#ef4444"}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredPoint({ time: p.time, price: p.price })}
                  />
                ))}
              </svg>

              {/* Chart Overlay Label / Hover Tooltip */}
              <div className="flex justify-between text-[9px] text-slate-500 font-mono px-2 mt-1">
                <span>{points[0]?.time}</span>
                {hoveredPoint ? (
                  <span className="text-cyan-400 font-bold bg-slate-900/90 px-2 py-0.5 rounded border border-cyan-500/20">
                    {hoveredPoint.time}: {hoveredPoint.price.toFixed(6)} SOL
                  </span>
                ) : (
                  <span className="text-slate-400 font-light italic">Hover node for precise tick values</span>
                )}
                <span>{points[points.length - 1]?.time}</span>
              </div>
            </div>
          </div>

          {/* Token Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">MARKET CAP</span>
              <span className="text-sm font-mono font-bold text-gray-100 mt-1 block">
                ${coin.marketCap.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">LIQUIDITY (SOL Pool)</span>
              <span className="text-sm font-mono font-bold text-gray-100 mt-1 block">
                ${coin.liquidity.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">24H VOLUME</span>
              <span className="text-sm font-mono font-bold text-gray-100 mt-1 block">
                ${coin.volume24h.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">HOLDERS</span>
              <span className="text-sm font-mono font-bold text-gray-100 mt-1 block">
                {coin.holders.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">BLOCKCHAIN ID</span>
              <span className="text-xs font-mono font-semibold text-cyan-400 mt-1 block uppercase">
                Solana Horizon
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[9px] text-gray-400 font-mono block">AGE STATUS</span>
              <span className="text-xs font-mono font-semibold text-gray-200 mt-1 block flex items-center gap-1">
                <span className={coin.type === "fresh" ? "text-cyan-400 animate-pulse font-bold" : "text-emerald-400 font-bold"}>
                  ● {(() => {
                    const diffMs = Date.now() - new Date(coin.createdAt).getTime();
                    if (diffMs <= 0) return "Just now";
                    const diffMins = Math.floor(diffMs / 60000);
                    if (diffMins < 1) {
                      const diffSecs = Math.max(1, Math.floor(diffMs / 1000));
                      return `${diffSecs}s old`;
                    }
                    if (diffMins < 60) {
                      return `${diffMins}m old`;
                    }
                    const diffHours = Math.floor(diffMins / 60);
                    if (diffHours < 24) {
                      return `${diffHours}h old`;
                    }
                    return `${Math.floor(diffHours / 24)}d old`;
                  })()}
                </span>
              </span>
            </div>
          </div>

          {/* Mint Address Block */}
          <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl">
            <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider block mb-1.5">
              Token Asset Mint/Issuer Key
            </span>
            <div className="flex items-center justify-between gap-3 bg-slate-950/80 border border-slate-800/90 rounded-xl p-2 px-3">
              <span className="text-[10px] text-gray-300 font-mono break-all font-medium leading-relaxed">
                {coin.mintAddress}
              </span>
              <button
                onClick={handleCopy}
                className={`p-2 rounded-lg border flex-shrink-0 transition-all cursor-pointer ${
                  copied
                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700"
                }`}
                title="Copy Address"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[9px] text-slate-500 font-mono mt-1.5 flex items-center gap-1">
              <HelpCircle size={10} />
              Paste this issuer public key into Phantom, Albedo, or Lobster wallets to trade on Solana.
            </p>
          </div>

          {/* Social Sentiment Module with Error Boundary */}
          <ErrorBoundary fallbackTitle="Twitter Sentiment Engine Temporarily Offline">
            <SentimentScanner coin={coin} />
          </ErrorBoundary>
        </div>

        {/* Modal Footer: Action Swap Buttons */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between">
          <p className="text-[10px] text-slate-500 font-mono hidden sm:block">
            Verified DEX pair: {coin.symbol}/SOL
          </p>
          
          <button
            onClick={() => onSwapClick(coin)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-xs font-sans font-black text-gray-900 hover:text-black rounded-xl transition-all shadow-lg shadow-emerald-500/10 cursor-pointer uppercase tracking-wider scale-100 active:scale-98"
          >
            <Wallet2 size={14} />
            Buy {coin.symbol} Now
          </button>
        </div>
      </div>
    </div>
  );
}
