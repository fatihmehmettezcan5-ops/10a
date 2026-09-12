# 10/A Panelini Ücretsiz Olarak İnternete Açma

Bu uygulama **statik HTML değildir**; kullanıcı hesabı, sohbet ve ödevler için sunucu kodu + PostgreSQL gerekir.
Bu nedenle en kolay ücretsiz ikili:

- **Web sitesi / API:** Netlify Free
- **PostgreSQL:** Neon Free

## 1. Ücretsiz veritabanını oluştur

1. [neon.tech](https://neon.tech) adresinde ücretsiz hesap aç.
2. **New Project** ile bir proje oluştur; bölge olarak Avrupa'ya yakın bir bölgeyi seç.
3. **Connection Details** alanında **Pooled connection** seçeneğini aç.
4. `postgresql://...?...sslmode=require` biçimindeki bağlantıyı kopyala. Bu değer `DATABASE_URL` olacak.

> Bağlantı adresi veritabanı parolasını içerir. GitHub'a, mesaja veya ekran görüntüsüne koyma.

## 2. Kodu GitHub'a gönder

Bu klasörü yeni, tercihen **Private**, bir GitHub repository'sine gönder. `.gitignore`, `.env` dosyasının
ve yerel sırların GitHub'a gitmesini engeller.

## 3. Netlify sitesi oluştur

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. GitHub'ı ve bu repository'yi seç.
3. Netlify Next.js'i otomatik algılar. Projedeki `netlify.toml` ayarları otomatik kullanılır:
   - Build command: `npx drizzle-kit push --force && npm run build`
   - Publish directory: `.next`
   - Node.js: `22`
4. Henüz **Deploy** etmeden **Environment variables** alanını aç.

## 4. Ortam değişkenlerini ekle

Netlify → **Project configuration → Environment variables** bölümüne şunları tek tek ekle:

| Değişken | Değer | Zorunlu mu? |
| --- | --- | --- |
| `DATABASE_URL` | Neon'dan kopyalanan **pooled** bağlantı | Evet |
| `SESSION_SECRET` | En az 32 karakter rastgele değer | Evet |
| `CLASS_JOIN_CODE` | Örn. `10A-2026-GIZLI` | Önerilir |
| `NEXT_PUBLIC_CLASS_NAME` | `10/A` | Önerilir |
| `GEMINI_API_KEY` | Google AI Studio anahtarı | Hayır |
| `APP_URL` | İlk deploy'dan sonra verilen Netlify adresi | Hayır |

Güçlü `SESSION_SECRET` üretmek için bilgisayarında şunu çalıştırabilirsin:

```bash
openssl rand -base64 48
```

Windows PowerShell alternatifi:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 5. Deploy et

**Deploy site** düğmesine bas. İlk build sırasında Drizzle tabloları Neon'da otomatik oluşturur. Başarılı olduğunda
Netlify sana aşağıdaki gibi kalıcı bir adres verir:

```text
https://rastgele-site-adi.netlify.app
```

**Domain management** içinden site adını örneğin `sinif-10a.netlify.app` olarak değiştirmeyi deneyebilirsin
(boştaysa ücretsizdir). Kendi alan adın varsa yine buradan bağlanır.

İlk deploy'dan sonra `APP_URL` değerini gerçek Netlify adresiyle güncelle ve bir kez daha deploy et.

## 6. İlk kullanıcı

- Siteyi açıp **Kayıt ol** bölümünü kullan.
- İlk kayıt olan kullanıcı otomatik olarak **sınıf başkanı / admin** olur.
- Diğer öğrenciler belirlediğin `CLASS_JOIN_CODE` ile kaydolur.

## Maliyet

10/A gibi küçük bir sınıf için Netlify Free + Neon Free normal kullanımda yeterlidir. Neon kullanılmadığında
uykuya geçebilir; bu nedenle uzun süre sonra ilk istek 1–3 saniye yavaş olabilir. Bu hata değildir ve ücretsiz
serverless veritabanlarının normal davranışıdır.

## Sorun giderme

- **Build sırasında DATABASE_URL required:** Değişkeni Netlify'da build kapsamına eklediğinden emin ol.
- **Connection timeout:** Neon'da pooled URL'yi ve `sslmode=require` seçeneğini kullan.
- **Site açılıyor ama kayıt çalışmıyor:** `/api/health` adresini aç. `{ "ok": true }` görmelisin.
- **AI yerleşik modda:** `GEMINI_API_KEY` ekle ve yeniden deploy et. Anahtar olmadan temel komutlar yine çalışır.
- **Yeni şema deploy'u:** `netlify.toml` içindeki Drizzle komutu şemayı build sırasında senkronize eder.
