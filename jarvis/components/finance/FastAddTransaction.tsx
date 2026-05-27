"use client";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES, ExpenseRow, IncomeRow } from "@/types";

interface FastAddTransactionProps {
  date: string;
  onUpdate?: () => void;
}

export function FastAddTransaction({ date, onUpdate }: FastAddTransactionProps) {
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [source, setSource] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [exp, inc] = await Promise.all([
      fetch(`/api/expenses?date=${date}`).then((r) => r.json()),
      fetch(`/api/income?date=${date}`).then((r) => r.json()),
    ]);
    setExpenses(exp);
    setIncomes(inc);
    onUpdate?.();
  }

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      if (tab === "expense") {
        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, amount: parseFloat(amount), category, description }),
        });
      } else {
        if (!source) { toast.error("Source is required"); return; }
        await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, amount: parseFloat(amount), source, description }),
        });
      }
      setAmount("");
      setDescription("");
      if (tab === "income") setSource("");
      amountRef.current?.focus();
      await load();
    } catch {
      toast.error("Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(type: "expense" | "income", id: number) {
    await fetch(`/api/${type === "expense" ? "expenses" : "income"}?id=${id}`, { method: "DELETE" });
    await load();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const net = totalIncome - totalExpenses;

  return (
    <div className="space-y-4">
      {/* Net summary */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-red-500/10 border border-red-400/20 p-3">
          <div className="text-xs text-zinc-500">Expenses</div>
          <div className="text-lg font-bold text-red-400">${totalExpenses.toFixed(2)}</div>
        </div>
        <div className="rounded-lg bg-green-500/10 border border-green-400/20 p-3">
          <div className="text-xs text-zinc-500">Income</div>
          <div className="text-lg font-bold text-green-400">${totalIncome.toFixed(2)}</div>
        </div>
        <div className={`rounded-lg border p-3 ${net >= 0 ? "bg-green-500/10 border-green-400/20" : "bg-red-500/10 border-red-400/20"}`}>
          <div className="text-xs text-zinc-500">Net</div>
          <div className={`text-lg font-bold ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
            {net >= 0 ? "+" : ""}${net.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-lg bg-zinc-800 p-1">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t === "expense" ? "💸 Expense" : "💰 Income"}
          </button>
        ))}
      </div>

      {/* Fast-add row */}
      <div className="flex gap-2 flex-wrap">
        <Input
          ref={amountRef}
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-28"
        />
        {tab === "expense" ? (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder="Source (e.g. Client A)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-44"
          />
        )}
        <Input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-[140px]"
        />
        <Button variant="primary" onClick={handleAdd} disabled={saving} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Transaction lists */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {tab === "expense" && expenses.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-sm">
            <span className="text-red-400 font-medium w-16 shrink-0">${e.amount.toFixed(2)}</span>
            <span className="text-zinc-400 text-xs w-24 shrink-0">{e.category}</span>
            <span className="text-zinc-300 flex-1 truncate">{e.description ?? "—"}</span>
            <button onClick={() => handleDelete("expense", e.id)} className="text-zinc-600 hover:text-red-400 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {tab === "income" && incomes.map((i) => (
          <div key={i.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-sm">
            <span className="text-green-400 font-medium w-16 shrink-0">${i.amount.toFixed(2)}</span>
            <span className="text-zinc-400 text-xs w-24 shrink-0">{i.source}</span>
            <span className="text-zinc-300 flex-1 truncate">{i.description ?? "—"}</span>
            <button onClick={() => handleDelete("income", i.id)} className="text-zinc-600 hover:text-red-400 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {tab === "expense" && expenses.length === 0 && (
          <p className="text-zinc-600 text-sm py-2 text-center">No expenses logged yet</p>
        )}
        {tab === "income" && incomes.length === 0 && (
          <p className="text-zinc-600 text-sm py-2 text-center">No income logged yet</p>
        )}
      </div>
    </div>
  );
}
