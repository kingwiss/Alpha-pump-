import { useState, useEffect } from "react";
import { Coins, ShieldAlert, Cpu, Wallet2, LayoutDashboard, Globe, LogIn, LogOut } from "lucide-react";
import { SolanaWallet } from "../types";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

interface HeaderProps {
  activeTab: "home" | "portfolio";
  setActiveTab: (tab: "home" | "portfolio") => void;
  wallet: SolanaWallet | null;
  onLogin: (token: string) => void;
  onLogout: () => void;
}

export default function Header({ activeTab, setActiveTab, wallet, onLogin, onLogout }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const token = await currentUser.getIdToken();
        onLogin(token);
      } else {
        onLogout();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google Sign-in failed:", error);
    }
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await signOut(auth);
      setActiveTab("home");
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  };

  return (
    <header className="relative bg-slate-950 border-b border-slate-900/80 px-4 py-3 flex items-center justify-between z-40">
      {/* Left Side: Profile or Branding */}
      <div className="flex items-center">
        {user ? (
          <div 
            onClick={() => setActiveTab("portfolio")}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 p-2 rounded-xl transition-colors"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-cyan-900 border border-cyan-700 flex items-center justify-center text-cyan-300 font-bold text-lg">
                {user.displayName?.[0] || user.email?.[0] || "?"}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-cyan-400 font-bold text-sm leading-tight">{user.displayName || user.email}</span>
              <span className="text-[10px] text-slate-400">View Dashboard</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-slate-950 font-black relative shadow-lg shadow-cyan-500/10">
              <Coins size={20} className="animate-spin" style={{ animationDuration: "12s" }} />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
              </span>
            </div>
            <div>
              <h1 className="text-base font-sans font-black tracking-tight text-white flex items-center gap-2">
                Alpha pump
                <span className="text-[9px] font-mono font-bold px-1 py-0.5 bg-cyan-950 text-cyan-400 rounded border border-cyan-500/20">V2.0</span>
              </h1>
            </div>
          </div>
        )}
      </div>

      {/* Right Side: Network Telemetry & Login/Logout */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 bg-slate-900/30 px-4 py-2 rounded-2xl border border-slate-800/40">
        <div className="hidden lg:flex items-center gap-2">
          <Globe size={13} className="text-emerald-400 animate-pulse" />
          <span className="text-gray-300 font-bold uppercase">Solana Mainnet</span>
        </div>

        {user ? (
          <>
            <div className="h-3 w-[1px] bg-slate-800 hidden lg:block" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut size={12} />
            </button>
          </>
        ) : (
          <>
            <div className="h-3 w-[1px] bg-slate-800 hidden lg:block" />
            <button
              onClick={handleLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
            >
              <LogIn size={12} />
              Google Login
            </button>
          </>
        )}
      </div>
    </header>
  );
}

