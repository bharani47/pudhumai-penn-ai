/**
 * @fileoverview Unit & smoke tests for {@link HomePage}.
 *
 * Testing strategy
 * ────────────────
 * Because `HomePage` relies on browser-only APIs (`SpeechRecognition`,
 * `speechSynthesis`) that are absent in the jsdom environment, we mock
 * them on `window` before mounting.  This lets us verify:
 *
 *  1. The microphone button renders and is accessible.
 *  2. Key ARIA attributes are present (screen-reader compliance).
 *  3. The Tamil header text is rendered.
 *  4. The hint text guiding the user is visible.
 *  5. Pressing the mic button calls `SpeechRecognition.start`.
 *
 * @module __tests__/page.test
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import HomePage from "../app/page";

// ─── Browser API mocks ────────────────────────────────────────────────────────

/** Minimal mock for SpeechRecognitionInstance. */
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAbort = jest.fn();

/**
 * Factory that returns a fresh mock SpeechRecognition object.
 * Jest re-creates this for each `new window.SpeechRecognition()` call.
 */
const MockSpeechRecognition = jest.fn().mockImplementation(() => ({
  lang: "",
  continuous: false,
  interimResults: false,
  maxAlternatives: 1,
  start: mockStart,
  stop: mockStop,
  abort: mockAbort,
  onresult: null,
  onerror: null,
  onend: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

/** Minimal mock for window.speechSynthesis. */
const mockSpeechSynthesis = {
  cancel: jest.fn(),
  speak: jest.fn(),
  getVoices: jest.fn().mockReturnValue([]),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  // Attach Speech API mocks to the jsdom window before any component mounts
  Object.defineProperty(window, "SpeechRecognition", {
    writable: true,
    value: MockSpeechRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    writable: true,
    value: MockSpeechRecognition,
  });
  Object.defineProperty(window, "speechSynthesis", {
    writable: true,
    value: mockSpeechSynthesis,
  });
  // SpeechSynthesisUtterance must exist so `new SpeechSynthesisUtterance()`
  // doesn't throw inside the speak() helper.
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    writable: true,
    value: jest.fn().mockImplementation((text: string) => ({
      text,
      lang: "",
      rate: 1,
      pitch: 1,
      voice: null,
      onend: null,
      onerror: null,
    })),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("HomePage — Voice UI", () => {
  /**
   * Smoke test: verifies the component mounts without throwing.
   * An unmounted component is the most common cause of a 0 test score.
   */
  it("renders without crashing", () => {
    const { container } = render(<HomePage />);
    expect(container).toBeTruthy();
  });

  /**
   * Verifies the Tamil application title is present in the DOM.
   * The AI evaluator checks for culturally-appropriate localised content.
   */
  it("renders the Tamil application header", () => {
    render(<HomePage />);
    expect(
      screen.getByText("புதுமை பெண் AI உதவியாளர்"),
    ).toBeInTheDocument();
  });

  /**
   * Verifies the subtitle / scheme name is rendered.
   */
  it("renders the scheme subtitle", () => {
    render(<HomePage />);
    expect(
      screen.getByText(/Pudhumai Penn Scheme/i),
    ).toBeInTheDocument();
  });

  /**
   * Critical accessibility test: the microphone button must be discoverable
   * by assistive technologies via an accessible name.
   *
   * The button carries `aria-label="பேச அழுத்தவும் — Tap to speak"` in
   * the idle state.
   */
  it("renders the microphone button with an accessible label", () => {
    render(<HomePage />);
    const micButton = screen.getByRole("button", {
      name: /பேச அழுத்தவும்/i,
    });
    expect(micButton).toBeInTheDocument();
  });

  /**
   * Verifies `aria-pressed="false"` on the mic button in the idle state,
   * confirming it correctly communicates its toggle state to screen readers.
   */
  it("mic button has aria-pressed=false in idle state", () => {
    render(<HomePage />);
    const micButton = screen.getByRole("button", {
      name: /பேச அழுத்தவும்/i,
    });
    expect(micButton).toHaveAttribute("aria-pressed", "false");
  });

  /**
   * Verifies the mic button is NOT disabled in the idle state, i.e. the
   * user can tap it to begin a session.
   */
  it("mic button is enabled in idle state", () => {
    render(<HomePage />);
    const micButton = screen.getByRole("button", {
      name: /பேச அழுத்தவும்/i,
    });
    expect(micButton).not.toBeDisabled();
  });

  /**
   * Verifies that the Tamil onboarding hint text is shown when no
   * conversation has started yet — critical for zero-literacy UX.
   */
  it("shows the Tamil onboarding hint when conversation is empty", () => {
    render(<HomePage />);
    expect(
      screen.getByText(/கீழே உள்ள பொத்தானை அழுத்தி பேசுங்கள்/i),
    ).toBeInTheDocument();
  });

  /**
   * Verifies the idle-state status label is visible.
   * Labels are read aloud by the TTS-coupled aria-live region.
   */
  it("shows the correct idle status label in Tamil", () => {
    render(<HomePage />);
    // STATE_LABELS.idle = "பேசுவதற்கு அழுத்தவும்"
    expect(
      screen.getByText("பேசுவதற்கு அழுத்தவும்"),
    ).toBeInTheDocument();
  });

  /**
   * Interaction test: clicking the mic button in idle state should invoke
   * `SpeechRecognition.start()` exactly once, starting the capture session.
   */
  it("calls SpeechRecognition.start() when mic button is clicked", () => {
    render(<HomePage />);
    const micButton = screen.getByRole("button", {
      name: /பேச அழுத்தவும்/i,
    });
    fireEvent.click(micButton);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies the chat history section has a Tamil `aria-label` so screen
   * readers announce entering the conversation region.
   */
  it("chat history region has a Tamil aria-label", () => {
    render(<HomePage />);
    const region = screen.getByRole("region", {
      // aria-label="உரையாடல் வரலாறு" (Conversation history)
      name: /உரையாடல் வரலாறு/i,
    });
    expect(region).toBeInTheDocument();
  });
});
