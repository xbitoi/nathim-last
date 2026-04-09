import { useState } from "react";
import { useBroadcastMessage, useGetContacts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Users, Phone, ShieldOff, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Broadcast() {
  const [content, setContent] = useState("");
  const broadcastMutation = useBroadcastMessage();
  const { toast } = useToast();
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const { data: contactsData, isLoading: loadingContacts } = useGetContacts({ limit: 500 });

  const allContacts = contactsData?.contacts ?? [];
  const activeContacts = allContacts.filter((c) => !c.isBlocked);
  const blockedContacts = allContacts.filter((c) => c.isBlocked);

  const handleSend = () => {
    if (!content.trim()) return;
    setResult(null);
    broadcastMutation.mutate(
      { data: { content } },
      {
        onSuccess: (res) => {
          setResult(res);
          if (res.success) {
            toast({
              title: "اكتمل الإرسال",
              description: `تم الإرسال إلى ${res.sent} رقم.`,
            });
            setContent("");
          } else {
            toast({
              title: "اكتمل مع أخطاء",
              description: "تم الإرسال مع بعض الإخفاقات.",
              variant: "destructive",
            });
          }
        },
        onError: () => {
          toast({
            title: "خطأ",
            description: "فشل إرسال الرسالة الجماعية.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">الإرسال الجماعي</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          إرسال رسالة لكل رقم سبق وتواصل مع ناظم.
        </p>
      </div>

      {/* Recipients Preview */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            الأرقام التي ستستقبل الرسالة
            {!loadingContacts && (
              <Badge variant="secondary" className="ml-auto text-sm font-bold">
                {activeContacts.length} رقم
              </Badge>
            )}
          </CardTitle>
          {blockedContacts.length > 0 && (
            <CardDescription className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldOff className="h-3 w-3" />
              {blockedContacts.length} رقم محظور — لن يستقبل الرسالة
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {loadingContacts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل الأرقام...
            </div>
          ) : activeContacts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>لا يوجد أرقام مسجلة بعد.</p>
              <p className="text-xs mt-1">ستظهر هنا الأرقام التي تواصلت مع ناظم عبر واتساب.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
              {activeContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-1.5 bg-muted/60 border border-border/40 rounded-full px-3 py-1 text-xs font-mono"
                >
                  <Phone className="h-3 w-3 text-primary" />
                  <span dir="ltr">{contact.phone}</span>
                  {contact.name && (
                    <span className="text-muted-foreground">· {contact.name}</span>
                  )}
                </div>
              ))}
              {blockedContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-1.5 bg-muted/30 border border-border/20 rounded-full px-3 py-1 text-xs font-mono opacity-40 line-through"
                  title="محظور — لن يستقبل"
                >
                  <ShieldOff className="h-3 w-3" />
                  <span dir="ltr">{contact.phone}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Composer */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            كتابة الرسالة
          </CardTitle>
          <CardDescription>
            ستُرسل هذه الرسالة لكل الأرقام المسجلة في السجل (
            {loadingContacts ? "..." : activeContacts.length} رقم).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              placeholder="اكتب رسالتك هنا..."
              className="min-h-[150px] resize-y text-base"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="textarea-broadcast"
            />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{content.length} حرف</span>
              <span>يدعم تنسيق واتساب (*غامق*, _مائل_)</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t border-border/50 pt-5 flex gap-3 items-center">
          <Button
            onClick={handleSend}
            disabled={!content.trim() || broadcastMutation.isPending || activeContacts.length === 0}
            className="w-full sm:w-auto px-8"
            data-testid="btn-send-broadcast"
          >
            {broadcastMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {broadcastMutation.isPending
              ? "جاري الإرسال..."
              : `إرسال لـ ${activeContacts.length} رقم`}
          </Button>
          {activeContacts.length === 0 && !loadingContacts && (
            <p className="text-xs text-muted-foreground">
              لا يوجد أرقام لإرسال الرسالة إليها.
            </p>
          )}
        </CardFooter>
      </Card>

      {/* Result */}
      {result && (
        <Alert
          className={
            result.failed > 0
              ? "bg-destructive/10 border-destructive/20"
              : "bg-emerald-500/10 border-emerald-500/20"
          }
        >
          <AlertTitle className="flex items-center gap-2">
            {result.failed === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            نتيجة الإرسال
          </AlertTitle>
          <AlertDescription className="mt-2">
            <ul className="list-none space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                تم الإرسال بنجاح: <strong>{result.sent}</strong>
              </li>
              {result.failed > 0 && (
                <li className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  فشل الإرسال: <strong>{result.failed}</strong>
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
