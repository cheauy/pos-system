"use client";
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
export default function SalesTrendChart({buckets,currency}:{buckets:{key:string;label:string;revenue:number;orders:number}[];currency:string}){
 const format=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency,notation:"compact"}).format(n);
 if(!buckets.some(b=>b.revenue>0||b.orders>0))return <p className="mt-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-800">No sales in this period.</p>;
 return <div className="mt-5 h-60 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={buckets} margin={{top:10,right:10,left:0,bottom:0}}><CartesianGrid vertical={false} strokeDasharray="4 5" stroke="#e2e8f0"/><XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} minTickGap={24}/><YAxis axisLine={false} tickLine={false} fontSize={11} width={58} tickFormatter={format}/><Tooltip formatter={value=>[new Intl.NumberFormat("en-US",{style:"currency",currency}).format(Number(value)),"Revenue"]} contentStyle={{borderRadius:12}}/><Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[5,5,0,0]} maxBarSize={48} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>;
}
