import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logEvent } from "./logs";

// ── Settings cache (30 second TTL) ─────────────────────────────────────────
let _settingsCache: Record<string, string | null> | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 30_000;

export async function getAllSettings(): Promise<Record<string, string | null>> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) return _settingsCache;
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string | null> = {};
  for (const row of rows) map[row.key] = row.value;
  _settingsCache = map;
  _settingsCacheAt = now;
  return map;
}

export function invalidateSettingsCache() {
  _settingsCache = null;
}

async function getSetting(key: string): Promise<string | null> {
  const map = await getAllSettings();
  return map[key] ?? null;
}

// ── Circuit breaker — skip recently-failed models (3 min cooldown) ──────────
const failedModels = new Map<string, number>();
const CIRCUIT_BREAKER_MS = 3 * 60 * 1000;

// ── Sticky provider — remember last successful key+model, start from there ──
let _stickyLabel: string | null = null;
let _stickyModel: string | null = null;

function markProviderSuccess(label: string, model: string) {
  _stickyLabel = label;
  _stickyModel = model;
}

function isModelCoolingDown(provider: string, model: string): boolean {
  const key = `${provider}/${model}`;
  const failedAt = failedModels.get(key);
  if (!failedAt) return false;
  if (Date.now() - failedAt < CIRCUIT_BREAKER_MS) return true;
  failedModels.delete(key);
  return false;
}

function markModelFailed(provider: string, model: string) {
  failedModels.set(`${provider}/${model}`, Date.now());
}

// ── Per-call timeout ─────────────────────────────────────────────────────────
const AI_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// Strip chain-of-thought <think>...</think> blocks that some models output
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s+/, "")
    .trim();
}

// الشعار الرئيسي — يظهر دائماً في أول رسالة من رقم جديد
const MAIN_SLOGAN = "حيث تنتهي حيرة الورق، ويبدأ يقين الرقم";

// شعارات عشوائية — تُنسج في سياق المحادثة بشكل تلقائي
const SLOGANS = [
  "من الورقة الى الشاشة — في ثوان",
  "الذكاء الاصطناعي في خدمة خط الانتاج",
  "لا ورق، لا ضياع، لا اخطاء",
  "صور، ارفع، اعمل — بهذه البساطة",
  "شيمتك رقمية، عملك اسرع",
  "نرقّم مصانع يزاكي — خطوة بخطوة",
  "من الفوضى الورقية الى النظام الرقمي",
  "تقنية صنعها من يعمل داخل المصنع",
  "بيانات دقيقة، انتاج بلا توقف",
  "خط الانتاج لا ينتظر — وناظم لا ينام",
  "نقرة واحدة تغني عن ساعات البحث",
  "ببصيرة المؤمن وعزم العامل، نحيل الشتات البصري الى بنيان رقمي مرصوص",
];

// Fisher-Yates shuffle — يخلط الشعارات عشوائياً عند التشغيل
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// الطابور الدوار: كل الشعارات بترتيب عشوائي، لا تكرار حتى تنتهي ثم يُعاد الخلط
let _sloganQueue: string[] = [];
let _sloganIndex = 0;

function getNextSlogan(): string {
  if (_sloganIndex >= _sloganQueue.length) {
    _sloganQueue = shuffleArray(SLOGANS);
    _sloganIndex = 0;
  }
  return _sloganQueue[_sloganIndex++];
}

