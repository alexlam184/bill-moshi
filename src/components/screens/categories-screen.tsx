"use client";

import { ArrowLeft, Plus, Tags } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, Field, PageTitle, fieldClass } from "@/components/ui/primitives";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";

export function CategoriesScreen() {
  const { snapshot, addCategory } = useBillMoshi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🧾");
  const [error, setError] = useState("");
  useUnsavedChanges(open && Boolean(name || emoji !== "🧾"));
  function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) { setError("Give the Category a name."); requestAnimationFrame(() => document.querySelector<HTMLElement>("input[name='name']")?.focus()); return; } addCategory(name, emoji); setName(""); setEmoji("🧾"); setError(""); setOpen(false); }
  return <div className="grid gap-6"><Link href="/profile" className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> Profile</Link><PageTitle eyebrow={`${snapshot.categories.length} available`} title="Categories" subtitle="Keep spending organized with defaults or your own labels." action={<Button type="button" className="size-11 min-h-11 p-0" onClick={() => setOpen((value) => !value)} aria-label="New category"><Plus size={19} /></Button>} />{open && <Card className="p-5"><form onSubmit={submit} className="grid grid-cols-[84px_1fr] gap-3" noValidate><Field label="Icon"><input className={`${fieldClass} text-center text-xl`} value={emoji} onChange={(event) => setEmoji(event.target.value)} /></Field><Field label="Name" error={error}><input className={fieldClass} value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Pet Care…" /></Field><Button type="submit" className="col-span-2">Add Category</Button></form></Card>}<Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3">{snapshot.categories.map((category) => <div key={category.id} className="virtual-list-item flex min-h-20 items-center gap-3 bg-white p-4"><span className="grid size-10 place-items-center rounded-xl bg-slate-50 text-xl">{category.emoji}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{category.name}</p><p className="mt-0.5 text-[0.68rem] text-muted">{category.isCustom ? "Custom" : "Default"}</p></div></div>)}</Card><div className="flex items-center justify-center gap-2 text-xs text-muted"><Tags size={14} /> Custom categories sync to your workbook.</div></div>;
}
