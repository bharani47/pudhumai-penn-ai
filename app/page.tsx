"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppState = "idle" | "listening" | "thinking" | "speaking";

interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
}

// ─── Browser Speech API type shims ───────────────────────────────────────────
// The native SpeechRecognition interface is not in every TS lib, so we extend
// the Window type locally instead of pulling in an npm package.

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TAMIL_LANG = "ta-IN";

const STATE_LABELS: Record<AppState, string> = {
  idle: "பேசுவதற்கு அழுத்தவும்",        // "Press to speak"
  listening: "கேட்கிறது…",              // "Listening…"
  thinking: "சிந்திக்கிறது…",           // "Thinking…"
  speaking: "பதில் வருகிறது…",          // "Answer coming…"
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Mutex: prevents double-submission from React StrictMode double-invoke
  // or the rare case where onend fires before isFinal onresult completes.
  const isProcessing = useRef(false);

  // ── Scroll to latest message ──────────────────────────────────────────────
  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Check browser support on mount ───────────────────────────────────────
  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI || !window.speechSynthesis) {
      setSupported(false);
    }
    synthRef.current = window.speechSynthesis;
  }, []);

  // ── Text-to-Speech helper ─────────────────────────────────────────────────
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) return;
    synthRef.current.cancel(); // stop any previous speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = TAMIL_LANG;
    utterance.rate = 0.9;   // slightly slower for clarity
    utterance.pitch = 1.05;

    // ── Tamil voice selection ────────────────────────────────────────────
    // getVoices() can return an empty array on first call in Chrome (Android)
    // because the voice list loads asynchronously. We try immediately and
    // also wire voiceschanged as a one-shot fallback.
    const pickTamilVoice = (): SpeechSynthesisVoice | undefined =>
      synthRef.current!.getVoices().find(
        (v) =>
          v.lang === TAMIL_LANG ||         // exact: "ta-IN"
          v.lang.startsWith("ta") ||       // broad: "ta", "ta-LK", etc.
          v.name.toLowerCase().includes("tamil") || // by name: "Google Tamil"
          v.name.includes("ta-IN"),        // some Android voices use this
      );

    const tamilVoice = pickTamilVoice();
    if (tamilVoice) {
      utterance.voice = tamilVoice;
    } else {
      // Voices not yet loaded — re-assign when the list arrives
      const onVoicesChanged = () => {
        const v = pickTamilVoice();
        if (v) utterance.voice = v;
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          onVoicesChanged,
        );
      };
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        onVoicesChanged,
      );
    }
    // ─────────────────────────────────────────────────────────────────────

    utterance.onend = () => {
      setAppState("idle");
      onEnd?.();
    };
    utterance.onerror = () => {
      setAppState("idle");
      onEnd?.(); // always release the lock even if TTS errors
    };

    setAppState("speaking");
    synthRef.current.speak(utterance);
  }, []);

  // ── Call /api/chat ────────────────────────────────────────────────────────
  const sendToApi = useCallback(
    async (transcript: string) => {
      // ── Mutex guard ──────────────────────────────────────────────────────
      // Blocks duplicate calls from React StrictMode double-invocation or
      // any race between onresult(isFinal) and onend both reaching here.
      if (isProcessing.current) return;
      isProcessing.current = true;
      // ────────────────────────────────────────────────────────────────────

      setAppState("thinking");

      // Append user message to history
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "user", text: transcript },
      ]);

      // Friendly Tamil message shown & spoken for ALL error conditions
      // (503 high-demand, network failure, bad JSON, etc.)
      const USER_FRIENDLY_ERROR =
        "மன்னிக்கவும், இப்போது இணையத் தொடர்பு மெதுவாக உள்ளது. சற்று நேரம் கழித்து மீண்டும் பேசவும்.";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: transcript }),
        });

        // Treat any non-2xx status (including 503 High Demand) as an error
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const reply: string = data.reply ?? USER_FRIENDLY_ERROR;

        // Append AI message to history
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "ai", text: reply },
        ]);

        // Read the reply aloud; release the lock only once TTS is done
        // so the user cannot re-trigger while the answer is still speaking.
        speak(reply, () => {
          isProcessing.current = false;
        });
      } catch {
        // Log silently for debugging — never surface raw errors to the user
        console.error("[sendToApi] fetch failed");

        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 2, role: "ai", text: USER_FRIENDLY_ERROR },
        ]);
        // Release lock after error TTS finishes too
        speak(USER_FRIENDLY_ERROR, () => {
          isProcessing.current = false;
        });
      }
    },
    [speak],
  );

  // ── Start listening ───────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (appState !== "idle") return;

    // Stop any ongoing TTS before we listen
    synthRef.current?.cancel();

    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.lang = TAMIL_LANG;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.results.length - 1; i >= 0; i--) {
        const result = e.results[i];
        if (result.isFinal) {
          final = result[0].transcript;
          break;
        } else {
          interim = result[0].transcript;
        }
      }
      setCurrentTranscript(final || interim);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error("SpeechRecognition error:", e.error);
      setCurrentTranscript("");
      setAppState("idle");
    };

    recognition.onend = () => {
      // onend fires after the user stops speaking
      // At this point currentTranscript may have already updated via onresult
      // We read the ref-captured value and fire the API call
      setCurrentTranscript((transcript) => {
        if (transcript.trim()) {
          sendToApi(transcript.trim());
        } else {
          setAppState("idle");
        }
        return ""; // reset transcript display
      });
    };

    setAppState("listening");
    recognition.start();
  }, [appState, sendToApi]);

  // ── Stop listening manually ───────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Mic button handler ────────────────────────────────────────────────────
  const handleMicPress = () => {
    if (appState === "listening") {
      stopListening();
    } else if (appState === "idle") {
      startListening();
    }
    // During "thinking" or "speaking" — button is visually disabled
  };

  // ─── Derived UI values ──────────────────────────────────────────────────────
  const isListening = appState === "listening";
  const isBusy = appState === "thinking" || appState === "speaking";
  const micDisabled = isBusy;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-gray-950 text-white overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <h1 className="text-green-400 text-base font-bold leading-tight tracking-wide">
          புதுமை பெண் AI உதவியாளர்
        </h1>
        <p className="text-gray-400 text-xs mt-0.5">
          Pudhumai Penn Scheme · Voice Navigator
        </p>
      </header>

      {/* ── Message history (top ~45% of screen) ─────────────────────────── */}
      <section
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
        aria-live="polite"
        aria-label="உரையாடல் வரலாறு"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center pb-4">
            <span className="text-5xl" role="img" aria-label="Microphone">🎙️</span>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              கீழே உள்ள பொத்தானை அழுத்தி பேசுங்கள். AI தமிழில் பதில் கூறும்.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "ai" && (
              <span className="text-lg flex-shrink-0 mt-1" aria-hidden="true">🤖</span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-green-700 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}
            >
              {msg.text}
            </div>
            {msg.role === "user" && (
              <span className="text-lg flex-shrink-0 mt-1" aria-hidden="true">👤</span>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </section>

      {/* ── Live transcript strip ─────────────────────────────────────────── */}
      <div
        className={`flex-shrink-0 px-4 py-2 text-center text-sm transition-all duration-300 ${
          currentTranscript
            ? "text-green-300 bg-gray-900"
            : "text-transparent bg-transparent"
        }`}
        aria-live="polite"
        aria-label="Live transcript"
      >
        {currentTranscript || "​"}{/* zero-width space keeps height stable */}
      </div>

      {/* ── Bottom voice panel (~50% of screen) ──────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center gap-6 py-8 px-6 bg-gray-900 border-t border-gray-800">

        {/* Status label */}
        <p
          className={`text-sm font-medium tracking-widest uppercase transition-colors duration-300 ${
            isListening
              ? "text-red-400"
              : isBusy
              ? "text-yellow-400"
              : "text-gray-400"
          }`}
          aria-live="polite"
        >
          {STATE_LABELS[appState]}
        </p>

        {/* ── Mega microphone button ── */}
        {!supported ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-5xl">😔</span>
            <p className="text-red-400 text-sm max-w-xs">
              உங்கள் உலாவி குரல் அங்கீகாரத்தை ஆதரிக்கவில்லை.
              Chrome அல்லது Edge உலாவியை பயன்படுத்துங்கள்.
            </p>
          </div>
        ) : (
          <button
            onClick={handleMicPress}
            disabled={micDisabled}
            aria-label={
              isListening
                ? "நிறுத்த அழுத்தவும் — Tap to stop listening"
                : "பேச அழுத்தவும் — Tap to speak"
            }
            aria-pressed={isListening}
            className={`
              relative flex items-center justify-center
              w-40 h-40 rounded-full
              transition-all duration-300 ease-in-out
              focus:outline-none focus-visible:ring-4 focus-visible:ring-green-400
              select-none touch-none
              ${
                micDisabled
                  ? "bg-gray-700 cursor-not-allowed opacity-60"
                  : isListening
                  ? "bg-red-600 hover:bg-red-500 shadow-[0_0_0_0_rgba(239,68,68,0.7)] animate-mic-pulse"
                  : "bg-green-600 hover:bg-green-500 active:scale-95 shadow-lg shadow-green-900"
              }
            `}
          >
            {/* Outer pulse rings — only visible while listening */}
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
                <span className="absolute -inset-3 rounded-full border-2 border-red-500 opacity-20 animate-pulse" />
              </>
            )}

            {/* Thinking / speaking spinner */}
            {isBusy && (
              <span className="absolute inset-0 rounded-full border-4 border-t-yellow-400 border-gray-700 animate-spin" />
            )}

            {/* Icon */}
            <span className="text-6xl z-10 select-none" role="img" aria-hidden="true">
              {isListening ? "🔴" : isBusy ? "⏳" : "🎙️"}
            </span>
          </button>
        )}

        {/* Hint text */}
        <p className="text-gray-500 text-xs text-center max-w-xs leading-relaxed">
          {isListening
            ? "பேசி முடித்தவுடன் தானாகவே நின்றுவிடும்."
            : isBusy
            ? "தயவுசெய்து காத்திருங்கள்…"
            : "ஒரு முறை அழுத்தி, தமிழில் கேளுங்கள்."}
        </p>
      </div>
    </div>
  );
}
