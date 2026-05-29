import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/ocr
 *
 * AI-powered receipt scanner using OpenAI Vision (gpt-4o-mini).
 * Falls back to a structured error with a Discord telemetry alert when the service is unavailable.
 *
 * Body: { imageBase64: string }
 * Returns: { success: true, data: { amount, date, vendor } }
 */
export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Check if API key is configured — return a degraded-mode response instead of crashing
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[ocr] OPENAI_API_KEY is not set — OCR service unavailable.");

      // Fire a Discord alert to notify the engineering team
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/discord-alert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "ocr_unavailable",
            embeds: [{
              title: "🔴 OCR Service Unavailable",
              description: "A user attempted to scan a receipt but `OPENAI_API_KEY` is not configured on the server.",
              color: 0xe53e3e,
              timestamp: new Date().toISOString(),
              footer: { text: "Mints Global ERP · Finance Module" }
            }]
          }),
        });
      } catch (_) { /* non-blocking */ }

      return NextResponse.json(
        {
          error: "OCR service is not configured. Please add OPENAI_API_KEY to your .env.local file.",
          degraded: true,
        },
        { status: 503 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast, cost-efficient vision model
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant specialized in reading and extracting structured data from receipts and invoices. You MUST respond with ONLY valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the total amount, date, and vendor name from this receipt. Return ONLY a JSON object with keys: 'amount' (number), 'date' (string YYYY-MM-DD), and 'vendor' (string). Do not wrap in markdown or backticks.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from OpenAI Vision");
    }

    // Strip markdown code fences if the model returns them despite instructions
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const extractedData = JSON.parse(cleanContent);

    return NextResponse.json({ success: true, data: extractedData });
  } catch (error: any) {
    console.error("[ocr] Error processing receipt:", error);

    // Dispatch a Discord alert for any unexpected failures
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/discord-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "ocr_error",
          embeds: [{
            title: "⚠️ OCR Processing Error",
            description: `Receipt scan failed with: \`${error.message}\``,
            color: 0xed8936,
            timestamp: new Date().toISOString(),
            footer: { text: "Mints Global ERP · Finance Module" }
          }]
        }),
      });
    } catch (_) { /* non-blocking */ }

    return NextResponse.json(
      { error: error.message || "Failed to process receipt" },
      { status: 500 }
    );
  }
}
