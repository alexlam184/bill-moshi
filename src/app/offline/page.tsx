import { CloudOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return <div className="grid min-h-[65dvh] place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-warning-soft text-warning"><CloudOff size={28} /></span><h1 className="mt-5 text-2xl font-extrabold tracking-tight">You’re offline</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">Previously opened screens still work, and new expenses are saved on this device until your connection returns.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-bold text-brand-ink">Back home</Link></div></div>;
}