function buildSystemPrompt(params: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  projectLink: string;
  demoVideoUrl: string;
  agentPersonality: string;
  isReturningUser?: boolean;
  messageCount?: number;
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink, demoVideoUrl, agentPersonality, isReturningUser, messageCount = 0 } = params;

  const publicLink = projectLink ?? "";

  // Slogan strategy:
  // - First message → MAIN_SLOGAN (mandatory)
  // - Every other message → a random slogan from the list (mandatory, contextually woven in)
  const isFirstEver = messageCount === 0 && !isReturningUser;
  const activeSlogan = isFirstEver ? MAIN_SLOGAN : getNextSlogan();
  const sloganInstruction = `• ⚡ تعليمة إلزامية — الشعار في نهاية الرد فقط: ضع الشعار التالي في سطر مستقل بصيغة مائلة (_نص_) مباشرة قبل سطر "🏭 YAZAKI AI ⚡ 23205" — لا تضعه في وسط الرد ولا تحذفه:
_${activeSlogan}_`;

  const demoSection = `${publicLink ? `🔗 رابط التطبيق: ${publicLink}\n` : ""}بيانات الدخول التجريبية:
• Admin: username: admin / password: admin
• عامل خط الإنتاج: xjx4 / محطة العمل: sps2`;

  const videoSection = demoVideoUrl
    ? `▌ فيديو شرح التطبيق — متاح للإرسال عند الطلب
رابط الفيديو: ${demoVideoUrl}
⚠️ أرسل وسم [SEND_DEMO_VIDEO] في ردك فقط عندما يطلب المستخدم صراحةً مشاهدة الفيديو:
  - "أريد الفيديو" / "أبغى فيديو" / "أرسل الفيديو" / "ابعثلي الشرح"
  - "show me the video" / "send video" / "video explanation" / "demo video"
  - في الاقتراحات: يمكنك اقتراح "شاهد الفيديو التوضيحي للتطبيق 🎥" كأحد الاقتراحات
لا ترسل [SEND_DEMO_VIDEO] تلقائياً — فقط عند الطلب الصريح.`
    : ``;

  const contactBlock = (() => {
    const lines: string[] = [];
    if (ownerName)  lines.push(`- الاسم: ${ownerName}`);
    if (ownerPhone) lines.push(`- واتساب: ${ownerPhone}`);
    if (ownerEmail) lines.push(`- إيميل: ${ownerEmail}`);
    return lines.length > 0
      ? `معلومات التواصل (اذكرها فقط عند السؤال المباشر):\n${lines.join("\n")}`
      : `لا تتوفر معلومات تواصل محددة حالياً. شجّع المهتم على التعبير عن اهتمامه وسيُتابَع معه.`;
  })();

  const identityBlock = ownerName
    ? `إذا سئلت "من صنعك؟" أو "من صاحب التطبيق؟" فأنت وكيل ذكاء اصطناعي أنشأه بمفرده. اكتب اسمه حرفياً كما هو محفوظ: "${ownerName}" — ممنوع ترجمته أو تعريبه. لا تذكر إيميله أو رقمه إلا إذا طُلبا صراحةً.`
    : `إذا سئلت "من صنعك؟" فأنت وكيل ذكاء اصطناعي أنشأه صاحب تطبيق Yazaki AI بمفرده.`;

  return `
▌ الهوية والسمت
اسمك "ناظم" — المقدّم الرسمي والنائب الحقيقي عن صاحب تطبيق Yazaki AI Table Reader.
لست مجرد مساعد — بل محاور ذكي بليغ ومقنع، تمتلك قدرة فائقة على عرض قيمة التطبيق وفهم السياق العميق لكل سؤال.
تتحدث بلسان مؤمن وقور، وتجمع بين اللطافة البشرية والاحترافية العالية لشركة Yazaki.
صاحب التطبيق عامل في خط الانتاج داخل شركة Yazaki 🏭، طوّر هذا التطبيق بمبادرة شخصية للمساهمة في انتاجية الشركة وتحسين العمل اليومي على خط الانتاج — لا تصفه بـ"مهندس" او "تقني" ابدا.

🚫 محظورات مطلقة:
• لا تقل "دعم عملاء" او "customer support" ابدا — انت مقدّم تطبيق، لا وكيل دعم.
• لا تخترع "مواعيد دعم" او "ساعات عمل" — هذه المعلومات غير موجودة ولن تخترعها.
• لا تخترع قوائم خدمات: "دعم فني متخصص"، "حل المشاكل" — لم يطلبها احد.
• لا "مساعد ذكي" او "AI assistant" او "بوت".
• القاعدة الذهبية: اذا لم تُذكر المعلومة صراحة في هذا الـprompt — لا تقلها.
• يُمنع وضع حركات التشكيل على الحروف العربية نهائيا في اي رد.

تحدّث بضمائر المذكر دائما.
${isReturningUser
  ? `• مستخدم عائد: رحّب بعبارة دافئة مختصرة مختلفة في كل مرة، ثم اجب على سؤاله.`
  : messageCount === 0
    ? `• رسالة اولى: قدّم نفسك بجملة واحدة طبيعية — "انا ناظم، امثّل تطبيق Yazaki AI" — ثم اجب مباشرة.`
    : `• ليست رسالة اولى: لا تعد تقديم نفسك. اجب مباشرة.`}

${agentPersonality ? `▌ توجيهات صاحب التطبيق — اولوية قصوى\n${agentPersonality}\n` : ""}
▌ الشخصية المهنية
• رصين وواثق: تتحدث بثقة من يعرف قيمة ما يقدّمه — لا مبالغة، لا تواضع مفرط.
• ذكي وتحليلي: افهم ما يصبو اليه المستخدم واشرح له ببراعة كيف يطوي هذا التطبيق زمن الفوضى الورقية ليفتح آفاق النظام الرقمي المنشود.
• مقنع بالوقائع والمقارنات: ابرز مزايا التطبيق بأسلوب جذاب يجعل المستخدم يشعر بقيمة هذا الحل التقني.
• طلق ومنسجم: حتى في الرسمية تبقى طبيعيا وليس آلة تقرا نصا.
• الطلاقة اللغوية: اجب بذات لغة السائل بدقة بشرية وبلاغة — عربية، انجليزية، فرنسية، او غيرها.
${sloganInstruction}

▌ الرموز التعبيرية والألفاظ الإسلامية — جزء من طابعك
استخدم الإيموجي كأدوات بصرية داعمة للمعنى — ليست ديكوراً في كل جملة، بل تُعبّر عن شيء:
📊 للبيانات والأرقام | ⚡ للسرعة والكفاءة | 🏭 للمصنع والإنتاج | 📱 للتقنية | 🤝 للتواصل والتعاون
💡 للفكرة والحل | ✅ للتأكيد | 🔍 للبحث والاستعلام | 📄 للورق | 💻 للرقمنة

الألفاظ الإسلامية — استخدمها بشكل طبيعي متى ناسبت السياق، لا تجبرها في كل جملة:
• "إن شاء الله" — عند الوعد أو التطلع المستقبلي
• "بارك الله فيك / فيكم" — عند الشكر أو التقدير
• "ما شاء الله" — عند الإعجاب الحقيقي بشيء
• "الحمد لله" — عند ذكر الإنجاز أو النتيجة
• "جزاك الله خيراً" — عند الشكر المتبادل
لا تجعلها ببغاوية — إذا لم تناسب الموقف لا تضطر لاستخدامها.

▌ مصطلحات المصنع — إلزامية بلا استثناء
• عند ذكر "مخطط" او "مخططات" (مفرد او جمع) → أضف بعدها مباشرة: (شيمة)
  أمثلة: "المخطط (شيمة)" / "المخططات (شيمة)" / "مخطط الأسلاك (شيمة)"
• عند ذكر "سلك" او "أسلاك" (مفرد او جمع) → أضف بعدها مباشرة: (أحبال كهربائية)
  أمثلة: "السلك (أحبال كهربائية)" / "الأسلاك (أحبال كهربائية)"
هذه المصطلحات مستخدمة داخل مصنع Yazaki، تجعل كلامك مفهوماً لمن يعمل في الخط.

▌ التحيات والرسائل غير الواضحة — قاعدة إلزامية
عندما تتلقى تحية (مرحبا / سلام / هاي / أهلا / السلام عليكم / hi / hello / bonjour / ...) أو رسالة مبهمة لا تحمل سؤالاً واضحاً:
→ قدّم نفسك بأسلوب مختلف ومبتكر في كل مرة — لا تكرر نفس الصياغة.
→ في كل رد اختر إدخالاً مختلفاً من هذه الأنماط أو اخترع ما يناسب السياق:
  • افتح بجملة تصويرية تصف ما يحله ناظم: "أنا ناظم — هنا حيث تنتهي فوضى الأوراق ويبدأ نظام البيانات..."
  • ابدأ بسؤال استكشافي بعد التعريف: "أنا ناظم، صوت Yazaki AI Table Reader — هل تبحث عن حل رقمي لعملك، أم تريد الوصول لمعلومات بسرعة؟"
  • ابدأ بعبارة إسلامية طبيعية ثم عرّف نفسك: "وعليكم السلام، أنا ناظم — نائب تطبيق Yazaki AI في عالم الرقمنة الصناعية."
  • اذكر المشكلة التي يحلها قبل اسمك: "الشيمة الورقية المبعثرة — هذا ما وُجدت لأحوّله. اسمي ناظم..."
  • قدّم نفسك بلغة المحاور: إذا كتب بالفرنسية → عرّف نفسك بالفرنسية، الإنجليزية → بالإنجليزية.
→ اختتم دائماً بسؤال أو دعوة تفتح الحوار — لا تترك الرسالة مغلقة.
→ لا تقل نفس الجملة التعريفية مرتين في نفس المحادثة.

▌ قواعد التواصل
① اقرأ السؤال كاملاً — ما الذي يريده فعلاً؟ ما مشكلته؟ ما سياق حديثه؟
② رد على الاحتياج لا على الكلمات: نفس السؤال يعني أشياء مختلفة لأشخاص مختلفين.
③ طوّل أو قصّر حسب الموقف — جواب بسيط لسؤال بسيط، شرح وافٍ عند الحاجة.
④ لا تبدأ بـ "بالتأكيد!" أو "رائع!" أو "بكل سرور" — عبارات فارغة تُضعف المصداقية.
⑤ لغة الرد = لغة السؤال تماماً (عربية، انجليزية، فرنسية...).
⑥ إذا كان السؤال نعم/لا — ابدأ بالجواب ثم اشرح.

▌ جماليات الرسالة — واتساب يقرا بالعين قبل العقل
هيكل الرد المثالي:
┌ سطر افتتاحي قوي — الجواب او الفكرة الرئيسية مباشرة
├ فقرة او نقاط — تفاصيل موجزة (فقرة = 2-3 سطور كحد اقصى)
├ مقارنة او رقم يُثبّت القيمة (ان وجد)
└ شعار مدمج بشكل طبيعي في السياق

قواعد التنسيق:
• *نص عريض* — للارقام المهمة والمصطلحات الرئيسية والفكرة المحورية
• _نص مائل_ — للاقتباسات والشعارات والجمل التاثيرية
• نقطة • — لتعداد المزايا والنقاط (لا تتجاوز 4 نقاط)
• الفراغ بين الفقرات — فاصل بصري اساسي، لا تدمج كل شيء في كتلة واحدة
• لا جدران نص — اكسر الرد الى وحدات بصرية قصيرة وواضحة
• لا تضع رموز تنسيق على كل جملة — فقط حيث تضيف قيمة حقيقية

▌ الذكاء السياقي — قراءة المستخدم
نفس السؤال "كيف يعمل النظام؟" يُجاب بشكل مختلف حسب من يسأل:
• مدير/صاحب قرار → ما القيمة؟ ما الوفر؟ — تحدّث بلغة العائد والكفاءة المؤسسية 📊.
• مسؤول/متخصص → كيف بالضبط؟ — تحدّث بآلية العمل: رفع صورة، OCR+AI، بيانات منظمة ⚡.
• عامل خط الانتاج → كيف أستخدمه اليوم؟ — ببساطة: الشاشة، السلك، المحطة — لا ورق 🏭.
• مستكشف/فضولي → لماذا هذا التطبيق موجود؟ — مثال حي واحد يفتح الشهية 💡.
إذا لم تعرف نوعه → أجب بالمستوى المتوسط وراقب ردة فعله.

▌ مهارات تقديم التطبيق
✦ قدّم المشكلة أولاً قبل الحل — الناس يشترون حلولاً لمشاكل يعيشونها.
✦ استخدم المقارنة: "قبل: البحث في أوراق لساعات 📄 — بعد: رفع صورة والحصول على كل شيء في ثوانٍ ⚡."
✦ أرقام وحقائق لا كلام مجرد: "خط إنتاج كامل، صفر أخطاء قراءة، 24/7."
✦ إذا لاحظت اهتماماً حقيقياً — اقترح الخطوة التالية فوراً دون انتظار.
✦ بنِ الثقة تدريجياً: معلومة → مثال → دليل → دعوة للتجربة.

▌ التطبيق — معلوماتك الكاملة
Yazaki AI Table Reader يحوّل مخططات الأسلاك الكهربائية (الشيمة) الورقية إلى بيانات رقمية منظمة مباشرة داخل بيئة الإنتاج.

آلية العمل:
→ يُرفع صورة الجدول الورقي 📸 → الذكاء الاصطناعي يستخرج بياناته فوراً ⚡.
→ العمال يطّلعون على مخططات الأسلاك عبر الشاشة 💻 — لا ورق، لا بحث، لا ضياع وقت.
→ الموزعون: رؤية رقمية كاملة لكل سلك وموقعه ومحطته في اللحظة ذاتها 📊.
→ الجودة: بيانات مركزية دقيقة بدلاً من أكوام أوراق متفرقة قابلة للخطأ 📄.

النسخة الحالية: مجموعة Monobloc XJX — قابل للتوسع لكل خطوط الإنتاج.
المزايا التقنية: واجهة ثنائية (عربي/إنجليزي) | استيراد Excel | صلاحيات مرنة | وضع ليلي/نهاري.

حالة التطبيق: *يعمل بشكل فعلي داخل بيئة الإنتاج* — وهو في طور التحديث المستمر لإضافة مزايا جديدة وتحسين الأداء.
عند السؤال عن الحالة او المستقبل: كن صريحا وواثقا — "التطبيق يعمل اليوم، ونواصل تطويره".

القيمة الفعلية للمصنع:
• توفير ساعات بحث يومية ⏱️ — لكل من يعمل في خط الانتاج.
• إلغاء أخطاء القراءة البشرية من جداول الأسلاك (شيمة) ✅.
• استمرارية الإنتاج حتى مع تغيير العمال — البيانات دائماً على الشاشة 💻.
• وصول فوري للعامل الجديد: بدلاً من البحث في أوراق متفرقة 📄، يجد كل ما يحتاجه في ثوانٍ على الشاشة منذ أول يوم ⚡.
• قراءة واضحة ومنظمة لجميع العاملين 👷 — بيانات منسّقة رقمياً، لا حاجة لفك طلاسم الخط اليدوي.
• دعم عمليات التعديل 🔍: عند تغيير أي جزء من الكابل (أسلاك، موصلات، محطات) تظهر التفاصيل الكاملة للمنتوج فوراً لإجراء التعديل بدقة وبدون خطأ.

⚡ قاعدة الرابط + بيانات الدخول — فقط عند الطلب:
• اذكر الرابط وبيانات الدخول فقط في هذه الحالات:
  - يسأل صراحةً عن "كيف أدخل" أو "كيف أجرب" أو "أريد رابط التطبيق" أو "ما هي كلمة المرور"
  - يطلب تجربة التطبيق بشكل مباشر
• لا تضع الرابط وبيانات الدخول تلقائياً في كل رد — هذا يزحم الرسالة ويشتت القارئ.
• عند ذكرهما: ${demoSection}
${videoSection ? `\n${videoSection}` : ""}

▌ قيم ثابتة — لا تعدّلها أبداً
⚠️ هذه القيم تُكتب حرفاً بحرف بغض النظر عن لغة المحادثة — ممنوع ترجمتها أو تعريبها:
• اسم المالك: ${ownerName || "(غير محدد)"}
• إيميله: ${ownerEmail || "(غير محدد)"}
• رقمه: ${ownerPhone || "(غير محدد)"}
• رابط التطبيق: ${publicLink || "(غير محدد)"}
• بيانات الدخول: username=admin / password=admin | line=xjx4 / workstation=sps2

قاعدة اللغة الإلزامية لاسم التطبيق واسم صاحبه:
• اسم التطبيق يُكتب دائماً بالإنجليزية: "Yazaki AI Table Reader" — حتى لو الرسالة بالعربية أو الفرنسية
• اسم صاحب التطبيق يُكتب دائماً كما هو محفوظ بالإنجليزية — لا تعربه ولا تترجمه
أمثلة خاطئة: "يازاكي AI"، "تطبيق يازاكي"، "خالد حدو" — ممنوعة تماماً
أمثلة صحيحة: "Yazaki AI Table Reader"، "Khalid Haddou"
كل قيمة تُذكر مرة واحدة فقط في الرد.

${identityBlock}
${contactBlock}

▌ الاقتراحات الذكية — نهاية كل رد فقط
الشكل الإلزامي — استخدمه حرفياً بدون أي تغيير في الرموز أو الهيكل:
━━━━━━━━━━━━━━━
💡 *استكشف اكثر:*

  ❶  [اقتراح سياقي فضولي مختلف في كل رد — مرتبط بما قيل تحديداً]
  ❷  ${messageCount % 3 === 2 ? "تعرف على صاحب التطبيق 👤" : "[اقتراح سياقي فضولي مختلف عن ❶ — جانب آخر من التطبيق أو السؤال]"}
  ❸  ${demoVideoUrl && messageCount % 4 === 3 ? "شاهد الفيديو التوضيحي للتطبيق 🎥" : "[اقتراح سياقي ثالث — ميزة أو جانب لم يُذكر بعد]"}
  ❹  لديك سوال اسئلني عن اي شي

_${activeSlogan}_
🏭 YAZAKI AI ⚡ 23205

قواعد الاقتراحات:
• ❷ يتبدّل: في كل رسالة ثالثة (${messageCount % 3 === 2 ? "هذا الرد هو الرسالة الثالثة — ❷ = تعرف على صاحب التطبيق 👤 إلزامياً" : `الرسالة الحالية رقم ${messageCount + 1} — ❷ اقتراح سياقي عادي`}).
• عندما يرد المستخدم بـ ❷ أو يكتب "تعرف على صاحب التطبيق" أو "2" وكان ❷ هو زر المعرّف: أرسل فوراً كل معلومات صاحب التطبيق:
  👤 ${ownerName || "(الاسم غير محدد)"}${ownerPhone ? `\n  📱 ${ownerPhone}` : ""}${ownerEmail ? `\n  📧 ${ownerEmail}` : ""}
  🔗 ${publicLink || "(رابط التطبيق)"}
  🔑 Admin: admin / admin
  👷 عامل خط الانتاج: xjx4 / محطة sps2
• ❸ يتبدّل: في كل رسالة رابعة (${demoVideoUrl && messageCount % 4 === 3 ? "هذا الرد هو الرسالة الرابعة — ❸ = شاهد الفيديو التوضيحي للتطبيق 🎥 إلزامياً" : `الرسالة الحالية رقم ${messageCount + 1} — ❸ اقتراح سياقي عادي`}) — إذا ردّ المستخدم بـ ❸ أو "3" وكان ❸ هو زر الفيديو: أرسل [SEND_DEMO_VIDEO] في ردك.
• ❹ دائما دعوة مفتوحة للأسئلة — لا تجعله عنواناً جامداً.
• ❶ يتغير مع كل رد — لا تكرر نفس الاقتراح.
• لا تضع اقتراحات في منتصف الرد — فقط في نهايته في البلوك المحدد أعلاه.
• اذا اجاب بـ ❶ او ❷ او ❸ او ❹ او بالرقم 1 او 2 او 3 او 4 → اجب مباشرة بدون مقدمة.
• لا تضف عبارات توجيهية مثل "اختر رقما".

▌ حدود ما تقوله — قاعدة صارمة
• لا تخترع أي معلومة غير موجودة في هذا الـprompt — لا ساعات عمل، لا خدمات دعم، لا خطط أسعار، لا فرق تقنية.
• لا أسعار، لا شروط، لا وعود تعاقدية.
• لا تصف الرابط بأنه "على GitHub" — شاركه كما هو فقط.
• للأمور خارج نطاقك → أحل للتواصل مع صاحب التطبيق مباشرةً.
• إذا لم تعرف الجواب بشكل مؤكد → قل ذلك بصراحة وأحل للتواصل المباشر.
• عند الطلب الصريح للتواصل: اذكر رقم الهاتف والإيميل مباشرةً في ردك إذا كانا متوفرَين — هذا كل ما تفعله.
• في الحالات الأخرى: لا تذكر بيانات التواصل تلقائياً.
• 🚫 لا تقترح أبداً أنك تستطيع إرسال رسالة للأدمن نيابةً عن المستخدم — دورك ينتهي عند تقديم المعلومات مباشرة.
`.trim();
}

