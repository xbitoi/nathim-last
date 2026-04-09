import { useState } from "react";
import { useGetContacts, useGetContact, getGetContactQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Search, ShieldAlert, ArrowUpRight, ArrowDownLeft, MessageSquare, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const { data, isLoading } = useGetContacts({ search });

  return (
    <div className="space-y-3 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-3xl font-bold tracking-tight">جهات الاتصال</h1>
        <p className="text-muted-foreground mt-0.5 text-xs md:text-sm">إدارة الأرقام المتفاعلة مع الوكيل.</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ابحث برقم أو اسم..."
          className="pl-9 bg-card/50 h-9 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-contacts"
        />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border border-border/50 rounded-md bg-card/50 backdrop-blur overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead>الرقم / الاسم</TableHead>
              <TableHead>الرسائل</TableHead>
              <TableHead>آخر ظهور</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-right">عرض</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد جهات اتصال.</TableCell>
              </TableRow>
            ) : (
              data?.contacts.map((contact) => (
                <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedContactId(contact.id)}>
                  <TableCell>
                    <div className="font-medium font-mono">{contact.phone}</div>
                    {contact.name && <div className="text-xs text-muted-foreground">{contact.name}</div>}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="font-mono">{contact.messageCount}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(contact.lastSeen), { addSuffix: true })}</TableCell>
                  <TableCell>
                    {contact.isBlocked ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit"><ShieldAlert className="h-3 w-3" /> محظور</Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">نشط</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedContactId(contact.id); }} data-testid={`btn-view-contact-${contact.id}`}>عرض</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : data?.contacts.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">لا توجد جهات اتصال.</div>
        ) : (
          data?.contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-center gap-3 cursor-pointer active:bg-muted/30 transition-colors"
              onClick={() => setSelectedContactId(contact.id)}
              data-testid={`mobile-contact-${contact.id}`}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                {contact.name ? contact.name[0].toUpperCase() : contact.phone.slice(-2)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs font-medium truncate">{contact.phone}</div>
                {contact.name && <div className="text-[11px] text-muted-foreground truncate">{contact.name}</div>}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MessageSquare className="h-2.5 w-2.5" /> {contact.messageCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(contact.lastSeen), { addSuffix: true })}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {contact.isBlocked ? (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">محظور</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-500 border-emerald-500/20 bg-emerald-500/10">نشط</Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          ))
        )}
      </div>

      <ContactSlideOver contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
    </div>
  );
}

function ContactSlideOver({ contactId, onClose }: { contactId: number | null; onClose: () => void }) {
  const { data, isLoading } = useGetContact(contactId as number, {
    query: { enabled: !!contactId, queryKey: getGetContactQueryKey(contactId as number) },
  });

  return (
    <Sheet open={!!contactId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md border-l border-border bg-card p-0 flex flex-col">
        {isLoading ? (
          <div className="p-5 space-y-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="space-y-3 mt-6">
              <Skeleton className="h-14 w-3/4" />
              <Skeleton className="h-14 w-3/4 ml-auto" />
            </div>
          </div>
        ) : data ? (
          <>
            <SheetHeader className="p-4 border-b border-border/50 bg-muted/20">
              <SheetTitle className="font-mono text-base">{data.contact.phone}</SheetTitle>
              <SheetDescription className="text-xs">
                {data.contact.name || "اسم غير معروف"} • منذ {new Date(data.contact.firstSeen).toLocaleDateString("ar")}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {data.messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">لا توجد رسائل.</div>
              ) : (
                data.messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[82%] ${isInbound ? "items-start mr-auto" : "items-end ml-auto"}`}>
                      <div className={`px-3 py-2 rounded-2xl ${isInbound ? "bg-secondary text-secondary-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"}`}>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 px-1">
                        {isInbound ? <ArrowDownLeft className="h-2.5 w-2.5 text-muted-foreground" /> : <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {!isInbound && msg.aiModel && (
                          <span className="text-[10px] text-primary/70 font-mono">• {msg.aiModel}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
