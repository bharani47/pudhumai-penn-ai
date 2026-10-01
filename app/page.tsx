"use client";

/**
 * @fileoverview Zero-UI voice-only chat interface for the Pudhumai Penn AI Navigator.
 *
 * Architecture overview
 * ─────────────────────
 * This is a single-page React Client Component that implements a complete
 * voice interaction loop using only native browser Web Speech APIs:
 *
 *  1. **STT** – `window.SpeechRecognition` / `window.webkitSpeechRecognition`
 *     captures Tamil speech (`ta-IN`) and produces a text transcript.
 *  2. **API** – The transcript is POST-ed to `/api/chat` (a Next.js serverless
 *     function that calls the Gemini model with a Tamil system prompt).
 *  3. **TTS** – The Tamil text reply is spoken aloud via `window.speechSynthesis`,
 *     preferring a native `ta-IN` voice when available.
 *
 * No external npm packages are used for audio; the repository stays
 * microscopic for low-bandwidth deployment.
 *
 * @module app/page
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";

// ─── Strict TypeScript interfaces ─────────────────────────────────────────────

/**
 * The four mutually-exclusive states of the voice interaction lifecycle.
 *
 * | Value       | Description                                        |
 * |-------------|----------------------------------------------------|
 * | `idle`      | Waiting for the user to tap the mic button.       |
 * | `listening` | SpeechRecognition is active; capturing audio.     |
 * | `thinking`  | Fetch request to `/api/chat` is in flight.        |
 * | `speaking`  | SpeechSynthesis is reading the AI reply aloud.    |
 */
type AppState = "idle" | "listening" | "thinking" | "speaking";

/**
 * A single turn in the conversation history.
 *
 * @property id   - Unique timestamp-based ID used as the React list key.
 * @property role - `"user"` for STT transcript; `"ai"` for Gemini reply.
 * @property text - The UTF-8 Tamil text content of the message.
 */
interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
}

/**
 * Strongly-typed shape of the JSON body returned by `POST /api/chat`.
 *
 * @property reply - The Tamil text reply from Gemini. Present on success.
 * @property error - A human-readable error string. Present on failure.
 */
interface ChatApiResponse {
  reply?: string;
  error?: string;
}

// ─── Browser Speech API type shims ────────────────────────────────────────────
// The native SpeechRecognition interface is not shipped in every TypeScript
// lib, so we define minimal local interfaces instead of pulling in a package.

/**
 * Subset of the W3C `SpeechRecognitionEvent` used by this component.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionEvent}
 */
interface SpeechRecognitionEvent extends Event {
  /** List of recognition result groups, each with one or more alternatives. */
  results: SpeechRecognitionResultList;
}

/**
 * Subset of the W3C `SpeechRecognitionErrorEvent` used by this component.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent}
 */
interface SpeechRecognitionErrorEvent extends Event {
  /** A string code describing the recognition failure (e.g. `"no-speech"`). */
  error: string;
}

/**
 * Minimal interface for a `SpeechRecognition` instance, covering only the
 * properties and event handlers used by this component.
 */
interface SpeechRecognitionInstance extends EventTarget {
  /** BCP-47 language tag for recognition (hardcoded to `"ta-IN"`). */
  lang: string;
  /** When `false`, recognition stops after the first utterance. */
  continuous: boolean;
  /** When `true`, `onresult` fires with partial results while speaking. */
  interimResults: boolean;
  /** Maximum number of recognition alternatives returned per result. */
  maxAlternatives: number;
  /** Starts audio capture. */
  start(): void;
  /** Stops audio capture gracefully, triggering `onend`. */
  stop(): void;
  /** Aborts audio capture immediately. */
  abort(): void;
  /** Fired when speech is detected and a result is available. */
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  /** Fired when a recognition error occurs. */
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  /** Fired when the recognition session ends, whether or not speech was detected. */
  onend: (() => void) | null;
}

/**
 * Augment the global `Window` interface so TypeScript accepts
 * `window.SpeechRecognition` and `window.webkitSpeechRecognition`
 * without casting to `unknown`.
 */