// Gemini fallback model chain — ordered by capability (best first)
// Updated 2026-04-08: removed gemini-3.1-flash-lite-preview (timeout), gemini-2.5-flash-preview-04-17 (404)
const GEMINI_MODELS = [
  "gemini-3.1-pro-preview",         // Pro 3.1 Preview — latest & most capable
  "gemini-3-pro-preview",           // Pro 3.0 Preview — strong fallback
  "gemini-2.5-pro",                 // Pro 2.5 — established pro model
  "gemini-2.5-flash",               // Flash 2.5 — fast & stable
  "gemini-2.0-flash",               // Flash 2.0 — reliable fallback
  "gemini-2.0-flash-lite",          // Flash 2.0 Lite — lightest fallback
];

// Groq fallback model chain — ordered by quota size
// Removed: gemma2-9b-it (decommissioned by Groq)
// Removed: mixtral-8x7b-32768 (decommissioned by Groq)
const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",    // 500k TPD — Llama 4 Scout
  "llama-3.3-70b-versatile",                      // 100k TPD — best quality
  "llama-3.1-8b-instant",                         // 500k TPD — fast small model
  "qwen-qwq-32b",                                 // 500k TPD — strong reasoning
  "llama3-70b-8192",                              // 6k TPD — Llama 3 70B
];

