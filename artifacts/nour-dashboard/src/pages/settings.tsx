import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, useClearMessages, useClearContacts } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Trash2, MessageSquareOff, UsersRound, Save, CloudUpload, Cloud, CloudOff, RotateCcw, Upload, Video, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const settingsSchema = z.object({
  ownerName: z.string().optional(),
  ownerEmail: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  ownerPhone: z.string().optional(),
  adminPhone: z.string().optional(),
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  projectLink: z.union([z.string().url("Must be a valid URL"), z.literal("")]).optional(),
  demoVideoUrl: z.string().optional(),
  geminiApiKey: z.string().optional(),
  geminiApiKey2: z.string().optional(),
  geminiApiKey3: z.string().optional(),
  geminiApiKey4: z.string().optional(),
  geminiApiKey5: z.string().optional(),
  geminiApiKey6: z.string().optional(),
  geminiModel: z.string().optional(),
  groqApiKey: z.string().optional(),
  groqModel: z.string().optional(),
  aiModel: z.enum(["gemini", "groq"]),
  agentPersonality: z.string().optional(),
  autoReply: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

// ── Video Uploader Component ──────────────────────────────────────────────────
function VideoUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      toast({ title: "خطأ", description: "يُقبل ملفات الفيديو فقط", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الفيديو يجب أن يكون أقل من 50 ميجابايت", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(10);
    setFileName(file.name);

    try {
      // Step 1: Get presigned URL
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("فشل في الحصول على رابط الرفع");
      const { uploadURL, objectPath } = await metaRes.json();
      setProgress(30);

      // Step 2: Upload directly to GCS
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(30 + Math.round((e.loaded / e.total) * 60));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
      setProgress(95);

      // Step 3: Construct serving URL
      const servingUrl = `${window.location.origin}/api/storage${objectPath}`;
      onChange(servingUrl);
      setProgress(100);
      toast({ title: "✅ تم رفع الفيديو", description: "ناظم سيرسله لمن يطلبه" });
    } catch (err: any) {
      toast({ title: "خطأ في الرفع", description: err?.message ?? "حاول مجدداً", variant: "destructive" });
      setFileName("");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }

  const isUploaded = Boolean(value);
  const displayName = fileName || (isUploaded ? value.split("/").pop() ?? "فيديو مرفوع" : "");

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {isUploaded ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
          <Video className="h-5 w-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-600">✅ فيديو مرفوع وجاهز للإرسال</p>
            <p className="text-xs text-muted-foreground truncate">{displayName}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="h-3 w-3 mr-1" /> استبدال
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { onChange(""); setFileName(""); }} disabled={uploading}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 cursor-pointer transition-colors"
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Video className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground text-center">
            {uploading ? `جاري الرفع... ${fileName}` : "اضغط لاختيار فيديو من جهازك"}
          </p>
          <p className="text-xs text-muted-foreground/60">MP4، MOV — حتى 50 ميجابايت</p>
        </div>
      )}

      {uploading && progress > 0 && (
        <Progress value={progress} className="h-1.5" />
      )}
    </div>
  );
}

interface ModelOption { id: string; name: string; description: string; }
type FetchStatus = "idle" | "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

