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

class WebSpeechProvider implements VoiceProvider {
  private recognition: SpeechRecognitionLike | null = null;

  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
  }

  startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ): void {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
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
}

let provider: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (!provider) provider = new WebSpeechProvider();
  return provider;
}