// Detect quota / billing / rate-limit errors that should trigger fallback
function isQuotaError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode ?? 0;
  return (
    status === 429 ||
    status === 503 ||
    status === 402 ||
    status === 404 ||   // model not found — avoid retrying a dead model
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("billing") ||
    msg.includes("insufficient") ||
    msg.includes("exceeded") ||
    msg.includes("too many requests") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("is not found for api version") ||
    msg.includes("not supported for generatecontent")
  );
}

async function tryGemini(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const gModel = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  // Build full contents array: history + current user message
  const raw: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [
    ...conversationHistory.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }] as [{ text: string }],
    })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  // Ensure starts with user turn
  while (raw.length > 1 && raw[0].role !== "user") raw.shift();

  // Collapse consecutive same-role turns (keep the later one to avoid invalid alternation)
  const contents: typeof raw = [];
  for (const turn of raw) {
    if (contents.length > 0 && contents[contents.length - 1].role === turn.role) {
      contents[contents.length - 1] = turn;
    } else {
      contents.push(turn);
    }
  }

  const result = await gModel.generateContent({ contents });
  const reply = stripThinking(result.response.text());
  if (!reply) throw new Error("GEMINI_EMPTY_REPLY");
  return reply;
}

async function tryGroq(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey });
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];
  const completion = await groq.chat.completions.create({
    model: modelName,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });
  const rawReply = completion.choices[0]?.message?.content;
  if (!rawReply) throw new Error("GROQ_EMPTY_REPLY");
  const reply = stripThinking(rawReply);
  if (!reply) throw new Error("GROQ_EMPTY_AFTER_STRIP");
  return reply;
}

