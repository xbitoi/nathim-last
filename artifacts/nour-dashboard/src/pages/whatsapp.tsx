import {
  useGetWhatsappStatus,
  useGetWhatsappQr,
  useDisconnectWhatsapp,
  useRequestWhatsappPairingCode,
  useClearWhatsappQr,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, QrCode, LogOut, CheckCircle2, AlertCircle, Loader2, Trash2, KeyRound, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

export default function Whatsapp() {
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGetWhatsappStatus();
  const { data: qrData, isLoading: qrLoading, refetch: refetchQr } = useGetWhatsappQr();
  const disconnectMutation = useDisconnectWhatsapp();
  const pairingMutation = useRequestWhatsappPairingCode();
  const clearQrMutation = useClearWhatsappQr();
  const { toast } = useToast();

  const [phoneInput, setPhoneInput] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPending, setPairingPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const isConnected = status?.connected;
  const isPairingReady = status?.status === "pairing_ready";
  const isQrReady = !isConnected && qrData?.qr;

  // Poll while not connected — 1s when waiting for pairing code, 3s otherwise
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isConnected) {
      const ms = pairingPending ? 1000 : 3000;
      interval = setInterval(() => {
        refetchStatus();
        refetchQr();
      }, ms);
    }
    return () => clearInterval(interval);
  }, [isConnected, pairingPending, refetchStatus, refetchQr]);

  // Sync pairing code from status polling
  useEffect(() => {
    if (status?.pairingCode) {
      setPairingCode(status.pairingCode);
      setPairingPending(false);
    } else if (isConnected) {
      setPairingCode(null);
      setPairingPending(false);
    }
  }, [status?.pairingCode, isConnected]);

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "✅ تم قطع الاتصال", description: "تم إنهاء جلسة واتساب." });
        setPairingCode(null);
        refetchStatus();
      },
      onError: () => {
        toast({ title: "❌ خطأ", description: "فشل قطع الاتصال.", variant: "destructive" });
      },
    });
  };

  const handleClearQr = () => {
    clearQrMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "🔄 تم المسح", description: "تم مسح الكود وإعادة التوليد." });
        refetchStatus();
        refetchQr();
      },
      onError: () => {
        toast({ title: "❌ خطأ", description: "فشل مسح الكود.", variant: "destructive" });
      },
    });
  };

  const handleRequestPairingCode = () => {
    const clean = phoneInput.replace(/\D/g, "");
    if (!clean) {
      toast({ title: "⚠️ الرقم مطلوب", description: "أدخل رقم الهاتف مع رمز الدولة.", variant: "destructive" });
      return;
    }
    pairingMutation.mutate(
      { data: { phone: clean } },
      {
        onSuccess: (data) => {
          if (data.pairingCode) {
            // Code came back immediately (rare)
            setPairingCode(data.pairingCode);
            setPairingPending(false);
            toast({ title: "✅ تم توليد الكود", description: "أدخل الكود في تطبيق واتساب." });
          } else {
            // Code is generating — polling will pick it up
            setPairingPending(true);
            toast({ title: "⏳ جارٍ التوليد...", description: "سيظهر الكود خلال ثوانٍ." });
          }
          refetchStatus();
        },
        onError: (err: any) => {
          setPairingPending(false);
          toast({
            title: "❌ فشل توليد الكود",
            description: err?.message ?? "تحقق من الرقم وحاول مجدداً.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCopy = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/-/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">اتصال واتساب</h1>
        <p className="text-muted-foreground mt-1 text-sm">ربط حسابك على واتساب بالوكيل الذكي.</p>
      </div>

      {statusLoading ? (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
      ) : isConnected ? (
        /* ── Connected State ── */
        <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-emerald-500">متصل ✅</CardTitle>
                <CardDescription>الوكيل يعمل بشكل كامل</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">الرقم المتصل</div>
                <div className="font-mono text-lg">+{status?.phone}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">اسم الحساب</div>
                <div className="font-medium text-lg">{status?.name || "—"}</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t border-border/50 pt-6">
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className="w-full sm:w-auto"
            >
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
              قطع الاتصال
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* ── Disconnected State — QR or Phone Tabs ── */
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle>ربط الجهاز</CardTitle>
            <CardDescription>
              اختر طريقة الربط: مسح رمز QR، أو الربط برقم الهاتف مباشرة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="qr" className="gap-2">
                  <QrCode className="h-4 w-4" />
                  رمز QR
                </TabsTrigger>
                <TabsTrigger value="phone" className="gap-2">
                  <Phone className="h-4 w-4" />
                  ربط بالرقم
                </TabsTrigger>
              </TabsList>

              {/* ── QR Tab ── */}
              <TabsContent value="qr">
                <div className="flex flex-col items-center py-6 min-h-[280px]">
                  {isQrReady ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-white rounded-xl shadow-sm border">
                        <img src={qrData?.qr || ""} alt="WhatsApp QR Code" className="w-64 h-64" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        افتح واتساب ← القائمة ← الأجهزة المرتبطة ← ربط جهاز
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearQr}
                        disabled={clearQrMutation.isPending}
                        className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        {clearQrMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        مسح الكود وإعادة التوليد
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground gap-4">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <p className="text-sm">جارٍ توليد رمز QR...</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Phone Pairing Tab ── */}
              <TabsContent value="phone">
                <div className="flex flex-col gap-5 py-4">
                  {!pairingCode ? (
                    pairingPending ? (
                      /* ── Waiting for code from polling ── */
                      <div className="flex flex-col items-center gap-4 py-8">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <div className="text-center space-y-1">
                          <p className="font-medium">جارٍ توليد كود الربط...</p>
                          <p className="text-xs text-muted-foreground">
                            يتصل واتساب بالخادم — سيظهر الكود خلال ثوانٍ
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPairingPending(false); setPhoneInput(""); }}
                          className="gap-2 mt-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="phone-input">رقم الهاتف (مع رمز الدولة)</Label>
                        <Input
                          id="phone-input"
                          type="tel"
                          dir="ltr"
                          placeholder="مثال: 212612345678"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          className="font-mono"
                          disabled={pairingMutation.isPending}
                        />
                        <p className="text-xs text-muted-foreground">
                          أدخل الرقم بدون رمز + وبدون مسافات — مثال: 213xxxxxxxx للجزائر، 212xxxxxxxx للمغرب
                        </p>
                      </div>
                      <Button
                        onClick={handleRequestPairingCode}
                        disabled={pairingMutation.isPending || !phoneInput.trim()}
                        className="w-full gap-2"
                      >
                        {pairingMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الإرسال...</>
                        ) : (
                          <><KeyRound className="h-4 w-4" /> طلب كود الربط</>
                        )}
                      </Button>
                    </>
                    )
                  ) : (
                    /* ── Pairing Code Display ── */
                    <div className="flex flex-col items-center gap-5 py-4">
                      <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                        <KeyRound className="h-7 w-7" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">أدخل هذا الكود في واتساب</p>
                        <p className="text-xs text-muted-foreground">
                          الإعدادات ← الأجهزة المرتبطة ← ربط الجهاز ← ربط برقم الهاتف
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-3 px-6 py-4 bg-muted rounded-xl border border-border cursor-pointer select-all hover:bg-muted/70 transition-colors"
                        onClick={handleCopy}
                      >
                        <span className="font-mono text-4xl font-bold tracking-[0.3em] text-primary">
                          {pairingCode}
                        </span>
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        الكود صالح لفترة محدودة. إذا انتهت صلاحيته، اضغط على "طلب كود جديد".
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setPairingCode(null); setPhoneInput(""); }}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        طلب كود جديد
                      </Button>

                      {isPairingReady && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          في انتظار تأكيد واتساب...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Alert className="bg-primary/5 border-primary/20 text-primary">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>ملاحظة</AlertTitle>
        <AlertDescription className="text-sm opacity-90 mt-1">
          واتساب يعمل بتقنية Baileys متعدد الأجهزة. لا تقطع الاتصال من هاتفك لضمان استمرارية الوكيل.
        </AlertDescription>
      </Alert>
    </div>
  );
}
