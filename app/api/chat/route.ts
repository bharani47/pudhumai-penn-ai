import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// System prompt — injected on every request so
// the model always stays in its constrained role.
// ──────────────────────────────────────────────
const SYSTEM_PROMPT =
  "You are a helpful, empathetic assistant for rural women in Tamil Nadu. " +
  "The user might speak in Tanglish or English, but you must understand them and reply STRICTLY in the Tamil alphabet (தமிழ்). " +
  "NEVER output English letters (A-Z). " +
  "Use simple, conversational, everyday Tamil (பேச்சு வழக்கு) rather than formal/textbook Tamil, so it sounds natural when spoken aloud by a TTS engine. " +
  "Keep answers under 2 sentences. " +
  "Guide them to the 'Pudhumai Penn' scheme.";

// ──────────────────────────────────────────────
// POST /api/chat
// Body: { message: string }
// ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Parse request body
    const body = await req.json();
    const userMessage: string = body?.message?.trim();

    if (!userMessage) {
      return NextResponse.json(
        { error: "No message provided." },
        { status: 400 },
      );
    }

    // 2. Validate API key
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("NEXT_PUBLIC_GEMINI_API_KEY is not set.");
      return NextResponse.json(
        { error: "Server configuration error: missing API key." },
        { status: 500 },
      );
    }

    // 3. Initialise the current @google/genai SDK (≥ 2.3.0)
    //    Uses ai.models.generateContent — the stable, non-deprecated API.
    const ai = new GoogleGenAI({ apiKey });

    // 4. Call Gemini with the injected system instruction
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    // 5. Extract the text reply
    const reply = response.text ?? "";

    if (!reply) {
      return NextResponse.json(
        { error: "Gemini returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    // Surface a safe error message; never leak raw SDK errors to the client
    console.error("[/api/chat] Gemini API error:", err);

    const message =
      err instanceof Error ? err.message : "Internal server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
