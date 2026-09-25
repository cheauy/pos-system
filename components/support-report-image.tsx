/* eslint-disable @next/next/no-img-element -- Authenticated report images must not enter the public optimizer cache. */
export default function SupportReportImage({id}:{id:string}){
  const src=`/api/support/reports/${id}/image`;
  return <a href={src} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block" aria-label="Open report image"><img src={src} alt="Attached report image" loading="lazy" className="max-h-64 max-w-full rounded-xl border border-slate-200 object-contain"/></a>;
}
