import { ReceiptText } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-dark shadow-sm">
        <ReceiptText size={20} strokeWidth={2.4} aria-hidden="true" />
      </span>
      {!compact && <span className="text-[1.08rem] font-extrabold tracking-[-0.035em] text-ink">Bill Moshi</span>}
    </div>
  );
}
