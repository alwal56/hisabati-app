# حساباتي — دليل نشر التطبيق 🚀

تطبيق **حساباتي** جاهز للنشر على App Store و Google Play باستخدام **Capacitor**.

---

## ✅ المتطلبات الأساسية

| الأداة | الإصدار |
|--------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| Xcode (iOS) | >= 15 |
| Android Studio (Android) | >= 2023 |
| CocoaPods (iOS) | >= 1.14 |

---

## ⚡ البدء السريع

```bash
# 1. تثبيت التبعيات
npm install

# 2. بناء التطبيق
npm run build

# 3. مزامنة Capacitor
npx cap sync
```

---

## 📱 iOS — App Store

```bash
# إضافة منصة iOS (مرة واحدة فقط)
npx cap add ios

# مزامنة الكود
npx cap sync ios

# فتح Xcode
npx cap open ios
```

### في Xcode:
1. اختر **Signing & Capabilities** → أضف Apple Developer Account
2. غيّر **Bundle Identifier** إلى: `com.hisabati.app`
3. اضبط **Display Name** إلى: `حساباتي`
4. في **Info.plist** أضف:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>لالتقاط صور الإيصالات والفواتير</string>
   <key>NSPhotoLibraryUsageDescription</key>
   <string>لإضافة صور الإيصالات من المعرض</string>
   ```
5. **Product → Archive** لإنشاء الـ IPA
6. ارفع عبر **Transporter** أو مباشرة من Xcode

---

## 🤖 Android — Google Play

```bash
# إضافة منصة Android (مرة واحدة فقط)
npx cap add android

# مزامنة الكود  
npx cap sync android

# فتح Android Studio
npx cap open android
```

### في Android Studio:
1. افتح `android/app/build.gradle`
2. غيّر `applicationId` إلى: `com.hisabati.app`
3. اضبط `versionCode` و `versionName`
4. في `AndroidManifest.xml` تأكد من وجود:
   ```xml
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
   <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
   ```
5. **Build → Generate Signed Bundle/APK**
6. ارفع ملف AAB إلى Google Play Console

---

## 🌐 PWA — نشر كـ Web App

يمكن نشر التطبيق أيضاً كـ Progressive Web App على أي استضافة:

```bash
npm run build
# ثم ارفع محتويات مجلد dist/ إلى:
# - Vercel: npx vercel
# - Netlify: اسحب مجلد dist إلى netlify.com
# - Firebase: firebase deploy
```

### للإضافة إلى الهاتف من المتصفح:
- **iOS Safari**: مشاركة → إضافة إلى الشاشة الرئيسية
- **Android Chrome**: القائمة → تثبيت التطبيق

---

## 🏪 نشر مباشر عبر PWABuilder (بدون Xcode/Android Studio)

1. ارفع التطبيق على أي hosting (Vercel, Netlify)
2. افتح https://www.pwabuilder.com
3. أدخل رابط تطبيقك
4. اختر المنصة وحمّل الحزمة الجاهزة للرفع

---

## 📁 هيكل المشروع

```
hisabati-app/
├── src/
│   ├── App.jsx          ← التطبيق الكامل
│   ├── main.jsx         ← نقطة الدخول
│   ├── storage.js       ← قاعدة البيانات المحلية (localStorage)
│   ├── notifications.js ← إشعارات Capacitor
│   └── share.js         ← مشاركة Capacitor
├── public/
│   └── icons/           ← أيقونات جميع المقاسات
├── index.html           ← HTML مع meta tags كاملة
├── vite.config.js       ← إعدادات البناء + PWA
├── capacitor.config.json← إعدادات Capacitor
└── package.json
```

---

## 🔧 متغيرات مهمة للتغيير قبل النشر

| الملف | المتغير | القيمة الحالية |
|-------|---------|----------------|
| capacitor.config.json | appId | com.hisabati.app |
| capacitor.config.json | appName | حساباتي |
| vite.config.js | name | حساباتي |

---

## 💡 ملاحظات مهمة

- **رمز OTP**: يظهر في الشاشة مباشرة (تجريبي). للإرسال الحقيقي عبر SMS أضف خدمة مثل **Twilio** أو **Unifonic** في backend منفصل.
- **البيانات**: محفوظة محلياً في `localStorage`. لمزامنة السحابة يمكن إضافة Firebase أو Supabase.
- **الإشعارات**: تعمل بشكل كامل عبر Capacitor LocalNotifications على iOS و Android.

---

## 📞 للدعم
تطبيق حساباتي — مبني بـ React + Vite + Capacitor
