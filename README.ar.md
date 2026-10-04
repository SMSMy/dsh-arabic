# dsh-arabic

**العربية لتطبيق DeepSeek Harness — عرض RTL سليم تقنياً مع حزمة تعريب كاملة للواجهة.**

[![CI](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml/badge.svg)](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-arabic)](https://www.npmjs.com/package/dsh-arabic)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

DSH لا يدعم RTL ولا يوفّر لغة عربية. خلط النص العربي بأسماء المتغيّرات والمسارات
والأكواد داخل الواجهة يجعل الكلام مبعثراً، وكل القوائم إنجليزية. هذا البلاقن يحل
المشكلتين **دون تعديل التطبيق نفسه**.

## ما الذي يفعله

### ١) عرض RTL آمن ثنائي الاتجاه (يعمل بأي لغة واجهة)

كل كتلة نصية تحتوي حرفاً عربياً تُوسَم بـ `data-dsh-arabic-bidi="1"`، ويمنحها
الـ CSS المُحقَن `unicode-bidi: plaintext; text-align: start` — وهو المكافئ
البرمجي لـ `dir="auto"`:

| المحتوى | النتيجة |
|---|---|
| فقرة عربية | من اليمين لليسار، ومحاذاة يمين |
| فقرة إنجليزية | من اليسار لليمين، ومحاذاة يسار |
| عربي وإنجليزي مختلط | يُرتَّب بمحرّك bidi القياسي، والأرقام والمسارات سليمة |
| `pre` / `code` والكود المضمّن | دائماً LTR — الكود لا يُقلب أبداً |
| مربّع الكتابة والبحث و`contenteditable` | الاتجاه يتبع ما تكتبه |

**لا يقلب الواجهة كلها إلى RTL.** واجهات المطوّرين ثنائية اللغة بطبيعتها،
واتجاه كل فقرة على حدة هو ما يُبقي اللغتين مقروءتين.

### ٢) حزمة تعريب الواجهة

مُسجَّلة عبر خدمة الترجمة الرسمية (`ctx.locale.addLanguage` + `ctx.locale.register`)
— أي بالنفس الآلية التي يستخدمها التطبيق نفسه، بلا استبدال نصوص في DOM وبلا
تعديل دوال قائمة:

- **59 نطاقاً · 3,228 نصاً** مأخوذة من مصدر DSH الرسمي
- أي مفتاح غير مترجم يعود تلقائياً إلى الإنجليزية (`fallback: 'en'`)
- اختر **العربية** من *الإعدادات ← عام ← Language*

التغطية وكل قرار ترجمة غير بديهي قابلة للتدقيق في
[`data/en-catalog.json`](data/en-catalog.json) (مجموعة المفاتيح الإنجليزية الرسمية)،
و[`locales/ar.json`](locales/ar.json) (الحزمة العربية)،
و[`data/overrides.json`](data/overrides.json) (توحيد الصيغ بين الدفعات).

## التثبيت

```bash
# من npm
dsh plugin --profile desktop add dsh-arabic

# أو من نسخة محلية (للتطوير)
dsh plugin --profile desktop add link:/المسار/الكامل/dsh-arabic
```

أو من داخل التطبيق: **الإعدادات ← Plugins ← Plugin Manager**.

> **أعد تشغيل DSH بعد التثبيت.** جدول الحقن في نسخة الديسكتوب يُجمَع مرة واحدة
> عند إقلاع المضيف، فتحديث الصفحة وحده لا يكفي.

ثم لتفعيل الواجهة العربية: **الإعدادات ← عام ← Language ← العربية**.
طبقة RTL تعمل مع أي لغة بمجرد تحميل البلاقن.

## كيف يعمل

```
index.js                     النصف المضيف
  └── صفوف webserver/index-inject
        ├── { kind: 'style',  text: <CSS الاتجاه> }
        └── { kind: 'script', placement: 'body', text: <سكربت الوسم> }

lib/client.js                النصف البرمجي في المتصفح (مُولَّد)
  └── window.__ModuleLoader__.load({ id, factory })
        └── ctx.locale.addLanguage({ id: 'ar', label: 'العربية', fallback: 'en' })
            ctx.locale.register(namespace, 'ar', dictionary)   × 59
```

النصف البرمجي **بلا أي اعتماديات خارجية** — لا يلمس سوى خدمة `locale`، فلا يحتاج
مُجمِّعاً ولا React ولا تسجيل وحدات. ويُولّده `scripts/build-client.mjs` من
`locales/ar.json`.

## بنية المستودع

| المسار | الغرض |
|---|---|
| `index.js` | النصف المضيف: صفوف حقن الاتجاه |
| `lib/client.js` | النصف البرمجي المُولَّد: حزمة اللغة العربية |
| `locales/ar.json` | القواميس المترجمة |
| `data/en-catalog.json` | مجموعة المفاتيح الإنجليزية الرسمية المستخرجة من مصادر DSH |
| `data/overrides.json` | توحيد الصيغ حيث اختلفت الدفعات المتوازية |
| `scripts/build-client.mjs` | يتحقق من الحزمة ويعيد توليد `lib/client.js` (`--check` لـ CI) |
| `scripts/assemble-translations.mjs` | يدمج دفعات الترجمة في `locales/ar.json` |
| `scripts/lint-consistency.mjs` | يكشف ترجمة النص الإنجليزي الواحد بصيغتين |
| `tests/verify-rtl.mjs` | 12 اختباراً سلوكياً لطبقة الاتجاه على محاكي DOM |
| `tests/verify-locales.mjs` | سلامة الكتالوج وعقد الملف وتسجيل اللغة |

## التطوير

```bash
npm test                                  # كلا مجموعتي الاختبار
npm run build                             # إعادة توليد lib/client.js
node scripts/build-client.mjs --check     # يفشل إن كانت الحزمة ناقصة
node scripts/lint-consistency.mjs --strict
```

## التوافق

مبني على **DSH 0.2.0-rc.2**. يعتمد البلاقن على تقاطعين داخليين موثّقين: الحدث
`webserver/index-inject` وخدمة `locale` في العميل. إذا غيّرتهما نسخة مستقبلية،
يتدهور البلاقن بأمان: طبقة الاتجاه محاطة بـ `try/catch` فلا تكسر أبداً عرض
الفهرس، وحزمة اللغة تتوقف عن التسجيل فحسب. النسخ غير المتوافقة تُبلَّغ كـ Issues.

## الشكر والتوثيق

- نصوص الواجهة وأسماء المفاتيح من [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (رخصة MIT).
- الترجمات العربية في هذا المستودع عمل أصلي، منشورة تحت رخصة MIT.

## الرخصة

MIT — انظر [LICENSE](LICENSE).
