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
  speak(text: string): void;
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

  speak(text: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-CL";
    utterance.rate = 1;
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
        // El navegador corta las sesiones "continuous" tras un silencio; se reinicia sola.
        this.wakeRestartTimer = setTimeout(launch, 250);
      };
      recognition.onerror = (event: unknown) => {
        const e = event as { error?: string };
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.wakeActive = false;
          onError("Necesito permiso de micrófono para activarme por voz.");
        }
        // Otros errores (no-speech, network, aborted) se resuelven solos en onend.
      };
      this.wakeRecognition = recognition;
      try {
        recognition.start();
        onStatusChange(true);
      } catch {
        this.wakeRestartTimer = setTimeout(launch, 250);
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

let provider: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (!provider) provider = new WebSpeechProvider();
  return provider;
}
