import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/discord-alert
 *
 * Server-side Discord telemetry endpoint.
 * SECURITY: The webhook URL is always sourced from the server environment variable
 * (DISCORD_WEBHOOK_URL). Client payloads cannot override this to prevent redirect attacks.
 *
 * Accepts:
 *   - content: string — plain text message
 *   - embeds: object[] — rich Discord embed objects
 *   - eventType: string — optional label for structured logging
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, embeds, eventType } = body;

    // Always use the server-side environment variable — never trust client-supplied URLs
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[discord-alert] DISCORD_WEBHOOK_URL is not configured in environment.");
      return NextResponse.json(
        { error: "Discord webhook is not configured. Set DISCORD_WEBHOOK_URL in .env.local" },
        { status: 503 }
      );
    }

    // Build a rich payload — default to a plain content message if no embed is supplied
    const payload: Record<string, any> = {
      username: "Mints ERP Telemetry",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/2716/2716652.png",
      content: content || null,
      ...(embeds && embeds.length > 0 ? { embeds } : {}),
    };

    // If no embeds and no explicit content, synthesize a minimal embed
    if (!content && (!embeds || embeds.length === 0)) {
      payload.embeds = [{
        title: "⚡ ERP System Alert",
        description: eventType ? `Event type: \`${eventType}\`` : "An unspecified system event was triggered.",
        color: 0x6b7c4b, // Matte Olive green
        timestamp: new Date().toISOString(),
        footer: { text: "Mints Global ERP · Telemetry Engine" }
      }];
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[discord-alert] Discord API responded ${response.status}: ${errText}`);
      return NextResponse.json(
        { error: `Discord responded with ${response.status}: ${errText}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, eventType: eventType || "generic" });
  } catch (error: any) {
    console.error("[discord-alert] Unexpected error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
