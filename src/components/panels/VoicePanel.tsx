"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Me } from "@/lib/client";

type Status = { voiceUrl: string | null; online: number; rooms: { name: string; users: number }[] };

const ROOMS = ["E1", "E2", "E3", "K1", "K2", "K3"] as const;

/**
 * Sesli oda arayüzü: WebRTC sinyal sunucusuna bağlanır (Render'da çalışır),
 * mikrofon akışını aynı odadaki kişilerle paylaşır.
 */
export default function VoicePanel({
  me,
  notify,
}: {
  me: Me;
  notify: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inRoom, setInRoom] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElsRef = useRef<Record<string, HTMLAudioElement>>({});
  const roomRef = useRef<string | null>(null);

  useEffect(() => {
    api<Status>("/api/voice/status")
      .then(setStatus)
      .catch(() => setStatus({ voiceUrl: null, online: 0, rooms: [] }));
  }, []);

  /** getUserMedia hatasını kullanıcıya anlamlı Türkçe mesaja çevirir. */
  function micErrorMessage(error: unknown): string {
    const code = (error as { name?: string })?.name ?? "BilinmeyenHata";
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      if (/ wv\)/.test(navigator.userAgent)) {
        return `Uygulama içi görünüm mikrofon vermiyor. Chrome uygulamasından sitemizi aç. (${code})`;
      }
      return `Bu ortam mikrofon erişimini desteklemiyor. Chrome veya Safari ile siteyi aç. (${code})`;
    }
    switch (code) {
      case "NotAllowedError":
      case "SecurityError":
        return `Mikrofon engellenmiş. 1) Adres çubuğundaki kilit → Mikrofon: İzin ver. 2) Windows: Ayarlar → Gizlilik ve güvenlik → Mikrofon → erişim açık olsun. 3) Sayfayı yenile. (${code})`;
      case "NotFoundError":
        return `Cihazda mikrofon bulunamadı. Başka bir cihazdan dene. (${code})`;
      case "NotReadableError":
        return `Mikrofon başka bir uygulama tarafından kullanılıyor veya sistem erişimi vermiyor. Arama/Konferans uygulamalarını kapat, Windows mikrofon gizlilik ayarını kontrol et. (${code})`;
      default:
        return `Mikrofon açılamadı (${code}). Tekrar dene.`;
    }
  }

  async function joinCall(target: string) {
    if (connecting || inRoom === target) return;
    setConnecting(true);
    try {
      const { token, url } = await api<{ token: string; url: string }>("/api/voice/token", {
        method: "POST",
        body: JSON.stringify({ room: target }),
      });

      // Mikrofonu WS'den ÖNCE iste: izin penceresi kullanıcı hareketini kaybetmesin,
      // hata olursa bağlantı hiç kurulmasın.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        notify(micErrorMessage(error));
        setConnecting(false);
        return;
      }
      streamRef.current = stream;

      const ws = new WebSocket(`${url}?token=${token}&name=${encodeURIComponent(me.name)}&vc=`);
      wsRef.current = ws;
      roomRef.current = target;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", room: target }));
        setInRoom(target);
        setRoom(target);
        setMuted(false);
        setConnecting(false);
        notify(`${target} odasına bağlandın 🎧`);
      };
      ws.onclose = () => {
        if (roomRef.current) {
          notify("Ses bağlantısı koptu.");
          cleanup();
        }
      };
      ws.onerror = () => {}; // hata sonrası onclose tetiklenir
    } catch (error) {
      notify(error instanceof Error ? error.message : "Bağlanamadı.");
      setConnecting(false);
    }
  }

  function handleSignal(msg: Record<string, unknown>) {
    switch (String(msg.type)) {
      case "joined":
        setPeers((msg.users as { name: string }[]).map((u) => u.name).filter((n) => n !== me.name));
        break;
      case "user-joined": {
        const name = String(msg.name);
        if (name !== me.name) {
          setPeers((prev) => (prev.includes(name) ? prev : [...prev, name]));
          notify(`${name} odaya katıldı`);
        }
        break;
      }
      case "user-left": {
        const name = String(msg.name);
        setPeers((prev) => prev.filter((n) => n !== name));
        const pc = pcsRef.current[name];
        if (pc) pc.close();
        delete pcsRef.current[name];
        break;
      }
      case "speaking":
        setSpeaking((prev) => ({ ...prev, [String(msg.name)]: !!msg.on }));
        break;
      case "signal":
        handlePeerSignal(String(msg.from), msg.data as Record<string, unknown>);
        break;
    }
  }

  async function handlePeerSignal(from: string, data: Record<string, unknown>) {
    let pc = pcsRef.current[from];
    if (!pc) {
      pc = createPeer(from);
    }
    if (data.sdp) {
      const sdp = data.sdp as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      if (sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current?.send(JSON.stringify({ type: "signal", data: { sdp: pc.localDescription } }));
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit));
      } catch {}
    }
  }

  function createPeer(target: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    });
    pcsRef.current[target] = pc;

    streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!));

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        wsRef.current?.send(JSON.stringify({ type: "signal", data: { candidate: ev.candidate } }));
      }
    };
    pc.ontrack = (ev) => {
      let audio = audioElsRef.current[target];
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElsRef.current[target] = audio;
      }
      audio.srcObject = ev.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        pc.close();
        delete pcsRef.current[target];
      }
    };

    // Polite/impolite: isim karşılaştırmasıyla offer çakışmasını önle
    if (me.name > target) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current?.send(JSON.stringify({ type: "signal", data: { sdp: pc.localDescription } }));
        } catch {}
      };
    }
    return pc;
  }

  function cleanup() {
    leaveCall();
  }

  function leaveCall() {
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    pcsRef.current = {};
    Object.values(audioElsRef.current).forEach((a) => {
      a.srcObject = null;
    });
    audioElsRef.current = {};
    setInRoom(null);
    setRoom(null);
    setPeers([]);
    setSpeaking({});
  }

  // Bileşen kaldırılınca mikrofonu ve bağlantıları kapat
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, []);

  function toggleMute() {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    wsRef.current?.send(JSON.stringify({ type: "mute", muted: next }));
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h1 className="text-lg font-bold text-white">🎧 VC Odaları</h1>
        <p className="text-xs text-slate-400">
          Bir odaya dokun, mikrofona izin ver ve bağlan. E odaları erkekler, K odaları kızlar içindir; isteyen istediği odaya girebilir.
        </p>
        {status?.voiceUrl === null && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Ses sunucusu henüz yapılandırılmadı. Netlify ortam değişkenlerine VOICE_SECRET ekleyin.
          </div>
        )}
        {status && <p className="mt-2 text-[11px] text-slate-400">Şu an seste {status.online} kişi var.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROOMS.map((r) => {
          const online = status?.rooms?.find((x) => x.name === r)?.users ?? 0;
          const isE = r.startsWith("E");
          const active = inRoom === r;
          return (
            <button
              key={r}
              disabled={connecting}
              onClick={() => (active ? leaveCall() : joinCall(r))}
              className={`card p-4 text-left transition ${
                active
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : isE
                    ? "hover:border-sky-500/50"
                    : "hover:border-pink-500/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-lg px-2 py-0.5 text-sm font-black ${
                    isE ? "bg-sky-500/20 text-sky-300" : "bg-pink-500/20 text-pink-300"
                  }`}
                >
                  {r}
                </span>
                <span className="text-[11px] text-slate-400">{online} kişi</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {active ? "Bağlısın — çıkmak için tıkla" : connecting ? "..." : "Katıl"}
              </div>
            </button>
          );
        })}
      </div>

      {inRoom && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">
              🎙️ {inRoom} odasındasın — {peers.length + 1} kişi
            </h2>
            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={toggleMute}>
                {muted ? "🔇 Kapalı" : "🎤 Açık"}
              </button>
              <button className="btn btn-primary" onClick={leaveCall}>
                📞 Çık
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200">
              {me.name.split(" ")[0]} {speaking[me.name] ? "🗣" : muted ? "🔇" : ""}
            </span>
            {peers.map((p) => (
              <span key={p} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {p.split(" ")[0]} {speaking[p] ? "🗣" : ""}
              </span>
            ))}
            {peers.length === 0 && <span className="text-xs text-slate-400">Odaya seni bekliyorlar…</span>}
          </div>
        </div>
      )}

      <audio id="voice-audio-anchor" className="hidden" />
    </div>
  );
}
