# 📱 Android Uygulaması (TWA)

Siteyi adres çubuğu olmadan, uygulama gibi açan imzalı APK bu klasördeki
Gradle projesinden üretilir. Derleme GitHub Actions'ta otomatiktir.

| Alan | Değer |
|---|---|
| Paket | `com.sinif10a.panel` |
| Bağlı site | `https://10asinifi.netlify.app` |
| Güncel sürüm | 1.0.0 (versionCode 3) |
| Min Android | 5.0 (API 21) |

## 🔑 Bir kez: GitHub Secrets ekle

Repo → **Settings → Secrets and variables → Actions → New repository secret**
(keystore dosyası: kişisel yedeğindeki `android.keystore`):

| Secret adı | Değer |
|---|---|
| `ANDROID_KEYSTORE_B64` | `base64 -w0 android.keystore` çıktısı |
| `ANDROID_KEYSTORE_PASSWORD` | keystore şifresi |
| `ANDROID_KEY_ALIAS` | `panel` |
| `ANDROID_KEY_PASSWORD` | key şifresi |

## 🚀 APK derle

1. GitHub'da **Actions → Android APK → Run workflow**
2. `versionCode`'u bir artır (örn. 4), `versionName`'i isteğe göre yaz
3. Run → bitince **Artifacts → 10a-panel-apk** indir

`v1.0.1` gibi bir etiket itersen (`git tag v1.0.1 && git push --tags`)
APK otomatik olarak GitHub Release'e de eklenir.

## ⚠️ Altın kural

Siteyi (web kısmını) güncellemek için APK derlemene **gerek yok** —
uygulama siteyi canlı gösterir. APK yalnızca uygulama adı/ikonu/sürümü
gibi native kısımlar değişince yeniden derlenir. Aynı anahtarla imzala,
yoksa telefonlar güncellemeyi reddeder.

## Yerelde derlemek istersen

```bash
cd android
./gradlew assembleRelease          # ANDROID_HOME tanımlı olmalı
# imzalama: zipalign + apksigner (bkz. .github/workflows/apk.yml)
```