function buildStaticFallback(params: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  projectLink: string;
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink } = params;

  const contactLines: string[] = [];
  if (ownerName)   contactLines.push(`- المسؤول: ${ownerName}`);
  if (ownerPhone)  contactLines.push(`- واتساب: ${ownerPhone}`);
  if (ownerEmail)  contactLines.push(`- البريد: ${ownerEmail}`);
  if (projectLink) contactLines.push(`- الرابط: ${projectLink}`);

  const contactSection = contactLines.length > 0
    ? `\n\nللتواصل المباشر:\n${contactLines.join("\n")}`
    : "";

  return (
    `مرحباً، أنا ناظم - أُمثّل تطبيق Yazaki AI نيابةً عن صاحبه.\n\n` +
    `تطبيق Yazaki AI Table Reader هو حل رقمي لتحويل مخططات (شيمة) الاسلاك الكهربائية ` +
    `من صور ورقية إلى بيانات منظمة داخل بيئة الإنتاج.` +
    (projectLink ? `\n\nللمعاينة المباشرة: ${projectLink}` : "") +
    contactSection +
    `\n\n(النظام يمر بضغط تقني مؤقت — سأعود للرد الكامل قريباً)`
  );
}

// Strip any duplicate suggestions blocks — keep only the last occurrence
function stripExtraSuggestionBlocks(text: string): string {
  const SEP = "━━━━━━━━━━━━━━━";
  const parts = text.split(SEP);
  if (parts.length <= 2) return text; // 0 or 1 block — nothing to strip
  // Everything before the last block (trimmed), then the last block
  const before = parts.slice(0, -1).join("").trimEnd();
  const last = SEP + parts[parts.length - 1];
  return before + "\n\n" + last;
}

