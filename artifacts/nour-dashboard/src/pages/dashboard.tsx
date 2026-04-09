import { useGetStats, useGetActivity, useGetMessages, useGetWhatsappStatus } from "@workspace/api-client-react";
import { Users, MessageSquare, Send, Activity, Phone, PhoneOff, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: activity, isLoading: activityLoading } = useGetActivity();
  const { data: recentMessages, isLoading: messagesLoading } = useGetMessages({ limit: 5 });
  const { data: status } = useGetWhatsappStatus();

  return (
    <div className="space-y-3 md:space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-xl md:text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-0.5 text-xs md:text-sm">نظرة عامة على نشاط الوكيل.</p>
      </div>

      {/* Mobile: Status strip */}
      <div className={`md:hidden flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
        status?.connected
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-destructive/10 border-destructive/20 text-destructive"
      }`}>
        {status?.connected ? <Phone className="h-4 w-4 flex-shrink-0" /> : <PhoneOff className="h-4 w-4 flex-shrink-0" />}
        <span className="text-sm font-medium">{status?.connected ? "الوكيل يعمل" : "الوكيل متوقف"}</span>
        {status?.connected && status.phone && (
          <span className="text-xs font-mono ml-auto text-muted-foreground">{status.phone}</span>
        )}
      </div>

      {/* Stats grid — always 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <MiniStat label="جهات الاتصال" value={stats?.totalContacts} sub={`${stats?.activeContacts || 0} نشط`} icon={Users} loading={statsLoading} />
        <MiniStat label="الرسائل الكلية" value={stats?.totalMessages} sub={`${stats?.todayMessages || 0} اليوم`} icon={MessageSquare} loading={statsLoading} />
        <MiniStat label="مرسلة بالذكاء" value={stats?.messagesSent} sub="ردود صادرة" icon={Send} loading={statsLoading} />
        <MiniStat label="مستقبلة" value={stats?.messagesReceived} sub="طلبات واردة" icon={Activity} loading={statsLoading} />
      </div>

      {/* Chart */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-1 pt-3 px-3 md:px-6 md:pt-6 md:pb-2">
          <CardTitle className="text-sm md:text-lg">نشاط الرسائل</CardTitle>
          <CardDescription className="text-xs">آخر 7 أيام</CardDescription>
        </CardHeader>
        <CardContent className="h-[160px] md:h-[280px] px-1 md:px-6 pb-3 md:pb-6">
          {activityLoading ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => new Date(val).toLocaleDateString("ar", { weekday: "short" })}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="inbound" name="واردة" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outbound" name="صادرة" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Desktop: Status + Recent side by side */}
      <div className="hidden md:grid gap-5 md:grid-cols-7">
        <Card className="md:col-span-3 lg:col-span-2 bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">حالة النظام</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${status?.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
                {status?.connected ? <Phone className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
              </div>
              <div>
                <div className="font-semibold">{status?.connected ? "متصل" : "غير متصل"}</div>
                <div className="text-sm text-muted-foreground font-mono">{status?.phone || "لا توجد جلسة"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-4 lg:col-span-5 bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3">
            <CardTitle>آخر النشاطات</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentList messages={recentMessages?.messages} loading={messagesLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Mobile: Recent activity */}
      <div className="md:hidden">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">آخر النشاطات</h2>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-3 pb-2 px-3">
            <RecentList messages={recentMessages?.messages} loading={messagesLoading} />
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function MiniStat({ label, value, sub, icon: Icon, loading }: any) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="p-3 md:p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] md:text-sm text-muted-foreground leading-tight">{label}</span>
          <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
        </div>
        {loading ? (
          <Skeleton className="h-6 w-12 mt-1" />
        ) : (
          <div className="text-xl md:text-3xl font-bold leading-none">{value?.toLocaleString() ?? 0}</div>
        )}
        {sub && <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RecentList({ messages, loading }: { messages?: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!messages || messages.length === 0) {
    return <div className="text-center text-muted-foreground py-4 text-sm">لا توجد رسائل حديثة</div>;
  }
  return (
    <div className="space-y-2.5">
      {messages.map((msg) => (
        <div key={msg.id} className="flex items-start gap-2.5 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
          <div className={`mt-0.5 p-1 rounded-full flex-shrink-0 ${msg.direction === "inbound" ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"}`}>
            {msg.direction === "inbound" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{msg.contactName || msg.contactPhone}</p>
            <p className="text-[11px] text-muted-foreground truncate">{msg.content}</p>
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}
