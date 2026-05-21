import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn("DISCORD_WEBHOOK_URL is not set in environment variables.");
      return NextResponse.json({ success: false, error: 'Discord webhook URL not configured.' }, { status: 500 });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Discord webhook error:", errorText);
      return NextResponse.json({ success: false, error: 'Failed to send Discord message' }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in Discord API route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
