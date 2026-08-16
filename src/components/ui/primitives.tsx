import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.35rem] border border-line bg-white card-shadow ${className}`}>{children}</section>;
}

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-[#103a55] hover:bg-[#62afe5]",
    secondary: "border border-line bg-white text-ink hover:bg-slate-50",
    danger: "bg-danger-soft text-danger hover:bg-red-100",
    ghost: "bg-transparent text-muted hover:bg-slate-100",
  }[variant];
  return <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : hint ? <span className="text-xs font-normal leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export const fieldClass = "min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand-soft";

export function Avatar({ name, color = "#6EBBF1", size = "md" }: { name: string; color?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-12 text-base" : "size-10 text-sm";
  return <span className={`grid shrink-0 place-items-center rounded-full font-extrabold text-white ${sizeClass}`} style={{ backgroundColor: color }}>{name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>;
}

export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.13em] text-brand-dark">{eyebrow}</p>}
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.045em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="grid justify-items-center px-6 py-12 text-center"><span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-dark">{icon}</span><h2 className="font-extrabold text-ink">{title}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
