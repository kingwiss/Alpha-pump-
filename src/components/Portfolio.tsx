import { useState } from "react";
import { Copy, Check, PlusCircle, RefreshCw, Key, Wallet2, FileText, ExternalLink, CreditCard, ArrowDownToLine, Send, ArrowLeft } from "lucide-react";
import { SolanaWallet, SwapLog } from "../types";

interface PortfolioProps {
  wallet: SolanaWallet | null;
  logs: SwapLog[];
  onGenerateKeypair: () => void;
  onRefreshBalances: (targetWallet?: SolanaWallet) => Promise<void>;
  onBack: () => void;
  onSwapAsset?: (symbol: string) => void;
  walletError?: string | null;
}

export default function Portfolio({
  wallet,
  logs,
  onGenerateKeypair,
  onRefreshBalances,
  onBack,
  onSwapAsset,
  walletError,
}: PortfolioProps) {
  const [copiedKey, setCopiedKey] = useState<"pub" | "sec" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFiatRamp, setShowFiatRamp] = useState(false);
  const [fiatAmount, setFiatAmount] = useState<string>("100");
  const [fiatCurrency, setFiatCurrency] = useState<string>("USD");
  const [loadedMoonpayUrl, setLoadedMoonpayUrl] = useState<string>("");

  const handleCopy = (text: string, type: "pub" | "sec") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRefreshTrigger = async () => {
    setRefreshing(true);
    try {
      await onRefreshBalances(wallet || undefined);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  // Compute estimated portfolio value in USD (assuming SOL = $145.00 for simulation)
  const solUSDVal = (wallet?.solBalance || 0) * 145.00;
  
  // Custom estimated meme valuation (purely for aesthetic gamification)
  const memeUSDVal = wallet
    ? Object.keys(wallet.memeBalances).reduce((acc, symbol) => {
        const priceSOL = 0.0001; // Mock pricing for demo
        const bal = wallet.memeBalances[symbol] || 0;
        return acc + bal * priceSOL * 145.00;
      }, 0)
    : 0;

  const totalUSD = solUSDVal + memeUSDVal;

  return (
    <div className="space-y-4">
      <button 
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-xs font-sans text-slate-300 transition-colors w-max cursor-pointer"
      >
        <ArrowLeft size={14} />
        Back to Home
      </button>

      <div id="solana-portfolio-dashboard" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Wallet Details Column */}
        <div className="md:col-span-2 space-y-6">
        
        {/* Balance Card Banner */}
        <div className="relative p-6 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          {/* Subtle Glow Sphere */}
          <div className="absolute -bottom-10 -left-10 w-44 h-44 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest block leading-none">
                Estimated Net Worth
              </span>
              <div className="flex items-baseline gap-1 mt-1.5">
                <span className="text-3xl font-mono font-black text-gray-100">
                  ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-cyan-400 font-mono font-bold">USD</span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Total combined SOL + Meme Token value
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRefreshTrigger}
                disabled={refreshing || !wallet}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-xs text-gray-300 font-sans font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                title="Refresh Balances"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing..." : "Sync"}
              </button>
            </div>
          </div>

          {/* Wallet Actions (Deposit, Send, Buy with Card) */}
          {wallet && (
            <div className="grid grid-cols-3 gap-3 mt-6">
              <button 
                onClick={() => handleCopy(wallet.publicKey, "pub")}
                className="flex flex-col items-center justify-center gap-1.5 py-3 bg-slate-950 border border-slate-850 hover:bg-slate-800 rounded-2xl text-cyan-400 transition-colors"
              >
                <ArrowDownToLine size={18} />
                <span className="text-[10px] font-sans font-bold tracking-wide uppercase">Receive SOL</span>
              </button>

              <button 
                className="flex flex-col items-center justify-center gap-1.5 py-3 bg-slate-950 border border-slate-850 hover:bg-slate-800 rounded-2xl text-emerald-400 transition-colors opacity-50 cursor-not-allowed"
                title="Sending requires a signed instruction (Coming soon)"
              >
                <Send size={18} />
                <span className="text-[10px] font-sans font-bold tracking-wide uppercase">Send</span>
              </button>

              <button 
                onClick={() => setShowFiatRamp(!showFiatRamp)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 rounded-2xl text-indigo-400 transition-colors"
              >
                <CreditCard size={18} />
                <span className="text-[10px] font-sans font-bold tracking-wide uppercase">Buy with Card</span>
              </button>
            </div>
          )}

          {/* Fiat On-Ramp Info Section */}
          {showFiatRamp && wallet && (
            <div className="mt-4 p-5 bg-slate-950 border border-indigo-500/30 rounded-3xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-sans font-black text-indigo-400 flex items-center gap-2 uppercase tracking-wide">
                  <CreditCard size={14} />
                  MoonPay Debit Card Deposit
                </h5>
                <span className="text-[9px] px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono rounded-md uppercase font-bold">
                  Staging Sandbox Enabled
                </span>
              </div>

              <p className="text-[11px] font-sans text-slate-400 leading-relaxed">
                Purchase SOL directly to your secure burner wallet address using your debit card or credit card.
              </p>

              {/* Calculator Panel */}
              <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">You Pay</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={fiatAmount}
                      onChange={(e) => {
                        setFiatAmount(e.target.value);
                        setLoadedMoonpayUrl("");
                      }}
                      placeholder="100"
                      className="w-full bg-transparent text-sm font-mono text-white outline-none border-none p-0 focus:ring-0"
                    />
                    <select
                      value={fiatCurrency}
                      onChange={(e) => {
                        setFiatCurrency(e.target.value);
                        setLoadedMoonpayUrl("");
                      }}
                      className="bg-slate-950 border border-slate-800 text-xs font-mono text-gray-300 rounded px-1 py-0.5"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1 border-l border-slate-800 pl-3">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Est. Received</span>
                  <div className="text-sm font-mono text-cyan-400 font-bold mt-0.5">
                    {(() => {
                      const amount = parseFloat(fiatAmount) || 0;
                      const estSOL = amount / 145.00;
                      return `${estSOL.toFixed(4)} SOL`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const apiKey = import.meta.env.VITE_MOONPAY_API_KEY || "pk_test_WD966T705fS88V50B8p37V8u187b41S";
                    const isSandbox = !import.meta.env.VITE_MOONPAY_API_KEY;
                    const baseUrl = isSandbox ? "https://buy.staging.moonpay.com" : "https://buy.moonpay.com";
                    const params = new URLSearchParams({
                      apiKey,
                      currencyCode: "sol",
                      walletAddress: wallet.publicKey,
                      baseCurrencyAmount: fiatAmount,
                      baseCurrencyCode: fiatCurrency.toLowerCase(),
                      lockAmount: "true"
                    });
                    setLoadedMoonpayUrl(`${baseUrl}?${params.toString()}`);
                  }}
                  className="flex-1 py-2.5 bg-indigo-500 text-slate-950 font-sans font-black text-[11px] uppercase tracking-wider rounded-xl transition-all hover:brightness-110 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} className="animate-pulse" />
                  Generate Embedded Widget
                </button>

                <a
                  href={(() => {
                    const apiKey = import.meta.env.VITE_MOONPAY_API_KEY || "pk_test_WD966T705fS88V50B8p37V8u187b41S";
                    const isSandbox = !import.meta.env.VITE_MOONPAY_API_KEY;
                    const baseUrl = isSandbox ? "https://buy.staging.moonpay.com" : "https://buy.moonpay.com";
                    const params = new URLSearchParams({
                      apiKey,
                      currencyCode: "sol",
                      walletAddress: wallet.publicKey,
                      baseCurrencyAmount: fiatAmount,
                      baseCurrencyCode: fiatCurrency.toLowerCase(),
                      lockAmount: "true"
                    });
                    return `${baseUrl}?${params.toString()}`;
                  })()}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 bg-slate-900 border border-slate-800 text-indigo-400 font-sans font-black text-[11px] uppercase tracking-wider rounded-xl transition-all hover:bg-slate-850 flex items-center justify-center gap-1.5 text-center cursor-pointer"
                >
                  Checkout in New Tab
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* Dynamic Embedded Iframe Widget */}
              {loadedMoonpayUrl && (
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900 mt-2">
                  <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 text-[9px] font-mono text-slate-400 flex justify-between items-center">
                    <span>MoonPay Embedded Secure Iframe</span>
                    <button 
                      onClick={() => setLoadedMoonpayUrl("")} 
                      className="text-red-400 hover:text-red-300"
                    >
                      Close Widget
                    </button>
                  </div>
                  <iframe
                    src={loadedMoonpayUrl}
                    className="w-full h-[450px]"
                    title="MoonPay Fiat Gateway"
                    referrerPolicy="no-referrer"
                    allow="accelerometer; autoplay; camera; gyroscope; payment"
                  />
                </div>
              )}

              {/* Configuration Secret Notice */}
              <div className="p-3 bg-indigo-950/20 border border-indigo-500/10 rounded-2xl">
                <p className="text-[10px] font-mono text-indigo-300 leading-normal">
                  💡 <strong>Developer Note:</strong> To switch from staging/test sandbox to live production deposits, add your real <strong className="text-white">VITE_MOONPAY_API_KEY</strong> inside your AI Studio Environment Secrets. Currently, users can test using sandbox cards.
                </p>
              </div>
            </div>
          )}

          {/* Wallet Address list */}
          {wallet ? (
            <div className="mt-6 border-t border-slate-800/60 pt-4 space-y-2 text-[11px] font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500">Your Solana Address (For Deposits):</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-cyan-300 select-all font-semibold break-all bg-cyan-950/40 px-2 py-0.5 rounded">
                    {wallet.publicKey}
                  </span>
                  <button
                    onClick={() => handleCopy(wallet.publicKey, "pub")}
                    className="p-1.5 bg-slate-950 border border-slate-850 hover:bg-slate-900 rounded text-slate-400 hover:text-white cursor-pointer"
                  >
                    {copiedKey === "pub" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Key size={11} className="text-slate-500" />
                  Secret Key:
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-500 text-[10px] uppercase font-bold tracking-widest border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded">
                    Securely Encrypted on Server
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 border-t border-slate-800/60 pt-6 text-center space-y-3.5 py-4">
              <div className="p-3 bg-slate-950/50 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-slate-600 border border-slate-850">
                <Wallet2 size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-300 font-sans font-bold">
                  {walletError ? "Wallet Generation Failed" : "No Solana Wallet Linked"}
                </p>
                <p className="text-[10px] text-gray-500 font-mono mt-1 max-w-sm mx-auto leading-relaxed">
                  {walletError 
                    ? <span className="text-red-400">Error: {walletError}</span>
                    : "Please log in with Google using the button in the top right to securely generate and link a Solana wallet to your account."
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Portfolio Assets list breakdown */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <h4 className="text-xs font-sans font-black tracking-wider text-gray-400 uppercase mb-4 flex items-center gap-1.5">
            <Wallet2 size={13} className="text-cyan-400" />
            Asset Breakdown
          </h4>

          {wallet ? (
            <div className="space-y-2.5">
              {/* Native SOL asset balance */}
              <div className="p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center font-mono text-xs font-black text-cyan-400">
                    S
                  </div>
                  <div>
                    <span className="text-xs font-sans font-semibold text-gray-200 block">Solana</span>
                    <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">Native (SOL)</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-gray-100 block">
                    {wallet.solBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono block">
                    ${(wallet.solBalance * 145.00).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>

              {/* Meme Coin balances */}
              {Object.keys(wallet.memeBalances).length > 0 ? (
                Object.keys(wallet.memeBalances).map((symbol) => {
                  const bal = wallet.memeBalances[symbol] || 0;
                  return (
                    <div
                      key={symbol}
                      className="p-3 bg-slate-950/40 border border-slate-800/50 rounded-xl flex flex-col"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-sans font-black text-xs text-indigo-400">
                            {symbol.substring(0, 3)}
                          </div>
                          <div>
                            <span className="text-xs font-sans font-semibold text-gray-200 block">{symbol} Token</span>
                            <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">SPL Token</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-gray-100 block">
                            {bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      {onSwapAsset && (
                        <div className="mt-3 pt-3 border-t border-slate-800/40">
                          <button
                            onClick={() => onSwapAsset(symbol)}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-cyan-400 text-[10px] font-sans font-bold uppercase rounded-xl transition-colors cursor-pointer"
                          >
                            <RefreshCw size={12} /> Swap {symbol}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-[10px] text-slate-500 font-mono text-center py-6 border border-dashed border-slate-800 rounded-xl">
                  No tokens accumulated yet. Deposit SOL or execute a swap to populate portfolio!
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-mono text-center py-8">
              Solana account is empty. Generate a wallet keypair above first.
            </p>
          )}
        </div>
      </div>

      {/* Trading History Column */}
      <div className="space-y-6">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-col h-full max-h-[500px]">
          <h4 className="text-xs font-sans font-black tracking-wider text-gray-400 uppercase mb-4 flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-400" />
            Recent SWAP Transaction logs
          </h4>

          <div className="space-y-3 overflow-y-auto flex-1 scrollbar-none pr-1">
            {logs.length > 0 ? (
              logs.map((log) => {
                const isBuy = log.direction === "buy";
                return (
                  <div
                    key={log.id}
                    id={`log-${log.id}`}
                    className="p-3 bg-slate-950/40 hover:bg-slate-950 border border-slate-850 rounded-xl space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-sans font-black px-2 py-0.5 rounded-md ${
                        isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {log.direction.toUpperCase()}
                      </span>
                      <span className="text-[8px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 font-sans leading-relaxed">
                      {isBuy ? (
                        <>
                          Swapped <span className="font-mono font-bold text-gray-200">{log.amountSOL} SOL</span> for{" "}
                          <span className="font-mono font-bold text-cyan-400">{log.amountToken} {log.symbol}</span>
                        </>
                      ) : (
                        <>
                          Swapped <span className="font-mono font-bold text-cyan-400">{log.amountToken} {log.symbol}</span> for{" "}
                          <span className="font-mono font-bold text-gray-200">{log.amountSOL} SOL</span>
                        </>
                      )}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[9px] font-mono border-t border-slate-900/50 mt-1">
                      <span className={log.isSimulated ? "text-amber-500/80 font-medium" : "text-emerald-500/80 font-medium"}>
                        {log.isSimulated ? "Sandbox Sim" : "On-chain Mainnet"}
                      </span>
                      
                      <a
                        href={log.isSimulated ? "#" : `https://solscan.io/tx/${log.txHash}`}
                        target={log.isSimulated ? "_self" : "_blank"}
                        rel="noreferrer"
                        className="text-cyan-400/80 hover:text-cyan-300 hover:underline flex items-center gap-0.5"
                      >
                        Receipt
                        <ExternalLink size={8} />
                      </a>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-slate-600 font-mono text-[10px]">
                No trade receipts issued yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