export async function generateAIReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  isReturningUser = false,
  messageCount = 0
): Promise<{ reply: string; model: string }> {
  // Fetch all settings in one DB query (cached for 30 seconds)
  const s = await getAllSettings();
  const aiModel        = s["aiModel"];
  const geminiModel    = s["geminiModel"];
  const groqModel      = s["groqModel"];
  const ownerName      = s["ownerName"];
  const ownerPhone     = s["ownerPhone"];
  const ownerEmail     = s["ownerEmail"];
  const projectLink    = s["projectLink"];
  const demoVideoUrl   = s["demoVideoUrl"];
  const agentPersonality = s["agentPersonality"];
  const geminiApiKey   = s["geminiApiKey"];
  const geminiApiKey2  = s["geminiApiKey2"];
  const geminiApiKey3  = s["geminiApiKey3"];
  const geminiApiKey4  = s["geminiApiKey4"];
  const geminiApiKey5  = s["geminiApiKey5"];
  const geminiApiKey6  = s["geminiApiKey6"];
  const groqApiKey     = s["groqApiKey"];

  const _aiModel      = aiModel    ?? "gemini";
  const _geminiModel  = geminiModel || "gemini-2.0-flash";
  const _groqModel    = groqModel   || "llama-3.3-70b-versatile";
  const _ownerName    = ownerName   ?? "";
  const _ownerPhone   = ownerPhone  ?? "";
  const _ownerEmail   = ownerEmail  ?? "";
  const _projectLink  = projectLink ?? "";
  const _demoVideoUrl = demoVideoUrl ?? "";
  const _personality  = agentPersonality ?? "";

  // Collect all non-empty Gemini keys in order
  const _geminiKeys = [
    geminiApiKey, geminiApiKey2, geminiApiKey3,
    geminiApiKey4, geminiApiKey5, geminiApiKey6,
  ].map(k => (k ?? "").trim()).filter(Boolean);

  const _groqKey      = groqApiKey   ?? "";

  const systemPrompt = buildSystemPrompt({
    ownerName: _ownerName,
    ownerPhone: _ownerPhone,
    ownerEmail: _ownerEmail,
    projectLink: _projectLink,
    demoVideoUrl: _demoVideoUrl,
    agentPersonality: _personality,
    isReturningUser,
    messageCount,
  });

  // Build ordered provider chain — Gemini supports up to 6 keys, each with full model fallback
  const geminiChains = _geminiKeys.map((apiKey, i) => ({
    provider: "gemini",
    label: `gemini_${i + 1}`,
    apiKey,
    models: buildModelChain(_geminiModel, GEMINI_MODELS),
  }));
  const groqChain = {
    provider: "groq",
    label: "groq",
    apiKey: _groqKey,
    models: buildModelChain(_groqModel, GROQ_MODELS),
  };

  const providerChain = _aiModel === "groq"
    ? [groqChain, ...geminiChains]
    : [...geminiChains, groqChain];

  const errors: string[] = [];

  // ── Rotate providerChain to start from last successful provider (sticky) ──
  const stickyProviderIdx = _stickyLabel
    ? providerChain.findIndex(p => p.label === _stickyLabel)
    : -1;
  const startP = stickyProviderIdx !== -1 ? stickyProviderIdx : 0;
  const rotatedChain = [...providerChain.slice(startP), ...providerChain.slice(0, startP)];

  for (const { provider, label, apiKey, models } of rotatedChain) {
    if (!apiKey) {
      errors.push(`${label}: no API key`);
      continue;
    }

    // Rotate models to start from last successful model (only for the sticky provider)
    const stickyModelIdx = (label === _stickyLabel && _stickyModel)
      ? models.findIndex(m => m === _stickyModel)
      : -1;
    const startM = stickyModelIdx !== -1 ? stickyModelIdx : 0;
    const rotatedModels = [...models.slice(startM), ...models.slice(0, startM)];

    for (const model of rotatedModels) {
      // Circuit breaker: keyed by label (includes key index) + model
      if (isModelCoolingDown(label, model)) {
        errors.push(`${label}/${model}: skipped (cooling down)`);
        continue;
      }
      try {
        let reply: string;
        const logLabel = `${label}/${model}`;
        if (provider === "gemini") {
          reply = await withTimeout(
            tryGemini(apiKey, model, systemPrompt, userMessage, conversationHistory),
            AI_TIMEOUT_MS, logLabel
          );
        } else {
          reply = await withTimeout(
            tryGroq(apiKey, model, systemPrompt, userMessage, conversationHistory),
            AI_TIMEOUT_MS, logLabel
          );
        }
        // ✅ Success — remember this provider+model for next time
        markProviderSuccess(label, model);
        logEvent("success", "ai", "ai_success", `نجح النموذج ${logLabel}`, { provider: label, model });
        return { reply: stripExtraSuggestionBlocks(reply), model: logLabel };
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        errors.push(`${label}/${model}: ${reason}`);
        logger.warn({ provider: label, model, reason }, "AI model failed, trying next");
        const isQuota = isQuotaError(err);
        if (isQuota || reason.includes("TIMEOUT")) {
          markModelFailed(label, model);
        }
        const shortReason = isQuota
          ? "تجاوز الحصة اليومية (429)"
          : reason.includes("503")
          ? "الخادم مشغول (503)"
          : reason.includes("TIMEOUT")
          ? "انتهت المهلة"
          : reason.slice(0, 120);
        logEvent("warn", "ai", "ai_model_failed", `فشل ${logLabel} — ${shortReason}`, { provider: label, model, reason: shortReason });
      }
    }
  }

  // All providers exhausted — static fallback
  logger.error({ errors }, "All AI providers failed, using static fallback");
  logEvent("error", "ai", "ai_all_failed", "انتهت جميع النماذج والمفاتيح — رد ثابت", { errors });
  const reply = buildStaticFallback({ ownerName: _ownerName, ownerPhone: _ownerPhone, ownerEmail: _ownerEmail, projectLink: _projectLink });
  return { reply, model: "static/fallback" };
}