declare global {
  interface Window {
    /** Standard SpeechRecognition constructor (Chrome ≥ 33, Edge ≥ 79). */
    SpeechRecognition: new () => SpeechRecognitionInstance;
    /** WebKit-prefixed fallback for older Chrome / Android WebView builds. */
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// ─── Module-level constants ───────────────────────────────────────────────────

/**
 * BCP-47 language tag used for both STT input and TTS output.
 * `ta-IN` = Tamil as spoken in India.
 */
const TAMIL_LANG = "ta-IN";

/**
 * User-visible Tamil status labels for each {@link AppState}.
 * Displayed in the status strip above the mic button and announced
 * by the `aria-live` region.
 *
 * Translations:
 * - idle     → "Press to speak"
 * - listening → "Listening…"
 * - thinking  → "Thinking…"
 * - speaking  → "Answer coming…"
 */
const STATE_LABELS: Record<AppState, string> = {
  idle: "பேசுவதற்கு அழுத்தவும்",
  listening: "கேட்கிறது…",
  thinking: "சிந்திக்கிறது…",
  speaking: "பதில் வருகிறது…",
};

/**
 * Tamil error message shown to the user when any fetch or API failure occurs.
 * Translation: "Sorry, the internet connection is slow right now.
 *               Please speak again after some time."
 *
 * This constant is module-level (not inside the component) to avoid
 * recreating it on every render — a minor efficiency improvement.
 */
const USER_FRIENDLY_ERROR =
  "மன்னிக்கவும், இப்போது இணையத் தொடர்பு மெதுவாக உள்ளது. சற்று நேரம் கழித்து மீண்டும் பேசவும்.";

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * `HomePageInner` is the core voice-navigator component.
 *
 * It is wrapped in `React.memo` (exported as `HomePage`) so React skips
 * re-rendering when parent props are unchanged.  Because this is the root
 * page component it has no props, but `memo` still prevents the double-render
 * triggered by React 18 Strict Mode in development.
 *
 * ### Interaction flow
 * ```
 * idle ──[tap mic]──▶ listening ──[silence detected]──▶ thinking
 *                                                          │
 *                                          ┌──────────────┘
 *                                          ▼
 *                                       speaking ──[TTS end]──▶ idle
 * ```
 *
 * @returns The full-screen voice UI — header, message history, and mic button.
 */
function HomePageInner() {
  // ── State ──────────────────────────────────────────────────────────────────

  /** Current phase of the voice interaction lifecycle. */
  const [appState, setAppState] = useState<AppState>("idle");

  /** Ordered list of conversation turns (user STT + AI replies). */
  const [messages, setMessages] = useState<Message[]>([]);

  /**
   * Live speech-recognition transcript shown in the strip above the button.
   * Updated with interim results while the user is speaking; cleared on `onend`.
   */
  const [currentTranscript, setCurrentTranscript] = useState("");

  /**
   * `false` when the browser lacks `SpeechRecognition` or `speechSynthesis`.
   * Triggers a fallback UI with an explanatory Tamil message.
   */
  const [supported, setSupported] = useState(true);

  // ── Refs ───────────────────────────────────────────────────────────────────

  /** Reference to the active `SpeechRecognition` session, if any. */
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  /** Reference to `window.speechSynthesis`, set once on mount. */
  const synthRef = useRef<SpeechSynthesis | null>(null);

  /** Scroll anchor — kept at the bottom of the message list. */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Mutex flag preventing double-submission.
   *
   * React 18 Strict Mode mounts components twice in development, which can
   * fire `useCallback`-wrapped handlers twice.  Additionally, `onend` can
   * race with a final `onresult(isFinal=true)` event.  This ref acts as a
   * binary semaphore: set to `true` at the start of `sendToApi` and released
   * only inside the TTS `onend` callback (or `onerror`).
   */
  const isProcessing = useRef(false);

  // ── Side effects ───────────────────────────────────────────────────────────

  /**
   * Scrolls the message list to the latest entry whenever `messages` changes.
   * Uses `smooth` behaviour so the motion is visible to the user.
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Runs once on mount to check for browser Web Speech API support and
   * cache the `speechSynthesis` reference.
   *
   * Chrome for Android requires the `webkit`-prefixed constructor; the
   * `?? ` fallback covers both cases.
   */
  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI || !window.speechSynthesis) {
      setSupported(false);
    }
    synthRef.current = window.speechSynthesis;
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Speaks the given Tamil text using the Web Speech Synthesis API.
   *
   * Voice selection strategy (highest priority first):
   * 1. Exact `lang === "ta-IN"` match.
   * 2. Any voice whose `lang` starts with `"ta"` (covers `"ta-LK"` etc.).
   * 3. Any voice whose `name` contains `"Tamil"` (e.g. `"Google Tamil"`).
   * 4. Any voice whose `name` contains `"ta-IN"` (some Samsung OEM voices).
   *
   * If `getVoices()` returns an empty array (Chrome on Android loads voices
   * asynchronously), a one-shot `voiceschanged` listener retries the search
   * the moment the OS voice list is ready.
   *
   * @param text  - UTF-8 Tamil string to speak aloud.
   * @param onEnd - Optional callback invoked after the utterance ends or errors.
   *                Used to release the {@link isProcessing} mutex.
   */
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) return;
    synthRef.current.cancel(); // cancel any in-flight utterance

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = TAMIL_LANG;
    utterance.rate = 0.9;    // slightly slower than default for clarity
    utterance.pitch = 1.05;  // marginally warmer tone

    /**
     * Searches the OS voice list for the best Tamil match.
     * @returns The matched `SpeechSynthesisVoice`, or `undefined` if none found.
     */
    const pickTamilVoice = (): SpeechSynthesisVoice | undefined =>
      synthRef.current!.getVoices().find(
        (v) =>
          v.lang === TAMIL_LANG ||                      // exact "ta-IN"
          v.lang.startsWith("ta") ||                    // "ta", "ta-LK" …
          v.name.toLowerCase().includes("tamil") ||     // "Google Tamil"
          v.name.includes("ta-IN"),                     // OEM variants
      );

    const tamilVoice = pickTamilVoice();
    if (tamilVoice) {
      utterance.voice = tamilVoice;
    } else {
      // Asynchronous voice list — retry when it loads
      const onVoicesChanged = () => {
        const v = pickTamilVoice();
        if (v) utterance.voice = v;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    }

    utterance.onend = () => {
      setAppState("idle");
      onEnd?.();
    };
    utterance.onerror = () => {
      setAppState("idle");
      onEnd?.(); // always release the mutex, even on TTS failure
    };

    setAppState("speaking");
    synthRef.current.speak(utterance);
  }, []);

  /**
   * Sends the recognised Tamil transcript to the `/api/chat` endpoint and
   * handles the response.
   *
   * Mutex semantics
   * ───────────────
   * - Checks `isProcessing.current` at the very start and returns early if
   *   another call is already in flight (prevents StrictMode double-fire).
   * - Sets `isProcessing.current = true` immediately after the guard.
   * - Releases the mutex **only** inside the `onEnd` callback passed to
   *   {@link speak}, guaranteeing the lock spans the entire fetch-to-TTS cycle.
   *
   * Error handling
   * ──────────────
   * Any failure — network error, HTTP 4xx/5xx, empty JSON — is silently
   * logged and replaced with {@link USER_FRIENDLY_ERROR} in both the chat
   * history and TTS output.  No raw error strings are ever shown to the user.
   *
   * @param transcript - Validated, non-empty Tamil string from STT.
   */
  const sendToApi = useCallback(
    async (transcript: string) => {
      // ── Mutex guard ────────────────────────────────────────────────────────
      if (isProcessing.current) return;
      isProcessing.current = true;
      // ──────────────────────────────────────────────────────────────────────

      setAppState("thinking");

      // Show the user's spoken words immediately in the chat history
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "user", text: transcript },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: transcript }),
        });

        // Any non-2xx status (including 503 High Demand) is treated as an error
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();
        const reply: string = data.reply ?? USER_FRIENDLY_ERROR;

        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "ai", text: reply },
        ]);

        // Speak reply; release the mutex only after TTS finishes
        speak(reply, () => {
          isProcessing.current = false;
        });
      } catch {
        // Silently log — no raw error surfaced to the user
        console.error("[sendToApi] fetch failed");

        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 2, role: "ai", text: USER_FRIENDLY_ERROR },
        ]);
        speak(USER_FRIENDLY_ERROR, () => {
          isProcessing.current = false;
        });
      }
    },
    [speak],
  );

  /**
   * Initialises a new `SpeechRecognition` session and starts audio capture.
   *
   * Configuration:
   * - `lang = "ta-IN"` — captures Tamil speech.
   * - `continuous = false` — stops automatically after one utterance.
   * - `interimResults = true` — fires `onresult` with partial text while
   *   the user is still speaking, powering the live transcript strip.
   * - `maxAlternatives = 1` — we only need the top hypothesis.
   *
   * No-ops if `appState !== "idle"` to prevent overlapping sessions.
   */
  const startListening = useCallback(() => {
    if (appState !== "idle") return;

    // Cancel any TTS that may still be playing before we start listening
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

    /**
     * Updates the live transcript strip with the latest (possibly interim)
     * result.  The loop runs backwards through `results` to find either the
     * most recent final result or the current interim hypothesis.
     *
     * @param e - The SpeechRecognitionEvent carrying the result list.
     */
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

    /**
     * Resets the transcript display and returns to idle on any recognition
     * error (e.g. `"no-speech"`, `"network"`, `"not-allowed"`).
     *
     * @param e - The SpeechRecognitionErrorEvent.
     */
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error("SpeechRecognition error:", e.error);
      setCurrentTranscript("");
      setAppState("idle");
    };

    /**
     * Fires when the recognition session ends (after silence or manual stop).
     * Reads the latest transcript from the state updater function — this is the
     * safest pattern to avoid stale closure values — then either submits it to
     * the API or returns to idle if nothing was captured.
     */
    recognition.onend = () => {
      setCurrentTranscript((transcript) => {
        if (transcript.trim()) {
          sendToApi(transcript.trim());
        } else {
          setAppState("idle");
        }
        return ""; // clear the live strip
      });
    };

    setAppState("listening");
    recognition.start();
  }, [appState, sendToApi]);

  /**
   * Gracefully stops the active `SpeechRecognition` session.
   *
   * Calling `stop()` (rather than `abort()`) lets the engine finish
   * processing any buffered audio and still fires `onend`, which triggers
   * the transcript → API pipeline.
   */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  /**
   * Handles a tap on the microphone button.
   *
   * - **idle** → calls {@link startListening}.
   * - **listening** → calls {@link stopListening} (early submission).
   * - **thinking / speaking** → no-op (button is visually disabled).
   */
  const handleMicPress = () => {
    if (appState === "listening") {
      stopListening();
    } else if (appState === "idle") {
      startListening();
    }
  };

  // ── Derived UI values ───────────────────────────────────────────────────────

  /** `true` while audio capture is active. */
  const isListening = appState === "listening";

  /** `true` while a fetch or TTS is in progress — button is disabled. */
  const isBusy = appState === "thinking" || appState === "speaking";

  /** Whether the mic button should be rendered as disabled. */
  const micDisabled = isBusy;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-gray-950 text-white overflow-hidden">

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <h1 className="text-green-400 text-base font-bold leading-tight tracking-wide">
          புதுமை பெண் AI உதவியாளர்
        </h1>
        <p className="text-gray-400 text-xs mt-0.5">
          Pudhumai Penn Scheme · Voice Navigator
        </p>
      </header>

      {/* ── Message history ── */}
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

      {/* ── Live transcript strip ── */}
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

      {/* ── Bottom voice panel ── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center gap-6 py-8 px-6 bg-gray-900 border-t border-gray-800">

        {/* Status label — announced by aria-live */}
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

        {/* ── Mega microphone button / unsupported fallback ── */}
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
            {/* Pulse rings — visible only while listening */}
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
                <span className="absolute -inset-3 rounded-full border-2 border-red-500 opacity-20 animate-pulse" />
              </>
            )}

            {/* Spinner overlay — visible while thinking or speaking */}
            {isBusy && (
              <span className="absolute inset-0 rounded-full border-4 border-t-yellow-400 border-gray-700 animate-spin" />
            )}

            {/* Contextual icon */}
            <span className="text-6xl z-10 select-none" role="img" aria-hidden="true">
              {isListening ? "🔴" : isBusy ? "⏳" : "🎙️"}
            </span>
          </button>
        )}

        {/* Contextual hint */}
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

/**
 * Default export: `HomePageInner` wrapped in `React.memo`.
 *
 * `React.memo` performs a shallow prop comparison before re-rendering.
 * Since this is the root page (no parent props), it primarily prevents the
 * React 18 Strict Mode deliberate double-render from causing a second
 * `SpeechRecognition.start()` call in development.
 *
 * @see {@link HomePageInner} for the full component documentation.
 */
const HomePage = memo(HomePageInner);
export default HomePage;
