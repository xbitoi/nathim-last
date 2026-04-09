---
title: Nathem Yazaki AI
emoji: 🤖
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
app_port: 7860
---

# نور — Yazaki AI Table Reader

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?logo=github)](https://xbitoi.github.io/nour-agent)
[![Deploy to GitHub Pages](https://github.com/xbitoi/nour-agent/actions/workflows/pages.yml/badge.svg)](https://github.com/xbitoi/nour-agent/actions/workflows/pages.yml)

> **يحوّل الفوضى البصرية إلى تنظيم رقمي**
> *Turning Visual Chaos into Digital Order*

وكيل ذكاء اصطناعي على واتساب مخصص لمشروع Yazaki AI Table Reader — يحوّل مخططات (شيمة) الأسلاك الكهربائية الورقية إلى بيانات رقمية منظمة داخل بيئة الإنتاج.

🌐 **[عرض الصفحة الرسمية](https://xbitoi.github.io/nour-agent)**

---

## ما هو نور؟

**نور** هو وكيل ذكاء اصطناعي يعمل عبر واتساب، يمثل مشروع Yazaki AI بلغة احترافية ثنائية (عربي/إنجليزي). يعمل على مدار الساعة ويرد على استفسارات المهتمين بالمشروع.

### المشكلة التي يحلها

| الفئة | المشكلة | الحل |
|-------|---------|------|
| **العمال** | أوراق DAD/DAG مبعثرة، خانات صغيرة، أحياناً لا تُوجد الورقة | قراءة المخطط بسرعة ووضوح في التطبيق |
| **الموزعون** | أسلاك متشابهة بألوان متقاربة وأطوال مختلفة | رؤية رقمية واضحة لكل سلك وموقعه |
| **الجودة** | أكوام أوراق كبيرة تختلط وتصعب قراءتها | كل البيانات في شاشة واحدة منظمة |
| **المهندسون** | تحويل المخططات الورقية إلى بيانات | استخراج تلقائي بالذكاء الاصطناعي |

---

## المزايا الرئيسية

- 🤖 **واتساب AI Agent** — يرد بالعربية والإنجليزية تلقائياً
- 🧠 **سلسلة نماذج ذكية** — Gemini 2.0 Flash → Groq Llama 3.3 → رسالة ثابتة (لا صمت أبداً)
- 🔐 **نظام مشرف** — مشرف واحد بكلمة سر، أوامر إدارية عبر واتساب
- 📊 **لوحة تحكم** — واجهة ويب لمراقبة الرسائل والإحصائيات
- ♾️ **استماع دائم** — Heartbeat + Exponential Backoff لاتصال لا ينقطع
- 🏭 **Industry 4.0** — خطوة نحو المصنع الذكي

---

## التقنيات

```
Node.js + TypeScript  ·  Baileys (WhatsApp)  ·  Google Gemini API
Groq API  ·  React + Vite  ·  PostgreSQL  ·  Drizzle ORM  ·  Fastify
pnpm Monorepo  ·  GitHub Actions
```

---

## بنية المشروع

```
├── artifacts/
│   ├── api-server/          # خادم API + واتساب + ذكاء اصطناعي
│   │   └── src/services/
│   │       ├── ai.ts        # نظام نور + سلسلة النماذج
│   │       └── whatsapp.ts  # اتصال واتساب + معالجة الرسائل
│   └── nour-dashboard/      # لوحة التحكم (React + Vite)
├── lib/db/                  # قاعدة البيانات (Drizzle ORM)
├── docs/                    # GitHub Pages — الصفحة الرسمية
└── .github/workflows/       # CI/CD — نشر تلقائي
```

---

## روابط مهمة

| الرابط | الوصف |
|--------|-------|
| [xbitoi.github.io/nour-agent](https://xbitoi.github.io/nour-agent) | الصفحة الرسمية (GitHub Pages) |
| [github.com/xbitoi/nour-agent](https://github.com/xbitoi/nour-agent) | المستودع |
| [GITHUB_DEPLOYMENT.md](./GITHUB_DEPLOYMENT.md) | توثيق إعداد النشر وإعادة إنشائه |

---

## ملاحظة

النسخة الحالية هي نموذج تطبيقي على مجموعة **Monobloc XJX** — مبني على بنية مرنة قابلة للتوسع لتشمل باقي المجموعات والخطوط الإنتاجية.

---

> صُنع بمفرده · Yazaki AI · 2025
# wa.nathem.ai
