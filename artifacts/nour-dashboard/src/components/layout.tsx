import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, MessageSquare, Phone, Settings, Send, ScrollText } from "lucide-react";
import { ReactNode } from "react";
import { useGetWhatsappStatus } from "@workspace/api-client-react";

const navigation = [
  { name: "الرئيسية",    nameEn: "Dashboard", href: "/",         icon: LayoutDashboard },
  { name: "جهات الاتصال", nameEn: "Contacts",  href: "/contacts", icon: Users },
  { name: "الرسائل",     nameEn: "Messages",  href: "/messages", icon: MessageSquare },
  { name: "إرسال",       nameEn: "Broadcast", href: "/broadcast", icon: Send },
  { name: "واتساب",      nameEn: "WhatsApp",  href: "/whatsapp", icon: Phone },
  { name: "سجل النشاط",  nameEn: "Logs",      href: "/logs",     icon: ScrollText },
  { name: "إعدادات",     nameEn: "Settings",  href: "/settings", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useGetWhatsappStatus();

  return (
    <div className="bg-background dark text-foreground">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border">
          <div className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
            <span className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary border border-primary/20">ن</span>
            ناظم
          </div>
          <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground font-mono">Ops</div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-6 px-4">
          <nav className="flex-1 space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-link-${item.nameEn.toLowerCase()}`}
                >
                  <item.icon className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"}`} />
                  {item.nameEn}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-sidebar-accent/50 border border-sidebar-border">
            <div className="relative flex h-3 w-3 flex-shrink-0">
              {status?.connected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-sidebar-foreground">{status?.connected ? "System Online" : "System Offline"}</span>
              {status?.connected && status.phone && (
                <span className="text-[10px] text-muted-foreground font-mono truncate">{status.phone}</span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 h-12 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary border border-primary/20 text-sm font-bold flex-shrink-0">ن</span>
          <span className="text-base font-bold text-primary">ناظم</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative flex h-2 w-2 flex-shrink-0">
            {status?.connected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            )}
          </div>
          <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
            {status?.connected ? (status.phone || "متصل") : "غير متصل"}
          </span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="md:pl-64">
        {/* Mobile: pt for top-bar (48px) + pb for bottom-nav (60px) */}
        <main className="min-h-screen pt-12 pb-16 md:pt-0 md:pb-0 md:min-h-0">
          <div className="px-3 py-4 sm:px-6 md:px-8 md:py-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border">
        <div className="flex items-center justify-around h-14 px-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`mobile-nav-${item.nameEn.toLowerCase()}`}
              >
                <item.icon className={`h-[18px] w-[18px] ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-[9px] font-medium leading-none">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
