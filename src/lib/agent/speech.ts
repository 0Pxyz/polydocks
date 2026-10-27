/**
 * Web Speech API and Web Audio integration for hands-free Polymax agent interaction.
 * Gracefully falls back if microphone permission is denied or unsupported.
 */

// Global declarations for browser SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export interface VoiceRecognitionHandle {
  stop: () => void;
}

/**
 * Starts microphone listening using the Web Speech API.
 */
export function startVoiceInput(
  onTranscript: (text: string, isFinal: boolean) => void,
  onAudioLevel?: (level: number) => void,
  onError?: (err: Error) => void,
  onEnd?: () => void
): VoiceRecognitionHandle | null {
  if (typeof window === "undefined") return null;

  const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechClass) {
    onError?.(new Error("Speech recognition not supported in this browser"));
    return null;
  }

  let recognition: any;
  let audioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let animationFrame: number | null = null;

  try {
    recognition = new SpeechClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final.trim()) {
        onTranscript(final.trim(), true);
      } else if (interim.trim()) {
        onTranscript(interim.trim(), false);
      }
    };

    recognition.onerror = (event: any) => {
      // Permission denied or abort should not crash the UI
      onError?.(new Error(event.error || "Speech recognition error"));
    };

    recognition.onend = () => {
      if (audioStream) {
        for (const track of audioStream.getTracks()) track.stop();
        audioStream = null;
      }
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
      if (animationFrame) cancelAnimationFrame(animationFrame);
      onEnd?.();
    };

    // Attach mic level meter if user permits audio stream
    if (navigator.mediaDevices?.getUserMedia && onAudioLevel) {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          audioStream = stream;
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            onAudioLevel(Math.min(1, avg / 128));
            animationFrame = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        })
        .catch(() => {
          // Microphone access denied or muted; proceed with SpeechRecognition alone
        });
    }

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // Ignore if already stopped
        }
      },
    };
  } catch (err: any) {
    onError?.(err);
    return null;
  }
}

/**
 * Spoken reply synthesis using SpeechSynthesis.
 */
export function speakReply(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel(); // Cancel any prior pending utterance

    const cleanText = text
      .replace(/[`*_#[\]()]/g, "") // Strip markdown chars
      .replace(/https?:\/\/\S+/g, "") // Strip raw URLs
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    if (onStart) utterance.onstart = () => onStart();
    if (onEnd) utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}