function ModelSelector({ provider, apiKey, value, onChange }: {
  provider: "gemini" | "groq"; apiKey: string; value: string; onChange: (v: string) => void;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const fetchModels = useCallback(async () => {
    if (!apiKey.trim()) {
      toast({ title: "Missing API Key", description: `Enter the ${provider === "gemini" ? "Gemini" : "Groq"} API key first.`, variant: "destructive" });
      return;
    }
    setStatus("loading"); setError("");
    try {
      const res = await fetch(`/api/settings/models/${provider}?key=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setModels(data.models ?? []);
      setStatus("success");
      if ((data.models ?? []).length === 0) setError("No compatible models found for this key.");
      else if (!value) onChange(data.models[0].id);
    } catch (e: any) { setStatus("error"); setError(e.message ?? "Unknown error"); }
  }, [apiKey, provider, value, onChange, toast]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={fetchModels} disabled={status === "loading"} className="text-xs gap-1.5">
          {status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {models.length > 0 ? "Refresh Models" : "Fetch Models"}
        </Button>
        {status === "success" && models.length > 0 && (
          <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />{models.length} models</Badge>
        )}
        {status === "error" && (
          <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs gap-1"><AlertCircle className="h-3 w-3" />{error}</Badge>
        )}
      </div>
      {models.length > 0 && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="font-mono text-sm"><SelectValue placeholder="Select a model..." /></SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{m.name}</span>
                  {m.description && <span className="text-xs text-muted-foreground">{m.description}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {models.length === 0 && status !== "loading" && (
        <p className="text-xs text-muted-foreground">
          {status === "idle" ? `Click "Fetch Models" to load available ${provider === "gemini" ? "Gemini" : "Groq"} models` : error || "No models available"}
        </p>
      )}
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium transition-all px-2 py-1 rounded-md ${
      status === "saving" ? "text-muted-foreground bg-muted/50" :
      status === "saved"  ? "text-green-400 bg-green-400/10" :
                            "text-red-400 bg-red-400/10"
    }`}>
      {status === "saving" && <><CloudUpload className="h-3.5 w-3.5 animate-pulse" />جاري الحفظ...</>}
      {status === "saved"  && <><Cloud className="h-3.5 w-3.5" />تم الحفظ ✓</>}
      {status === "error"  && <><CloudOff className="h-3.5 w-3.5" />فشل الحفظ</>}
    </span>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showGeminiKeys, setShowGeminiKeys] = useState([false, false, false, false, false, false]);
  const [showGroq, setShowGroq] = useState(false);
  const toggleGeminiKey = (i: number) => setShowGeminiKeys(prev => prev.map((v, idx) => idx === i ? !v : v));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Refs to avoid stale closures and timing issues
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadyRef = useRef(false);   // true once form is populated from server
  const isSavingRef = useRef(false);  // prevent concurrent saves

  const clearMessagesMutation = useClearMessages({
    mutation: {
      onSuccess: (data) => { toast({ title: "✅ تم مسح الرسائل", description: data.message }); queryClient.invalidateQueries(); },
      onError: () => toast({ title: "خطأ", description: "فشل مسح الرسائل", variant: "destructive" }),
    },
  });

  const clearContactsMutation = useClearContacts({
    mutation: {
      onSuccess: (data) => { toast({ title: "✅ تم مسح البيانات", description: data.message }); queryClient.invalidateQueries(); },
      onError: () => toast({ title: "خطأ", description: "فشل مسح البيانات", variant: "destructive" }),
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ تمت إعادة التعيين", description: "ناظم الآن كأنه وُلد من جديد — أرسل كيرا لإعادة تسجيل المشرف." });
      queryClient.invalidateQueries();
      form.reset({
        ownerName: "", ownerEmail: "", ownerPhone: "", adminPhone: "",
        projectName: "", projectDescription: "", projectLink: "", demoVideoUrl: "",
        geminiApiKey: "", geminiApiKey2: "", geminiApiKey3: "",
        geminiApiKey4: "", geminiApiKey5: "", geminiApiKey6: "",
        geminiModel: "", groqApiKey: "", groqModel: "",
        aiModel: "gemini", agentPersonality: "", autoReply: true,
        maintenanceMode: false,
        maintenanceMessage: "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
      });
    },
    onError: () => toast({ title: "خطأ", description: "فشل في إعادة التعيين", variant: "destructive" }),
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ownerName: "", ownerEmail: "", ownerPhone: "", adminPhone: "",
      projectName: "", projectDescription: "", projectLink: "", demoVideoUrl: "",
      geminiApiKey: "", geminiApiKey2: "", geminiApiKey3: "",
      geminiApiKey4: "", geminiApiKey5: "", geminiApiKey6: "",
      geminiModel: "", groqApiKey: "", groqModel: "",
      aiModel: "gemini", agentPersonality: "", autoReply: true,
      maintenanceMode: false,
      maintenanceMessage: "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
    }
  });

  // Populate form once settings load from server
  useEffect(() => {
    if (!settings) return;
    isReadyRef.current = false;
    form.reset({
      ...settings,
      ownerName: settings.ownerName || "",
      ownerEmail: settings.ownerEmail || "",
      ownerPhone: settings.ownerPhone || "",
      adminPhone: (settings as any).adminPhone || "",
      projectName: settings.projectName || "",
      projectDescription: settings.projectDescription || "",
      projectLink: settings.projectLink || "",
      demoVideoUrl: (settings as any).demoVideoUrl || "",
      geminiApiKey:  settings.geminiApiKey  || "",
      geminiApiKey2: (settings as any).geminiApiKey2 || "",
      geminiApiKey3: (settings as any).geminiApiKey3 || "",
      geminiApiKey4: (settings as any).geminiApiKey4 || "",
      geminiApiKey5: (settings as any).geminiApiKey5 || "",
      geminiApiKey6: (settings as any).geminiApiKey6 || "",
      geminiModel: (settings as any).geminiModel || "",
      groqApiKey: settings.groqApiKey || "",
      groqModel: (settings as any).groqModel || "",
      agentPersonality: settings.agentPersonality || "",
      maintenanceMode: (settings as any).maintenanceMode ?? false,
      maintenanceMessage: (settings as any).maintenanceMessage || "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
    });
    // Allow watch to fire after form is fully populated
    setTimeout(() => { isReadyRef.current = true; }, 300);
  }, [settings]);

  // Core save function — used by both auto-save and manual button
  const doSave = useCallback((showToast = false) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const data = form.getValues();
    setSaveStatus("saving");

    updateMutation.mutate({ data: data as any }, {
      onSuccess: (newSettings) => {
        queryClient.setQueryData(getGetSettingsQueryKey(), newSettings);
        setSaveStatus("saved");
        isSavingRef.current = false;
        if (showToast) toast({ title: "✅ تم الحفظ", description: "تم حفظ الإعدادات بنجاح." });
        setTimeout(() => setSaveStatus("idle"), 2500);
      },
      onError: () => {
        setSaveStatus("error");
        isSavingRef.current = false;
        if (showToast) toast({ title: "خطأ", description: "فشل حفظ الإعدادات.", variant: "destructive" });
        setTimeout(() => setSaveStatus("idle"), 3000);
      },
    });
  }, [form, updateMutation, queryClient, toast]);

  // Auto-save: subscribe to form changes, debounce 1.5s
  // Using empty deps so subscription is created once; doSave ref handles freshness
  const doSaveRef = useRef(doSave);
  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  useEffect(() => {
    const { unsubscribe } = form.watch(() => {
      if (!isReadyRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        doSaveRef.current(false);
      }, 1500);
    });
    return () => {
      unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []); // intentionally empty — subscription lives for component lifetime

  const geminiApiKey = form.watch("geminiApiKey") ?? "";
  const groqApiKey   = form.watch("groqApiKey") ?? "";
  const geminiModel  = form.watch("geminiModel") ?? "";
  const groqModel    = form.watch("groqModel") ?? "";

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">الإعدادات</h1>
          <p className="text-muted-foreground mt-1 text-sm">يُحفظ تلقائياً بعد 1.5 ثانية من آخر تغيير.</p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatusBadge status={saveStatus} />
          <Button
            type="button"
            onClick={() => doSave(true)}
            disabled={saveStatus === "saving"}
            size="sm"
            className="gap-1.5"
          >
            {saveStatus === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </Button>
        </div>
      </div>

      <Form {...form}>
        <div className="space-y-8">

          {/* Owner Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Owner Information</CardTitle>
              <CardDescription>Contact details shared with managers. All fields are optional.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="ownerName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. Ahmed Benali" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="ownerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Phone <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. 212612345678" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="adminPhone" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Admin Phone</FormLabel>
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">كيرا</Badge>
                  </div>
                  <FormControl><Input placeholder="e.g. 212612345678" {...field} /></FormControl>
                  <FormDescription className="text-xs">This number receives system alerts and can use admin mode by sending "أنا كيرا"</FormDescription>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Project Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Extra context provided to the AI. All fields are optional.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField control={form.control} name="projectName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Yazaki AI" {...field} /></FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
                <FormField control={form.control} name="projectLink" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Link <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input type="url" placeholder="https://..." {...field} /></FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="demoVideoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    فيديو شرح التطبيق
                    <span className="text-muted-foreground text-xs font-normal">(اختياري)</span>
                  </FormLabel>
                  <FormControl>
                    <VideoUploader value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    ارفع فيديو من جهازك — ناظم سيقترحه ويرسله لمن يطلبه في واتساب
                  </FormDescription>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="projectDescription" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Maintenance Mode */}
          <Card className={`backdrop-blur border-2 ${form.watch("maintenanceMode") ? "border-orange-500/60 bg-orange-500/5" : "border-border/50 bg-card/50"}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${form.watch("maintenanceMode") ? "bg-orange-500 animate-pulse" : "bg-green-500"}`} />
                  <div>
                    <CardTitle>Maintenance Mode</CardTitle>
                    <CardDescription>
                      {form.watch("maintenanceMode") ? "Bot is paused — only the admin can chat." : "Bot is active and responding normally."}
                    </CardDescription>
                  </div>
                </div>
                <FormField control={form.control} name="maintenanceMode" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className={`text-sm mt-0 font-semibold ${field.value ? "text-orange-400" : "text-green-400"}`}>
                      {field.value ? "⛔ Paused" : "✅ Active"}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-maintenance"
                        className={field.value ? "data-[state=checked]:bg-orange-500" : ""} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="maintenanceMessage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Message sent to users during maintenance</FormLabel>
                  <FormDescription>This exact text is sent to anyone who messages while the bot is paused. The admin is not affected.</FormDescription>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <p className="text-xs text-muted-foreground mt-3">
                💡 You can also toggle maintenance from WhatsApp by sending <span className="font-mono bg-muted px-1 rounded">وقف</span> or <span className="font-mono bg-muted px-1 rounded">تشغيل</span> after authenticating as admin.
              </p>
            </CardContent>
          </Card>

          {/* AI Config */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Configuration</CardTitle>
                  <CardDescription>API keys, model selection, and agent behavior.</CardDescription>
                </div>
                <FormField control={form.control} name="autoReply" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-sm text-muted-foreground mt-0">Auto-reply Active</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-autoreply" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-8">
              <FormField control={form.control} name="aiModel" render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Active AI Provider</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage/>
                </FormItem>
              )} />

              {/* Gemini */}
              <div className="rounded-lg border border-border/50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <h3 className="font-semibold text-sm">Google Gemini</h3>
                  {form.watch("aiModel") === "gemini" && <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-400/30">Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">يمكنك إضافة حتى 6 مفاتيح — عند نفاذ رصيد أحدها ينتقل تلقائياً للتالي.</p>
                {(["geminiApiKey","geminiApiKey2","geminiApiKey3","geminiApiKey4","geminiApiKey5","geminiApiKey6"] as const).map((name, i) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">مفتاح {i + 1}{i === 0 ? " (رئيسي)" : ""}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type={showGeminiKeys[i] ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" placeholder="AIza..." />
                          <button type="button" onClick={() => toggleGeminiKey(i)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showGeminiKeys[i] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage/>
                    </FormItem>
                  )} />
                ))}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Gemini Model</label>
                  <p className="text-sm text-muted-foreground">Free models only (Flash & Gemma families). Enter your API key then click Fetch Models.</p>
                  <ModelSelector provider="gemini" apiKey={geminiApiKey} value={geminiModel} onChange={(v) => form.setValue("geminiModel", v, { shouldDirty: true })} />
                  {geminiModel && <p className="text-xs text-muted-foreground mt-1">Selected: <span className="font-mono text-foreground">{geminiModel}</span></p>}
                </div>
              </div>

              {/* Groq */}
              <div className="rounded-lg border border-border/50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-400" />
                  <h3 className="font-semibold text-sm">Groq</h3>
                  {form.watch("aiModel") === "groq" && <Badge className="text-xs bg-orange-500/20 text-orange-400 border-orange-400/30">Active</Badge>}
                </div>
                <FormField control={form.control} name="groqApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Groq API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showGroq ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" placeholder="gsk_..." />
                        <button type="button" onClick={() => setShowGroq(!showGroq)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGroq ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Groq Model</label>
                  <p className="text-sm text-muted-foreground">Free Llama, Mixtral & Gemma models. Enter your API key then click Fetch Models.</p>
                  <ModelSelector provider="groq" apiKey={groqApiKey} value={groqModel} onChange={(v) => form.setValue("groqModel", v, { shouldDirty: true })} />
                  {groqModel && <p className="text-xs text-muted-foreground mt-1">Selected: <span className="font-mono text-foreground">{groqModel}</span></p>}
                </div>
              </div>

              {/* Personality */}
              <FormField control={form.control} name="agentPersonality" render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt / Personality</FormLabel>
                  <FormDescription>Instructs the agent on how to behave, tone, and constraints.</FormDescription>
                  <FormControl><Textarea rows={6} className="font-mono text-sm" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
            <CardFooter className="bg-muted/10 border-t border-border/50 pt-4 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-muted-foreground">
                يُحفظ تلقائياً بعد 1.5 ثانية من آخر تغيير — أو اضغط <strong>حفظ</strong> فوراً.
              </p>
              <Button type="button" onClick={() => doSave(true)} disabled={saveStatus === "saving"} size="sm" className="gap-1.5">
                {saveStatus === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ الآن
              </Button>
            </CardFooter>
          </Card>

        </div>
      </Form>

      {/* Data Management */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />إدارة البيانات
          </CardTitle>
          <CardDescription>حذف البيانات المخزنة — لا يمكن التراجع عن هذه الإجراءات.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-2">
                  <MessageSquareOff className="h-4 w-4" />مسح كل الرسائل
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد مسح الرسائل</AlertDialogTitle>
                  <AlertDialogDescription>سيتم حذف كل سجلات المحادثات من قاعدة البيانات. لن تتأثر جهات الاتصال. هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearMessagesMutation.mutate({})} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {clearMessagesMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}مسح الرسائل
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-2">
                  <UsersRound className="h-4 w-4" />مسح جهات الاتصال والرسائل
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد مسح جهات الاتصال</AlertDialogTitle>
                  <AlertDialogDescription>سيتم حذف كل جهات الاتصال وجميع الرسائل المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearContactsMutation.mutate({})} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {clearContactsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}مسح الكل
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Full Reset — Danger Zone */}
          <div className="border border-destructive/60 rounded-lg p-4 bg-destructive/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4" />إعادة تعيين كاملة — Reset
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                يمسح كل شيء: الإعدادات، رقم الأدمن، ذاكرة ناظم، جهات الاتصال، الرسائل. كأنه وُلد من جديد.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2 shrink-0" disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  إعادة تعيين
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" />تأكيد إعادة التعيين الكاملة
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">سيتم حذف <strong>كل شيء</strong> من قاعدة البيانات:</span>
                    <span className="block text-right leading-7">
                      🗑 جميع الإعدادات (اسم التطبيق، API keys، الشخصية...)<br/>
                      🗑 رقم المشرف — سيُلغى وضع الخضوع<br/>
                      🗑 ذاكرة ناظم كاملة — كل المحادثات<br/>
                      🗑 جميع جهات الاتصال والرسائل
                    </span>
                    <span className="block font-semibold text-destructive">بعد الإعادة، أرسل كيرا من واتساب لتسجيل المشرف من جديد. هذا الإجراء لا يمكن التراجع عنه.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    نعم، امسح كل شيء
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
