import { useState, useEffect, useCallback } from "react";
import { useGetSystemLogs, useClearSystemLogs } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SystemLog } from "@workspace/api-client-react";
import {
  Wifi, WifiOff, Bot, AlertTriangle, CheckCircle2,
  XCircle, Info, RefreshCw, Trash2, ChevronDown, ChevronRight,
  Zap, Server,
} from "lucide-react";

const LEVEL_CONFIG = {
  success: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    row:   "border-l-emerald-500",
    icon:  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />,
    label: "نجاح",
  },
  info: {
    badge: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    row:   "border-l-sky-500",
    icon:  <Info className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />,
    label: "معلومة",
  },
  warn: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    row:   "border-l-amber-500",
    icon:  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />,
    label: "تحذير",
  },
  error: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    row:   "border-l-red-500",
    icon:  <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />,
    label: "خطأ",
  },
} as const;

const CATEGORY_CONFIG = {
  whatsapp: {
    icon:  <Wifi className="h-3.5 w-3.5" />,
    label: "واتساب",
    badge: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  ai: {
    icon:  <Zap className="h-3.5 w-3.5" />,
    label: "الذكاء الاصطناعي",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  system: {
    icon:  <Server className="h-3.5 w-3.5" />,
    label: "النظام",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
} as const;

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("ar-DZ", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit",
    hour12: false,
  });
}

function LogRow({ log }: { log: SystemLog }) {
  const [expanded, setExpanded] = useState(false);
  const lvl = LEVEL_CONFIG[log.level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info;
  const cat = CATEGORY_CONFIG[log.category as keyof typeof CATEGORY_CONFIG] ?? CATEGORY_CONFIG.system;
  const hasDetails = !!log.details;

  let parsedDetails: Record<string, unknown> | null = null;
  if (hasDetails) {
    try { parsedDetails = JSON.parse(log.details!); } catch { parsedDetails = { raw: log.details }; }
  }

  return (
    <div className={`border-l-2 ${lvl.row} bg-card/50 hover:bg-card transition-colors`}>
      <div
        className={`flex items-start gap-3 px-4 py-3 ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setExpanded(p => !p)}
      >
        {/* Level icon */}
        <div className="mt-0.5">{lvl.icon}</div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-mono ${lvl.badge}`}>
              {lvl.label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 flex items-center gap-1 ${cat.badge}`}>
              {cat.icon} {cat.label}
            </Badge>
            <code className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              {log.event}
            </code>
          </div>
          <p className="text-sm text-foreground leading-snug" dir="auto">{log.message}</p>
        </div>

        {/* Timestamp + expand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
            {formatTime(log.timestamp)}
          </span>
          {hasDetails && (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && parsedDetails && (
        <div className="px-4 pb-3 mr-7">
          <pre className="text-[11px] font-mono text-muted-foreground bg-muted/40 rounded-md p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(parsedDetails, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-1">
      <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function Logs() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterLevel, setFilterLevel] = useState<string>("");

  const { data, refetch, isFetching } = useGetSystemLogs(
    { limit: 200, category: filterCategory || undefined, level: filterLevel || undefined },
    { refetchInterval: autoRefresh ? 5000 : false },
  );

  const { mutateAsync: clearLogs, isPending: clearing } = useClearSystemLogs();

  const handleClear = useCallback(async () => {
    if (!confirm("هل تريد حذف جميع السجلات؟")) return;
    await clearLogs();
    refetch();
  }, [clearLogs, refetch]);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;

  // Stats from current data (not filtered)
  const counts = logs.reduce(
    (acc, l) => { acc[l.level] = (acc[l.level] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-5" dir="rtl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">سجل النشاط</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} سجل — يتجدد كل 5 ثوانٍ تلقائياً
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoRefresh(p => !p)}
            className={`text-xs gap-1.5 ${autoRefresh ? "text-emerald-400" : "text-muted-foreground"}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh && !isFetching ? "animate-spin" : ""}`} />
            {autoRefresh ? "تلقائي" : "متوقف"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={clearing || logs.length === 0}
            className="text-xs gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            مسح الكل
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="نجح"    value={counts.success ?? 0} color="text-emerald-400" />
        <StatCard label="تحذير"  value={counts.warn    ?? 0} color="text-amber-400"   />
        <StatCard label="خطأ"    value={counts.error   ?? 0} color="text-red-400"     />
        <StatCard label="معلومة" value={counts.info    ?? 0} color="text-sky-400"     />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground self-center">تصفية:</span>

        {/* Category filters */}
        {(["", "whatsapp", "ai", "system"] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${
              filterCategory === cat
                ? "bg-primary/20 border-primary/50 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {cat === "" ? "الكل" : CATEGORY_CONFIG[cat].label}
          </button>
        ))}

        <span className="text-border">|</span>

        {/* Level filters */}
        {(["", "success", "warn", "error"] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(lvl)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${
              filterLevel === lvl
                ? "bg-primary/20 border-primary/50 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {lvl === "" ? "كل المستويات" : LEVEL_CONFIG[lvl].label}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Bot className="h-10 w-10 opacity-30" />
            <p className="text-sm">لا توجد سجلات بعد</p>
          </div>
        ) : (
          logs.map(log => <LogRow key={log.id} log={log} />)
        )}
      </div>

    </div>
  );
}