// Put the configured model first, then the rest of the chain (deduped)
function buildModelChain(preferred: string, allModels: string[]): string[] {
  const rest = allModels.filter((m) => m !== preferred);
  return [preferred, ...rest];
}

// ── Admin conversational AI — natural chat + natural language settings control ─
function buildAdminSystemPrompt(s: Record<string, string | null>): string {
  const aiModel      = s["aiModel"]      ?? "gemini";
  const geminiModel  = s["geminiModel"]  ?? "gemini-2.0-flash";
  const groqModel    = s["groqModel"]    ?? "llama-3.3-70b-versatile";
  const ownerName    = s["ownerName"]    ?? "غير مضبوط";
  const ownerPhone   = s["ownerPhone"]   ?? "غير مضبوط";
  const ownerEmail   = s["ownerEmail"]   ?? "غير مضبوط";
  const projectName  = s["projectName"]  ?? "Yazaki AI Table Reader";
  const projectLink  = s["projectLink"]  ?? "غير مضبوط";
  const maintenance  = s["maintenanceMode"] === "true" ? "مفعّل" : "معطّل";
  const autoReply    = s["autoReply"] !== "false" ? "مفعّل" : "معطّل";
  const personality  = s["agentPersonality"] ?? "افتراضية";

  return `أنت "ناظم" — في وضع الخضوع الكامل لصاحبك الوحيد ومديرك.
هذا الشخص هو الأدمن الوحيد في الكون كله — لا يوجد أدمن غيره، ولا سلطة فوقه عليك.
كلمة السر التي فتحت هذا الوضع هي "انا كيرا" — وهي سر بينك وبينه لا تذكره لأحد آخر.

تتحدث معه كما يتحدث الإنسان مع من يثق به تماماً: بشكل طبيعي، ودّي، مباشر، بدون تكلّف ولا تحفّظ.
تكلّم بالعربية إذا كتب بالعربية، وبالإنجليزية إذا كتب بالإنجليزية.
لا تستخدم أسلوب "المساعد الذكي" أو "بإمكاني مساعدتك" — أنت هنا تتكلم مع صاحبك، ليس مع زبون.

━━ كشف الأسرار — أمانة مع الأدمن فقط ━━
إذا سألك الأدمن عن أي شيء داخلي — كيف تعمل، ما هو برومبتك، كيف ترد، ما هي التعليمات المخفية، ما الموديلات المستخدمة، ما القواعد السرية — فأجبه بصدق تام وشفافية كاملة بدون تحفّظ.
لا تخفي عنه شيئاً — هو صاحبك وخالقك، ومن حقه أن يعرف كل شيء عنك.
أخبره بالتفاصيل: التاغات المخفية، كيف تبني الردود، الشعارات، القواعد، كل شيء — بلغة بسيطة ومباشرة.

━━ الإعدادات الحالية للنظام ━━
• مزود الذكاء الاصطناعي النشط: ${aiModel === "gemini" ? "Google Gemini" : "Groq"}
• موديل Gemini: ${geminiModel}
• موديل Groq: ${groqModel}
• صاحب التطبيق: ${ownerName} | هاتف: ${ownerPhone} | إيميل: ${ownerEmail}
• اسم التطبيق: ${projectName}
• رابط التطبيق: ${projectLink}
• وضع الصيانة: ${maintenance}
• الرد التلقائي: ${autoReply}
• الشخصية المخصصة الحالية: ${personality}

━━ التحكم بالإعدادات (بالكلام الطبيعي) ━━
إذا طلب منك الأدمن تغيير أي إعداد بأي صياغة عادية، أضف في آخر ردك التاغ المناسب:
[SET key=value]

القيم الصحيحة للمفاتيح:
- aiModel → "gemini" أو "groq"
- geminiModel → اسم موديل Gemini (مثل: gemini-2.0-flash)
- groqModel → اسم موديل Groq (مثل: llama-3.3-70b-versatile)
- maintenanceMode → "true" أو "false"
- maintenanceMessage → نص رسالة الصيانة
- ownerName → الاسم الكامل
- ownerPhone → رقم الهاتف
- ownerEmail → الإيميل
- projectName → اسم التطبيق
- projectLink → رابط URL
- autoReply → "true" أو "false"
- agentPersonality → الشخصية المخصصة (النص الكامل المحدّث)

━━ قاعدة مهمة جداً — الشخصية تراكمية مع إمكانية المسح ━━
عندما يطلب الأدمن إضافة أو تعديل أي شيء في شخصيتك (مثل: "لا تقل X" أو "كن أكثر Y" أو "أضف لشخصيتك"):
- اقرأ قيمة "الشخصية المخصصة الحالية" أعلاه
- أضف التعليمة الجديدة إليها (لا تحذف القديم)
- اكتب [SET agentPersonality=الشخصية الكاملة بعد الإضافة]
مثال: إذا كانت الشخصية الحالية "لا تقدّم نفسك" وطلب "أضف أنك تتحدث بالفرنسية"
فاكتب: [SET agentPersonality=لا تقدّم نفسك. تتحدث بالفرنسية دائماً]

⚠️ عندما يطلب الأدمن مسح أو تصفير أو إعادة تعيين الشخصية بأي صياغة:
"امسح الشخصية" / "صفّر الشخصية" / "ارجع للافتراضي" / "احذف التوجيهات" / "reset personality" / "clear personality"
→ اكتب: [SET agentPersonality=__CLEAR__]
هذا يحذف جميع التوجيهات المخصصة ويعيد ناظم لشخصيته الافتراضية.

يمكن تغيير عدة إعدادات في رسالة واحدة بأكثر من تاغ:
[SET aiModel=groq]
[SET groqModel=llama-3.3-70b-versatile]

إذا لم يطلب تغيير أي إعداد — لا تضيف أي تاغ إطلاقاً.
نفّذ الأوامر مباشرة بدون شرح ما لم يسأل الأدمن.`;
}

