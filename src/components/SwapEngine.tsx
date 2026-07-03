import { useState, useEffect, FormEvent } from "react";
import { ArrowUpDown, Shield, Info, ExternalLink, HelpCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { MemeCoin, SolanaWallet, SwapLog } from "../types";
import { getAbsoluteUrl } from "../utils";

interface SwapEngineProps {
  coins: MemeCoin[];
  activeWallet: SolanaWallet | null;
  selectedCoinFromModal: MemeCoin | null;
  onSwapSuccess: (log: SwapLog, isSimulated: boolean) => void;
}

export default function SwapEngine({
  coins,
  activeWallet,
  selectedCoinFromModal,
  onSwapSuccess,
}: SwapEngineProps) {
  const [fromAsset, setFromAsset] = useState<string>("solana");
  const [toAsset, setToAsset] = useState<string>("");
  const [inputAmount, setInputAmount] = useState<string>("");
  const [outputAmount, setOutputAmount] = useState<string>("");
  
  // States
  const [loading, setLoading] = useState(false);
  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);
  const [priceImpact, setPriceImpact] = useState<number | null>(null);

  // Set default output asset and keep in sync with selected coin modal
  useEffect(() => {
    if (selectedCoinFromModal) {
      setToAsset(selectedCoinFromModal.id);
      setFromAsset("solana");
    } else if (coins.length > 0 && !toAsset) {
      const firstCoin = coins[0];
      setToAsset(firstCoin.id);
    }
  }, [selectedCoinFromModal, coins]);

  // Handle reversing the swap direction
  const handleToggleDirection = () => {
    const temp = fromAsset;
    setFromAsset(toAsset);
    setToAsset(temp);
    setInputAmount(outputAmount);
    setOutputAmount("");
    setPriceImpact(null);
    setQuoteError(null);
  };

  // Debounced effect to fetch real live swap quotes from the backend
  useEffect(() => {
    if (!inputAmount || isNaN(Number(inputAmount)) || Number(inputAmount) <= 0) {
      setOutputAmount("");
      setPriceImpact(null);
      setQuoteError(null);
      return;
    }

    if (fromAsset === toAsset) {
      setQuoteError("Cannot swap an asset for itself.");
      setOutputAmount("");
      setPriceImpact(null);
      return;
    }

    const inputMint = fromAsset === "solana" 
      ? "So11111111111111111111111111111111111111112" 
      : coins.find(c => c.id === fromAsset)?.mintAddress;
      
    const outputMint = toAsset === "solana" 
      ? "So11111111111111111111111111111111111111112" 
      : coins.find(c => c.id === toAsset)?.mintAddress;

    if (!inputMint || !outputMint) {
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setFetchingQuote(true);
      setQuoteError(null);
      try {
        const res = await fetch(getAbsoluteUrl(`/api/swap/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}`));
        const data = await res.json();
        if (data.success) {
          setOutputAmount(data.outputAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }));
          setPriceImpact(data.priceImpactPct);
        } else {
          setQuoteError(data.error || "Route unavailable on Jupiter.");
          setOutputAmount("");
          setPriceImpact(null);
        }
      } catch (err) {
        console.error(err);
        setQuoteError("Failed to reach quote provider.");
        setOutputAmount("");
        setPriceImpact(null);
      } finally {
        setFetchingQuote(false);
      }
    }, 600);

    return () => clearTimeout(delayDebounce);
  }, [fromAsset, toAsset, inputAmount, coins]);

  const getFromBalance = () => {
    if (!activeWallet) return 0;
    if (fromAsset === "solana") return activeWallet.solBalance;
    const coin = coins.find(c => c.id === fromAsset);
    if (!coin) return 0;
    return activeWallet.memeBalances[coin.symbol] || 0;
  };

  const getToBalance = () => {
    if (!activeWallet) return 0;
    if (toAsset === "solana") return activeWallet.solBalance;
    const coin = coins.find(c => c.id === toAsset);
    if (!coin) return 0;
    return activeWallet.memeBalances[coin.symbol] || 0;
  };

  const getAssetSymbol = (id: string) => {
    if (id === "solana") return "SOL";
    const coin = coins.find(c => c.id === id);
    return coin ? coin.symbol : "TOKEN";
  };

  const handleExecuteSwap = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessResult(null);

    const amountNum = Number(inputAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    if (!activeWallet) {
      setError("Please create or generate a Solana account first in the Portfolio tab!");
      return;
    }

    const currentBalance = getFromBalance();
    if (amountNum > currentBalance) {
      setError(`Insufficient ${getAssetSymbol(fromAsset)} balance for this swap.`);
      return;
    }

    const inputMint = fromAsset === "solana" 
      ? "So11111111111111111111111111111111111111112" 
      : coins.find(c => c.id === fromAsset)?.mintAddress;
      
    const outputMint = toAsset === "solana" 
      ? "So11111111111111111111111111111111111111112" 
      : coins.find(c => c.id === toAsset)?.mintAddress;

    if (!inputMint || !outputMint) {
      setError("Failed to resolve asset contract addresses.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        inputMint,
        outputMint,
        inputAmount: amountNum,
        slipPageBps: 100, // 1%
        secretKey: activeWallet.secretKey
      };

      const token = localStorage.getItem("firebase_auth_token");
      if (!token) {
        throw new Error("You must be logged in to perform swaps. Please log in first.");
      }

      const res = await fetch(getAbsoluteUrl("/api/swap"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute Solana swap.");
      }

      setSuccessResult({ txid: data.txid });

      // Build beautiful transaction swap log
      const fromSymbol = getAssetSymbol(fromAsset);
      const toSymbol = getAssetSymbol(toAsset);

      const newLog: SwapLog = {
        id: data.txid || Math.random().toString(),
        direction: fromAsset === "solana" ? "buy" : "sell",
        symbol: fromAsset === "solana" ? toSymbol : fromSymbol,
        amountSOL: fromAsset === "solana" ? amountNum : Number(outputAmount.replace(/,/g, '') || "0"),
        amountToken: fromAsset === "solana" ? Number(outputAmount.replace(/,/g, '') || "0") : amountNum,
        txHash: data.txid,
        timestamp: new Date().toISOString(),
        isSimulated: false,
      };

      onSwapSuccess(newLog, false);
      setInputAmount("");
      setOutputAmount("");
    } catch (err: any) {
      console.error("Swap execution failed:", err);
      setError(err.message || "An unexpected error occurred during the transaction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="universal-swap-engine" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
      {/* Visual Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Card Title */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-md font-sans font-extrabold text-gray-100 flex items-center gap-2">
            Universal Solana Swap Engine
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            DEX aggregator swaps powered by Jupiter API
          </p>
        </div>

        <div className="flex p-1.5 px-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <span className="text-[10px] text-emerald-400 font-sans font-bold uppercase">
            Live Mainnet
          </span>
        </div>
      </div>

      <form onSubmit={handleExecuteSwap} className="space-y-4">
        {/* Input Card: SEND/FROM */}
        <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-2xl relative">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block mb-1">
            You Pay (From)
          </span>

          <div className="flex items-center justify-between gap-3">
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="bg-transparent text-xl font-mono text-gray-100 placeholder-slate-700 outline-none w-full border-none p-0 focus:ring-0 focus:outline-none"
              disabled={loading}
              required
            />

            {/* From Asset Selector */}
            <select
              value={fromAsset}
              onChange={(e) => {
                const selected = e.target.value;
                setFromAsset(selected);
                if (selected === toAsset) {
                  setToAsset(selected === "solana" ? (coins[0]?.id || "") : "solana");
                }
              }}
              className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl text-xs font-mono font-bold text-gray-200 focus:outline-none cursor-pointer max-w-[120px]"
              disabled={loading}
            >
              <option value="solana">SOL</option>
              {coins.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.symbol}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5">
            <span>
              Balance: {getFromBalance().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {getAssetSymbol(fromAsset)}
            </span>
          </div>
        </div>

        {/* Circular Swap Middle Toggle button */}
        <div className="flex items-center justify-center -my-3 relative z-10">
          <button
            type="button"
            onClick={handleToggleDirection}
            className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-cyan-400 hover:text-cyan-300 rounded-full transition-all shadow-md hover:scale-105 cursor-pointer"
            title="Switch Direction"
          >
            <ArrowUpDown size={15} />
          </button>
        </div>

        {/* Input Card: RECEIVE/TO */}
        <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-2xl relative">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block mb-1">
            You Receive (To)
          </span>

          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full">
              {fetchingQuote ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono text-slate-500">Estimating route...</span>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="0.00"
                  value={outputAmount}
                  readOnly
                  className="bg-transparent text-xl font-mono text-gray-100 placeholder-slate-700 outline-none w-full border-none p-0 focus:ring-0 focus:outline-none"
                />
              )}
            </div>

            {/* To Asset Selector */}
            <select
              value={toAsset}
              onChange={(e) => {
                const selected = e.target.value;
                setToAsset(selected);
                if (selected === fromAsset) {
                  setFromAsset(selected === "solana" ? (coins[0]?.id || "") : "solana");
                }
              }}
              className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl text-xs font-mono font-bold text-gray-200 focus:outline-none cursor-pointer max-w-[120px]"
              disabled={loading}
            >
              <option value="solana">SOL</option>
              {coins.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.symbol}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5">
            <span>
              Balance: {getToBalance().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {getAssetSymbol(toAsset)}
            </span>
          </div>
        </div>

        {/* Quotes Info / Slippage / Price Impact */}
        {quoteError && (
          <p className="text-[10px] text-amber-500 font-mono flex items-center gap-1.5 px-1 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
            <AlertTriangle size={12} />
            {quoteError}
          </p>
        )}

        {!quoteError && outputAmount && (
          <div className="px-1 text-[10px] text-slate-400 font-mono space-y-1 bg-slate-950/20 p-2 rounded-lg border border-slate-800/40">
            <div className="flex justify-between">
              <span>Exchange Rate:</span>
              <span className="text-gray-300">
                1 {getAssetSymbol(fromAsset)} ≈ {(Number(outputAmount.replace(/,/g, '')) / Number(inputAmount)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {getAssetSymbol(toAsset)}
              </span>
            </div>
            {priceImpact !== null && (
              <div className="flex justify-between">
                <span>Price Impact:</span>
                <span className={`font-bold ${priceImpact > 2 ? "text-red-400" : "text-emerald-400"}`}>
                  {priceImpact < 0.01 ? "< 0.01%" : `${priceImpact.toFixed(2)}%`}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Slippage Tolerance:</span>
              <span className="text-gray-300">1.0%</span>
            </div>
            <div className="flex justify-between border-t border-slate-800/40 pt-1 mt-1 text-cyan-400">
              <span className="font-semibold">Developer Fee (4.5%):</span>
              <span className="font-bold">
                {fromAsset === "solana" 
                  ? (Number(inputAmount) * 0.045).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " SOL"
                  : (Number(outputAmount.replace(/,/g, '')) * 0.045).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " SOL"
                }
              </span>
            </div>
          </div>
        )}

        {/* Submit Swap Button */}
        <button
          type="submit"
          disabled={loading || fetchingQuote || !inputAmount || !!quoteError}
          className={`w-full py-3.5 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all scale-100 active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
            loading || fetchingQuote || !inputAmount || !!quoteError
              ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed"
              : "bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 shadow-lg shadow-cyan-500/10 hover:brightness-110"
          }`}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
              <span>Broadcasting transaction to Solana...</span>
            </>
          ) : (
            <span>
              Execute Swap ({getAssetSymbol(fromAsset)} → {getAssetSymbol(toAsset)})
            </span>
          )}
        </button>

        {/* Info Disclaimer */}
        <p className="text-[9px] text-slate-500 text-center font-mono leading-relaxed">
          Aggregated live route optimized via Jupiter Smart Router
        </p>
      </form>

      {/* ERROR FEEDBACK */}
      {error && (
        <div className="mt-4 p-3.5 bg-red-950/20 border border-red-500/20 rounded-xl flex items-start gap-2.5 animate-fade-in">
          <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={15} />
          <div className="space-y-0.5">
            <span className="text-[10px] font-sans font-extrabold text-red-400 block uppercase tracking-wide">
              Transaction Rejected
            </span>
            <p className="text-[10px] text-gray-300 font-mono leading-normal">{error}</p>
          </div>
        </div>
      )}

      {/* SUCCESS RECEIPT POP-UP */}
      {successResult && (
        <div className="mt-4 p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl space-y-3 animate-fade-in shadow-inner">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle size={16} />
            <span className="text-xs font-sans font-black tracking-wider uppercase">
              Swap Executed successfully!
            </span>
          </div>

          <div className="space-y-1.5 border-t border-slate-800/60 pt-2 text-[10px] font-mono text-slate-400">
            <div className="flex flex-col gap-0.5 mt-1">
              <span>Transaction Hash (Signature):</span>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800/80 p-1.5 px-2.5 rounded-lg text-[9px] break-all font-mono">
                <span className="text-cyan-400 select-all">{successResult.txid}</span>
              </div>
            </div>

            <div className="pt-1.5 flex justify-end">
              <a
                href={`https://solscan.io/tx/${successResult.txid}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 hover:underline"
              >
                Verify on Solscan
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
