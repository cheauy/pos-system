import { Coins, Link2 } from "lucide-react";

export default function CreditBadges({modeCredits,urlCredits}:{modeCredits:number;urlCredits:number}){
  return <div aria-label="Available change credits" className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:shrink-0">
    {[{count:modeCredits,label:"Mode credits available",hint:"Use to switch business mode",icon:Coins,tone:"bg-amber-50 text-amber-500 dark:bg-amber-950/40"},{count:urlCredits,label:"Store URL credits",hint:"Use to change Store URL",icon:Link2,tone:"bg-blue-50 text-blue-600 dark:bg-blue-950/40"}].map(({count,label,hint,icon:Icon,tone})=><div key={label} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:min-w-44 dark:border-slate-700 dark:bg-slate-900"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={21}/></span><div className="min-w-0"><p className="text-xl font-extrabold leading-6 text-slate-950 dark:text-white">{count}</p><p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-700 dark:text-slate-200">{label}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{hint}</p></div></div>)}
  </div>;
}
