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
devam eder. Eylül 2026 resmi kataloglarına göre varsayılan modeller:

| Sağlayıcı | Varsayılan model | Durum |
| --- | --- | --- |
| Google AI Studio | `gemini-3.8-flash` | Stable, structured output, ücretsiz API katmanı |
| Groq | `openai/gpt-oss-120b` | Production, strict JSON, ücretsiz hesapta 1.000 istek/gün üst sınırı |
| OpenRouter | `nex-agi/nex-n2.5-pro:free` | Ücretsiz, agentic, structured output ve tool calling |

```text
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
AI_PROVIDER=gemini
```

`GEMINI_MODEL`, `GROQ_MODEL` ve `OPENROUTER_MODEL` **zorunlu değildir**; yukarıdaki güncel modeller kodda
varsayılandır. Bir model çalışmazsa uygulama sağlayıcı başına iki güncel yedeği, ardından anahtarı bulunan
diğer sağlayıcıları otomatik dener. Varsayılan sıra Gemini → Groq → OpenRouter → yerleşik motordur.
`AI_PROVIDER=groq` veya `AI_PROVIDER=openrouter` ile ilk tercihi değiştirebilirsin.

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