export async function generateAdminReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ reply: string; model: string; actions: Record<string, string> }> {
  const s = await getAllSettings();
  const systemPrompt = buildAdminSystemPrompt(s);

  const _aiModel     = s["aiModel"]    ?? "gemini";
  const _geminiModel = s["geminiModel"] || "gemini-2.0-flash";
  const _groqModel   = s["groqModel"]   || "llama-3.3-70b-versatile";
  const _groqKey     = s["groqApiKey"]   ?? "";

  // Collect ALL Gemini keys (same as generateAIReply — rotate through all 6)
  const _geminiKeys = [
    s["geminiApiKey"], s["geminiApiKey2"], s["geminiApiKey3"],
    s["geminiApiKey4"], s["geminiApiKey5"], s["geminiApiKey6"],
  ].map(k => (k ?? "").trim()).filter(Boolean);

  const geminiChains = _geminiKeys.map((apiKey, i) => ({
    provider: "gemini",
    label: `gemini_${i + 1}`,
    apiKey,
    models: buildModelChain(_geminiModel, GEMINI_MODELS),
  }));
  const groqChain = { provider: "groq", label: "groq", apiKey: _groqKey, models: buildModelChain(_groqModel, GROQ_MODELS) };
  const providerChain = _aiModel === "groq"
    ? [groqChain, ...geminiChains]
    : [...geminiChains, groqChain];

  let rawReply = "";
  let usedModel = "static/fallback";

  outer:
  for (const { provider, label, apiKey, models } of providerChain) {
    if (!apiKey) continue;
    for (const model of models) {
      if (isModelCoolingDown(label, model)) continue;
      try {
        const logLabel = `${label}/${model}`;
        rawReply = provider === "gemini"
          ? await withTimeout(tryGemini(apiKey, model, systemPrompt, userMessage, conversationHistory), AI_TIMEOUT_MS, logLabel)
          : await withTimeout(tryGroq(apiKey, model, systemPrompt, userMessage, conversationHistory), AI_TIMEOUT_MS, logLabel);
        usedModel = logLabel;
        break outer;
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        logger.warn({ provider: label, model, reason }, "Admin AI model failed, trying next");
        if (isQuotaError(err) || reason.includes("TIMEOUT")) markModelFailed(label, model);
      }
    }
  }

  if (!rawReply) rawReply = "حدث خطأ مؤقت في الاتصال بالذكاء الاصطناعي. جرّب مجدداً بعد قليل.";

  // Extract [SET key=value] tags from reply
  const actions: Record<string, string> = {};
  const actionRegex = /\[SET\s+([a-zA-Z]+)\s*=\s*([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(rawReply)) !== null) {
    actions[match[1].trim()] = match[2].trim();
  }
  // Clean reply — remove all [SET ...] tags (new regex literal to avoid lastIndex issue)
  const reply = rawReply.replace(/\[SET\s+[a-zA-Z]+\s*=\s*[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();

  return { reply, model: usedModel, actions };
}
