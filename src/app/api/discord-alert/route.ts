import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { content, embeds, webhookUrl } = await req.json();

    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL is missing." }, { status: 400 });
    }

    const payload = {
      content: content || "System alert notification",
      ...(embeds ? { embeds } : {})
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Discord responded with ${response.status}: ${errText}` }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error sending custom Discord alert:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
