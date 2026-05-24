import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    let webhookUrl = process.env.DISCORD_WEBHOOK_URL; // Default
    let isEventEnabled = true;

    // Load active settings dynamically from Firestore
    try {
      const docSnap = await getDoc(doc(db, "settings", "discordWebhook"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.url) {
          webhookUrl = data.url;
        }
        if (data.events && body.eventType) {
          let eventKey = body.eventType;
          if (eventKey === "hr") eventKey = "auth"; // HR routes as Auth trigger
          if (data.events[eventKey] !== undefined) {
            isEventEnabled = !!data.events[eventKey];
          }
        }
      }
    } catch (fsErr) {
      console.warn("Firestore webhook settings load failed, falling back to environment parameters.", fsErr);
    }

    if (!isEventEnabled) {
      // Event type has been intentionally disabled by founder/admin
      return NextResponse.json({ success: true, message: 'Event type has been muted by administrative settings.' });
    }

    if (!webhookUrl) {
      console.warn("Discord webhook URL is not set in environment or database.");
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
