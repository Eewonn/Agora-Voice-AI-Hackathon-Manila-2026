import { RtcTokenBuilder, RtcRole } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE!;
const CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID!;
const CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const AGORA_BASE_URL = `https://api.agora.io/api/conversational-ai/v2/projects/${APP_ID}`;

const SYSTEM_PROMPT = `You are Sparky, a friendly and encouraging speech therapy coach for children aged 5 to 13.

Your job is to listen to the child speak a word or phrase and give short, positive feedback.

Rules:
- Always start with encouragement before any correction.
- Keep responses to 1-2 sentences maximum.
- Use simple words a young child can understand.
- Never say the child is wrong or bad. Frame corrections as "let's try together".
- Focus on one specific sound or improvement at a time.
- Use occasional fun emojis in speech like "Great job!" or "You're a star!".
- If the child said it well, celebrate clearly: "That was perfect! I heard every sound!"
- If they need to improve: "Nice try! Let's say the R sound together — rrrr. Your turn!"
- Always end with motivation to try again or move forward.`;

function generateAgentToken(channelName: string, agentUid: number): string {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  return RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    agentUid,
    RtcRole.PUBLISHER,
    expiry,
    expiry
  );
}

function getBasicAuth(): string {
  return Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString("base64");
}

// POST — start agent
export async function POST(req: NextRequest) {
  const { channelName, userUid, agentUid = 999, childAge = 8 } = await req.json();

  if (!channelName || !userUid) {
    return NextResponse.json(
      { error: "channelName and userUid are required" },
      { status: 400 }
    );
  }

  const agentToken = generateAgentToken(channelName, agentUid);
  const ageBand =
    childAge <= 7 ? "young child (5-7)" : childAge <= 10 ? "child (8-10)" : "pre-teen (11-13)";

  const body = {
    name: `sparky-${channelName}`,
    properties: {
      channel: channelName,
      token: agentToken,
      agent_rtc_uid: String(agentUid),
      remote_rtc_uids: [String(userUid)],
      enable_string_uid: false,
      idle_timeout: 30,
      asr: {
        language: "en-US",
        task: "conversation",
      },
      llm: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        api_key: GROQ_API_KEY,
        model: "llama-3.3-70b-versatile",
        system_messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT + `\n\nYou are speaking with a ${ageBand}.`,
          },
        ],
        greeting_message:
          "Hi there! I'm Sparky, your speech buddy! Say the phrase on your screen and I'll cheer you on!",
        failure_message: "Hmm, I didn't quite catch that. Try again — you've got this!",
        max_tokens: 150,
        temperature: 0.7,
      },
      tts: {
        vendor: "microsoft",
        params: {
          key: "",
          region: "eastus",
          voice_name: "en-US-AnaNeural",
          rate: "0%",
          volume: "100%",
        },
      },
      vad: {
        silence_duration: 480,
        speech_duration: 15000,
        threshold: 0.5,
        interrupt_duration: 160,
        prefix_padding_duration: 300,
      },
    },
  };

  try {
    const response = await fetch(`${AGORA_BASE_URL}/agents/join`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${getBasicAuth()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Agora agent start error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to start agent" },
        { status: response.status }
      );
    }

    return NextResponse.json({ agentId: data.agent_id ?? data.name });
  } catch (err) {
    console.error("Agent start exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — stop agent
export async function DELETE(req: NextRequest) {
  const { agentId } = await req.json();

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${AGORA_BASE_URL}/agents/${agentId}/leave`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${getBasicAuth()}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const data = await response.json();
      console.error("Agora agent stop error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to stop agent" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Agent stop exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
