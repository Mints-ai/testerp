import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    let webhookUrl = process.env.DISCORD_WEBHOOK_URL; // Default

    if (body.eventType === 'auth' && process.env.DISCORD_WEBHOOK_URL_AUTH) {
      webhookUrl = process.env.DISCORD_WEBHOOK_URL_AUTH;
    } else if (body.eventType === 'hr' && process.env.DISCORD_WEBHOOK_URL_HR) {
      webhookUrl = process.env.DISCORD_WEBHOOK_URL_HR;
    }

    if (!webhookUrl) {
      console.warn("Discord webhook URL is not set in environment variables.");
      return NextResponse.json({ success: false, error: 'Discord webhook URL not configured.' }, { status: 500 });
    }

    // Clean up eventType before sending to Discord
    const discordPayload = { ...body };
    delete discordPayload.eventType;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordPayload),
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
