"use client";
import Link from "next/link";
import { toast } from "sonner";
import { markNotificationsRead } from "./read-actions";

export default function NotificationLink({id,href,className,children}:{id:string;href:string;className:string;children:React.ReactNode}){
  async function mark(){try {await markNotificationsRead([id]); window.dispatchEvent(new Event("notifications-read"));} catch {toast.error("Unable to mark notification as read. Please try again.");}}
  return <Link href={href} onClick={()=>void mark()} className={className}>{children}</Link>;
}
