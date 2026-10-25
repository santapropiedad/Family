/**
 * Capa de voz desacoplada (spec sección 21): la UI solo conoce esta interfaz,
 * nunca llama directamente a la Web Speech API. Para cambiar de proveedor de
 * voz en el futuro (ej. un servicio de STT/TTS en la nube), basta con
 * implementar `VoiceProvider` y cambiar `getVoiceProvider()`.
 */
export interface VoiceProvider {
  isSupported(): boolean;
  startListening(onResult: (text: string, isFinal: boolean) => void, onEnd: () => void, onError: (message: string) => void): void;
  stopListening(): void;
  speak(text: string, onStart?: () => void, onEnd?: () => void): void | Promise<void>;
  stopSpeaking(): void;
  /**
   * Escucha en segundo plano, de forma continua y gratuita (sin servidor), esperando
   * alguna de las WAKE_WORDS ("hey familia", etc.). Al detectarla, llama a onWake con
   * lo que el usuario dijo después de la palabra de activación (puede venir vacío si
   * solo dijo "hey familia" y se detuvo ahí).
   */
  startWakeWordListening(
    onWake: (commandAfterWake: string) => void,
    onStatusChange: (listening: boolean) => void,
    onError: (message: string) => void
  ): void;
  stopWakeWordListening(): void;
}

export const WAKE_WORDS = ["hey familia", "oye familia", "ok familia"];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Las voces del navegador se cargan de forma asíncrona (a veces después de que ya se intentó
 * hablar), así que la primera llamada espera al evento `voiceschanged` en vez de seguir con una
 * lista vacía. Prefiere una voz en español de Chile y, si no hay, cualquier español disponible.
 */
async function pickSpanishVoice(): Promise<SpeechSynthesisVoice | null> {
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices.length === 0) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const timeout = setTimeout(() => resolve(synth.getVoices()), 1000);
      synth.onvoiceschanged = () => {
        clearTimeout(timeout);
        resolve(synth.getVoices());
      };
    });
  }
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang.toLowerCase() === "es-cl") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("es")) ??
    voices[0]
  );
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

class WebSpeechProvider implements VoiceProvider {
  private recognition: SpeechRecognitionLike | null = null;

  private wakeRecognition: SpeechRecognitionLike | null = null;
  private wakeActive = false;
  private wakeRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeOnStatusChange: ((listening: boolean) => void) | null = null;
  private wakeOnError: ((message: string) => void) | null = null;
  private wakeSessionStartedAt = 0;
  private wakeQuickEndStreak = 0;
  private wakeLastErrorCode = "";

  isSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onError("Tu navegador no soporta reconocimiento de voz. Prueba en Chrome o Edge.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "es-CL";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: unknown) => {
      const e = event as { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
      let text = "";
      let isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      onResult(text, isFinal);
    };
    recognition.onend = onEnd;
    recognition.onerror = (event: unknown) => {
      const e = event as { error?: string };
      onError(e.error === "not-allowed" ? "Necesito permiso para usar el micrófono." : "No pude escucharte bien, intenta de nuevo.");
    };
    this.recognition = recognition;
    recognition.start();
  }

  stopListening(): void {
    this.recognition?.stop();
  }

  async speak(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const voice = await pickSpanishVoice();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Si no se asigna una voz explícita, Chrome/Edge en Windows suelen encolar el audio como
    // "speaking" sin emitir ningún sonido ni error cuando no tienen instalada la variante exacta
    // del `lang` pedido (p.ej. piden "es-CL" pero solo tienen "es-MX"). Asignar la voz a mano
    // evita ese silencio fantasma.
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "es-CL";
    }
    utterance.rate = 1;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  startWakeWordListening(
    onWake: (commandAfterWake: string) => void,
    onStatusChange: (listening: boolean) => void,
    onError: (message: string) => void
  ): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onError("Tu navegador no soporta activación por voz. Prueba en Chrome o Edge.");
      return;
    }
    this.wakeActive = true;
    this.wakeOnStatusChange = onStatusChange;
    this.wakeOnError = onError;
    this.wakeQuickEndStreak = 0;

    const launch = () => {
      if (!this.wakeActive) return;
      const recognition = new Ctor();
      recognition.lang = "es-CL";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event: unknown) => {
        const e = event as { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
        for (let i = 0; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          const heard = normalize(e.results[i][0].transcript);
          const wake = WAKE_WORDS.find((w) => heard.includes(w));
          if (!wake) continue;
          const idx = heard.indexOf(wake);
          const command = e.results[i][0].transcript.trim().slice(idx + wake.length).trim();
          this.wakeActive = false;
          recognition.stop();
          onWake(command);
          return;
        }
      };
      recognition.onend = () => {
        this.wakeRecognition = null;
        if (!this.wakeActive) {
          this.wakeOnStatusChange?.(false);
          return;
        }
        // Algunos celulares (sobre todo Android) cortan una sesión "continuous" casi al
        // instante en vez de mantenerla escuchando, y cada reinicio dispara el sonido del
        // sistema — sin esto, el celular queda pitando sin parar sin escuchar nunca de verdad.
        // Si pasa varias veces seguidas, espaciamos más los reintentos (dándole tiempo al
        // micrófono del celular a soltarse de verdad) y, si aun así no mejora, dejamos de
        // insistir en vez de pitar para siempre.
        const lastedMs = Date.now() - this.wakeSessionStartedAt;
        this.wakeQuickEndStreak = lastedMs < 2000 ? this.wakeQuickEndStreak + 1 : 0;
        if (this.wakeQuickEndStreak >= 4) {
          this.wakeActive = false;
          this.wakeOnStatusChange?.(false);
          const code = this.wakeLastErrorCode ? ` (código: ${this.wakeLastErrorCode})` : "";
          this.wakeOnError?.(
            `Manos libres no funciona de forma confiable en este celular/navegador — se corta solo apenas lo activa${code}. Usa el botón del micrófono para hablarme en vez de "Hey Familia".`
          );
          return;
        }
        const delay = 400 * (this.wakeQuickEndStreak + 1); // 400ms, 800ms, 1200ms, 1600ms
        this.wakeRestartTimer = setTimeout(launch, delay);
      };
      recognition.onerror = (event: unknown) => {
        const e = event as { error?: string };
        this.wakeLastErrorCode = e.error ?? "";
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.wakeActive = false;
          onError("Necesito permiso de micrófono para activarme por voz.");
        }
        // Otros errores (no-speech, network, aborted) se resuelven solos en onend.
      };
      this.wakeRecognition = recognition;
      try {
        this.wakeSessionStartedAt = Date.now();
        recognition.start();
        onStatusChange(true);
      } catch {
        this.wakeRestartTimer = setTimeout(launch, 400);
      }
    };

    launch();
  }

  stopWakeWordListening(): void {
    this.wakeActive = false;
    if (this.wakeRestartTimer) {
      clearTimeout(this.wakeRestartTimer);
      this.wakeRestartTimer = null;
    }
    this.wakeRecognition?.stop();
    this.wakeRecognition = null;
    this.wakeOnStatusChange?.(false);
  }
}

