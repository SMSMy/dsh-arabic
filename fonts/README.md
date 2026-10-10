# الخطوط — thmanyah fonts

هذا المجلد الفرعي (لا جذر المستودع) يحمل ثلاث قطع من خط **ثمانية**، كلٌّ في الدور
الذي رُسم له:

| القطع | المجلد | الدور في الواجهة | الأوزان |
|---|---|---|---|
| **ثمنية سانس** | `thmanyahsans/` | الافتراضي: الوسوم والأزرار والهيكل والنصوص الصغيرة | 400 · 500 · 700 |
| **ثمنية سيريف تيكست** | `thmanyahseriftext/` | القراءة الطويلة: فقرات الماركداون والقوائم والاقتباسات | 400 · 500 · 700 |
| **ثمنية سيريف ديسپلاي** | `thmanyahserifdisplay/` | العناوين `h1`–`h6` | 400 · 500 · 700 |

ومعها نصّا الرخصة: `LICENSE.pdf` (بالإنجليزية) و`LICENSE-ar.pdf` (بالعربية، وهي
الحاكمة عند الاختلاف). والملفات تُقرأ كما وصلت: لا تعديل ولا اشتقاق ولا إعادة تسمية.

## كيف تصل إلى الواجهة؟

عند إقلاع المضيف يقرأ `index.js` الأوزان الموجودة، ويسجّل لكلٍّ منها `@font-face`
يشير إلى مسار على خادم التطبيق نفسه:

```
/dsh-arabic/fonts/v<الإصدار>/thmanyahsans/thmanyahsans-Regular.woff2
```

ويُعرّف ثلاثة متغيّرات، ثم يربط بها الأدوار:

```css
--dsh-arabic-sans         → --dsw-font-family      (خط الواجهة الافتراضي)
--dsh-arabic-serif-text   → p, li, blockquote, dd  (نصوص القراءة)
--dsh-arabic-display      → h1…h6                  (العناوين)
```

ومنذ DSH 0.2.1 يقف كلٌّ من الثلاثة **احتياطياً** لمتغيّر التطبيق
`--dsh-font-family-text` — الخط المختار في **الإعدادات ← عام**: اختيارك يتقدّم على
قطعنا، والحقل الفارغ يُبقي ثمانية. والمتغيّر يُقرأ ولا يُعرَّف هنا أبداً.

وفضلًا عن ذلك: حزمة خطوط التطبيق تبقى خلف كل عائلة في التعريف نفسه (فما لا محرف
له عندنا يسقط إليها)، وخطّ الكود لا يُلمس (يبقى أحادي المسافة).

**لماذا مسار على الخادم لا `data:` مضمَّن؟** لأنّ نسخة الديسكتوب تحمّل صفحتها من
`http://127.0.0.1:<port>` (مضيفها يسلّم Electron رابطًا موثّقًا مع صفوف الحقن)،
فالرابط من الأصل نفسه يعمل في الوجهين، وتحمل الصفحة تسع قواعد قصيرة بدل نحو ميغابايت
من base64. وإن كانت التركيبة بلا خادم ويب (نشر ثابت) فالمسار يعيد 404، ويسقط
المتصفّح إلى حزمة خطوط التطبيق كما لو لم تكن الطبقة موجودة.

## تحكّم

| ما تريد | كيف |
|---|---|
| خط التطبيق الأصلي كله | وجّه `DSH_ARABIC_FONTS` إلى **مجلد فارغ** — لا `@font-face` ولا تعريف |
| نسختك من الخط | مجلد بالبنية نفسها (`thmanyahsans/…`) ووجّه المتغيّر إليه |
| تبديل دور (مثلًا: الفقرات بلا سيريف) | في devtools: `--dsh-arabic-serif-text: var(--dsh-arabic-sans)` |

## الرخصة

الخط من **ثمانية** (thmanyah Publishing & Distribution)، ويُضمَّن هنا بلا تعديل
ومعه نصّا الرخصة (العربية هي الحاكمة عند اختلاف الترجمة). ورخصة ثمانية تسمح بتضمين
الخط في التطبيقات والمواقع بوصفه جزءًا من منتجٍ محزوم، وتمنع بيعه أو إعادة توزيعه
بمعزل عن العمل كملفات خطٍّ مستقلة، وتَمنع اشتقاق خطٍّ منه. النص الكامل في
`LICENSE-ar.pdf` والإنجليزي في `LICENSE.pdf`.

---

# Fonts (English)

`fonts/` — a subfolder of the repository, never its root — carries three thmanyah
cuts with both license texts (the Arabic one governs): **Sans** for the interface
default, **Serif Text** for long-form reading (markdown paragraphs, list items,
quotations) and **Serif Display** for `h1`–`h6`. Weights 400/500/700 each, read
unmodified.

`index.js` lists them, adds one `@font-face` per weight pointing at
`/dsh-arabic/fonts/v<version>/<family>/<file>` on the app's own web server, and
binds three variables — `--dsh-arabic-sans` (which becomes `--dsw-font-family`),
`--dsh-arabic-serif-text` and `--dsh-arabic-display` — to their element roles. The
app's own stack stays behind every family, and the code family is untouched. Since
DSH 0.2.1 each of the three also sits behind the app's own `--dsh-font-family-text`
(the family chosen under General settings), so a chosen family wins and an empty
field keeps thmanyah.

Served rather than inlined because the Desktop shell loads its page from
`http://127.0.0.1:<port>`: a same-origin URL works in both shells, and the page
carries nine short rules instead of a megabyte of base64. A composition without a
web server answers 404 and the browser falls through to the app's own stack.
Point `DSH_ARABIC_FONTS` at an empty directory to keep that stack deliberately.