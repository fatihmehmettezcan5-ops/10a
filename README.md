# 10/A Sınıf Paneli

Bir sınıfın günlük ihtiyaçlarını tek yerde toplayan fullstack uygulama:
Next.js (App Router) + PostgreSQL + Drizzle ORM.

## Özellikler

| Modül | Ne yapar |
| --- | --- |
| 🔐 Güvenli kayıt/giriş | scrypt + rastgele tuz ile parola hash'i, HMAC imzalı httpOnly oturum çerezi, sınıf katılım kodu, IP başına hız sınırı. İlk kayıt olan kişi **sınıf başkanı (admin)** olur. |
| 📚 Ödev takibi | Bir kişi ödevi tanımlar, herkes durumunu günceller: *Yapılacak, Yapılıyor, Bitti, Ertelendi (yeni tarihle), İptal edildi*. Her değişiklik kim/ne zaman/neden bilgisiyle geçmişe yazılır. |
| 🗓️ Takvim | Aylık görünüm; **sınıf takvimi** herkese açık, **kişisel takvim** sadece sahibine görünür. Ödev teslim tarihleri de takvimde işaretlenir. |
| ⏰ Ders programı | Haftalık 5 gün × 8 saat tablo. Hücreye tıklayıp ders/öğretmen/derslik düzenlenir, herkes için anında güncellenir. |
| 💬 Sınıf sohbeti | Herkese açık grup sohbeti (4 sn'de bir yenilenir). `#3` yazarsan mesaj o ödeve bağlanır. |
| 🤖 Ödev asistanı | Ödevleri, takvimi, ders programını ve sohbeti bilir; **istersen uygulamada değişiklik yapar** (ödev ekler, durum günceller, erteler, hatırlatıcı kurar, programı değiştirir, sohbete mesaj atar). |

## Asistan sağlayıcısı (0 bütçe)

Uygulama üç sağlayıcıyı destekler ve **hiç anahtar yoksa** yerleşik Türkçe kural motoruyla çalışmaya
devam eder (komutları anlar, eylemleri uygular, tamamen ücretsiz):

```
OPENROUTER_API_KEY=...   # önerilen: tek anahtarla onlarca ücretsiz model
GEMINI_API_KEY=...       # Google AI Studio ücretsiz kotası
GROQ_API_KEY=...         # çok hızlı, cömert ücretsiz kota
```

Model seçimi: `OPENROUTER_MODEL`, `GEMINI_MODEL`, `GROQ_MODEL`.

Sıra: OpenRouter → Gemini → Groq → yerleşik motor. Sağlayıcı hata verirse otomatik olarak
yerleşik motora düşer, uygulama asla kilitlenmez.

## Yerel kurulum

```bash
npm install
cp .env.example .env      # DATABASE_URL ve SESSION_SECRET değerlerini düzenle
npx drizzle-kit push      # tabloları oluşturur
npm run build && npm start
```

`.env` içindeki `DATABASE_URL` zorunludur; üretimde `SESSION_SECRET` de mutlaka ayarlanmalıdır.

## Kalıcı web sitesi (Netlify)

Uygulama SSR, API route ve PostgreSQL kullandığı için yalnızca statik dosya yüklemek yetmez. **Netlify Free +
Neon Free** ile tamamı internette çalışır. Projede hazır `netlify.toml` vardır; App Router, API route'ları ve
ilk veritabanı şema kurulumu deploy sırasında otomatik yapılandırılır.

Tıklanacak ekranlar, gerekli environment variable'lar ve sorun giderme dahil eksiksiz talimat:
**[NETLIFY_KURULUM.md](./NETLIFY_KURULUM.md)**

Geliştirme ortamının verdiği `*.e2b.app` adresi geçici bir **önizlemedir**; kalıcı öğrenci kullanımı için
Netlify'ın verdiği `*.netlify.app` adresi kullanılmalıdır.

## Örnek asistan komutları

- `ödev ekle: Matematik 142. sayfa 1-12, teslim cuma`
- `#4 bitti` · `fizik ödevini pazartesiye ertele` · `kimya ödevi iptal`
- `yarın 15:00 veli toplantısını sınıfa hatırlat`
- `bugün ne var` · `salı ders programı` · `gecikmiş ödevler`
- `sohbete yaz: yarın kütüphanede buluşalım`