async function transcribeWithGroq(blob: Blob): Promise<string> {
  const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("audio", blob, `comando.${ext}`);
  const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "No pude transcribir el audio.");
  }
  const text = (data.text ?? "").trim();
  if (!text) throw new Error("No escuché nada, intenta de nuevo.");
  return text;
}

function getMediaRecorderCtor(): typeof MediaRecorder | null {
  if (typeof window === "undefined") return null;
  return window.MediaRecorder ?? null;
}

/**
 * Captura del comando de voz (botón del micrófono) vía Groq (Whisper) en vez del reconocimiento
 * de voz del navegador: graba el audio del micrófono, detecta el silencio para cortar sola, y
 * manda el audio a /api/voice/transcribe. "Hey Familia" (wake word) y la respuesta hablada (TTS)
 * siguen siendo locales y gratis en el navegador (delegados a WebSpeechProvider), porque no hay
 * forma gratuita de hacer eso con Groq.
 */
class GroqVoiceProvider implements VoiceProvider {
  private fallback = new WebSpeechProvider();

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private silenceRaf: number | null = null;
  private hardStopTimer: ReturnType<typeof setTimeout> | null = null;

  isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      getMediaRecorderCtor() !== null
    );
  }

  async startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ): Promise<void> {
    const Ctor = getMediaRecorderCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      onError("Tu navegador no soporta grabación de audio. Prueba en Chrome o Edge.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Necesito permiso para usar el micrófono.");
      return;
    }
    this.stream = stream;
    this.chunks = [];

    const mimeType = Ctor.isTypeSupported?.("audio/webm") ? "audio/webm" : undefined;
    const recorder = mimeType ? new Ctor(stream, { mimeType }) : new Ctor(stream);
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.onstop = async () => {
      this.releaseStream();
      const chunks = this.chunks;
      this.chunks = [];
      if (chunks.length === 0) {
        onEnd();
        return;
      }
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const text = await transcribeWithGroq(blob);
        onResult(text, true);
      } catch (err) {
        onError(err instanceof Error ? err.message : "No pude entender el audio.");
      } finally {
        onEnd();
      }
    };

    recorder.start();
    this.hardStopTimer = setTimeout(() => this.stopListening(), 20_000); // tope de seguridad
    this.watchSilence(stream);
  }

  stopListening(): void {
    this.stopSilenceWatch();
    if (this.hardStopTimer) {
      clearTimeout(this.hardStopTimer);
      this.hardStopTimer = null;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else {
      this.releaseStream();
    }
  }

  /** Corta la grabación sola tras ~1.2s de silencio, igual que antes hacía el navegador. */
  private watchSilence(stream: MediaStream): void {
    if (typeof window === "undefined" || !("AudioContext" in window || "webkitAudioContext" in window)) return;
    const AudioCtx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const audioCtx = new AudioCtx();
    this.audioCtx = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    let lastLoudAt = Date.now();
    const SILENCE_THRESHOLD = 0.02;
    const SILENCE_MS = 1200;
    const MIN_RECORDING_MS = 600;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();
      if (rms > SILENCE_THRESHOLD) lastLoudAt = now;
      if (now - startedAt > MIN_RECORDING_MS && now - lastLoudAt > SILENCE_MS) {
        this.stopListening();
        return;
      }
      this.silenceRaf = requestAnimationFrame(tick);
    };
    this.silenceRaf = requestAnimationFrame(tick);
  }

  private stopSilenceWatch(): void {
    if (this.silenceRaf !== null) {
      cancelAnimationFrame(this.silenceRaf);
      this.silenceRaf = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  speak(text: string, onStart?: () => void, onEnd?: () => void): void | Promise<void> {
    return this.fallback.speak(text, onStart, onEnd);
  }

  stopSpeaking(): void {
    this.fallback.stopSpeaking();
  }

  startWakeWordListening(
    onWake: (commandAfterWake: string) => void,
    onStatusChange: (listening: boolean) => void,
    onError: (message: string) => void
  ): void {
    this.fallback.startWakeWordListening(onWake, onStatusChange, onError);
  }

  stopWakeWordListening(): void {
    this.fallback.stopWakeWordListening();
  }
}

let provider: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (!provider) {
    const groq = new GroqVoiceProvider();
    provider = groq.isSupported() ? groq : new WebSpeechProvider();
  }
  return provider;
}
