"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";
import { Mic, MicOff, SkipForward, RotateCcw, X, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  startSession,
  endSession,
  saveSessionScores,
  saveFeedbackEvents,
  saveRecommendation,
} from "@/lib/db";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPromptsForAge, getAgeGroup, type Prompt } from "@/lib/prompts";
import type { FeedbackChip, SessionScore } from "@/types";

type MicState = "idle" | "listening" | "processing" | "done";

const NEXT_DRILLS: Record<string, string> = {
  pronunciation: "Practice slow, deliberate speaking with the R and S drill",
  fluency: "Try reading a short sentence out loud three times smoothly",
  articulation: "Focus on ending sounds — practice words ending in -ck and -t",
  confidence: "Record yourself saying a tongue twister and play it back",
};

// Simple heuristic scoring based on how long child spoke
function scoreFromDuration(durationMs: number): SessionScore {
  const base = Math.min(100, 60 + Math.floor(durationMs / 200));
  const variance = () => Math.floor(Math.random() * 10) - 5;
  return {
    pronunciation: Math.min(100, Math.max(40, base + variance())),
    fluency: Math.min(100, Math.max(40, base - 5 + variance())),
    articulation: Math.min(100, Math.max(40, base - 3 + variance())),
    confidence: Math.min(100, Math.max(40, base + 5 + variance())),
  };
}

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export default function PracticePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [micState, setMicState] = useState<MicState>("idle");
  const [allFeedback, setAllFeedback] = useState<FeedbackChip[]>([]);
  const [scores, setScores] = useState<SessionScore[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [speakStartTime, setSpeakStartTime] = useState(0);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init Agora + start session ──────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("legacypp_profile");
    if (!stored) { router.replace("/"); return; }
    const profile = JSON.parse(stored);
    const ageGroup = getAgeGroup(profile.childAge);
    const sessionPrompts = getPromptsForAge(ageGroup, 5);
    setPrompts(sessionPrompts);

    const channelName = `session-${profile.childId ?? "demo"}-${Date.now()}`;
    localStorage.setItem("legacypp_channel", channelName);

    const userUid = Math.floor(Math.random() * 100000) + 1;
    localStorage.setItem("legacypp_uid", String(userUid));

    // Start Supabase session
    if (user && profile.childId) {
      const now = new Date().toISOString();
      setSessionStartedAt(now);
      startSession(profile.childId, user.id, sessionPrompts.length)
        .then((s) => setSessionId(s.id))
        .catch(console.error);
    }

    // Init Agora client
    const initAgora = async () => {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        // Listen for the AI agent joining and speaking
        client.on("user-published", async (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
          if (mediaType === "audio") {
            await client.subscribe(remoteUser, "audio");
            remoteUser.audioTrack?.play();
            setAgentSpeaking(true);
          }
        });

        client.on("user-unpublished", (_: IAgoraRTCRemoteUser, mediaType: string) => {
          if (mediaType === "audio") setAgentSpeaking(false);
        });

        // Get token from our API
        const tokenRes = await fetch("/api/agora/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelName, uid: userUid }),
        });
        const { token } = await tokenRes.json();

        // Join channel
        await client.join(APP_ID, channelName, token, userUid);

        // Create mic track but don't publish yet
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: "speech_low_quality" });
        micTrackRef.current = micTrack;

        // Start AI agent
        const agentRes = await fetch("/api/agora/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelName,
            userUid,
            agentUid: 999,
            childAge: profile.childAge,
          }),
        });
        const agentData = await agentRes.json();
        if (agentData.agentId) setAgentId(agentData.agentId);

        setAgoraReady(true);
      } catch (err) {
        console.error("Agora init error:", err);
        setAgoraReady(true); // Still allow practice with degraded mode
      }
    };

    initAgora();

    return () => {
      cleanup();
    };
  }, [user, router]);

  const cleanup = async () => {
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current);

    // Stop mic
    if (micTrackRef.current) {
      micTrackRef.current.stop();
      micTrackRef.current.close();
      micTrackRef.current = null;
    }

    // Stop agent
    const storedAgentId = agentId;
    if (storedAgentId) {
      fetch("/api/agora/agent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: storedAgentId }),
      }).catch(console.error);
    }

    // Leave channel
    if (clientRef.current) {
      await clientRef.current.leave().catch(console.error);
      clientRef.current = null;
    }
  };

  // ── Mic controls ────────────────────────────────────────────
  const handleMicToggle = async () => {
    if (!micTrackRef.current) return;

    if (micState === "listening") {
      // Stop speaking
      const duration = Date.now() - speakStartTime;
      await clientRef.current?.unpublish(micTrackRef.current);
      await micTrackRef.current.setEnabled(false);
      setMicState("processing");

      // Score based on speaking duration + wait for agent response
      speakTimerRef.current = setTimeout(() => {
        const score = scoreFromDuration(duration);
        const chip: FeedbackChip = { type: "success", message: "Sparky is listening… 🎙️" };
        setAllFeedback((prev) => [...prev, chip]);
        setScores((prev) => [...prev, score]);
        setMicState("done");
      }, 800);

    } else if (micState === "idle" || micState === "done") {
      // Start speaking
      try {
        await micTrackRef.current.setEnabled(true);
        await clientRef.current?.publish(micTrackRef.current);
        setSpeakStartTime(Date.now());
        setMicState("listening");
      } catch (err) {
        console.error("Mic publish error:", err);
      }
    }
  };

  const handleRetry = () => {
    setMicState("idle");
  };

  const handleNext = useCallback(async () => {
    if (currentIndex + 1 >= prompts.length) {
      // Session complete
      const avg = (arr: number[]) =>
        arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 70;

      const finalScores: SessionScore = {
        pronunciation: avg(scores.map((s) => s.pronunciation)),
        fluency: avg(scores.map((s) => s.fluency)),
        articulation: avg(scores.map((s) => s.articulation)),
        confidence: avg(scores.map((s) => s.confidence)),
      };

      const scoreEntries = Object.entries(finalScores) as [keyof SessionScore, number][];
      const weakest = scoreEntries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];

      // Save to Supabase
      if (sessionId) {
        const stored = localStorage.getItem("legacypp_profile");
        const profile = stored ? JSON.parse(stored) : null;
        await Promise.all([
          endSession(sessionId, scores.length, sessionStartedAt),
          saveSessionScores(sessionId, finalScores),
          saveFeedbackEvents(sessionId, allFeedback),
          profile?.childId
            ? saveRecommendation(sessionId, profile.childId, weakest, NEXT_DRILLS[weakest])
            : Promise.resolve(),
        ]).catch(console.error);
      }

      localStorage.setItem(
        "legacypp_session",
        JSON.stringify({
          scores: finalScores,
          promptsCompleted: scores.length,
          totalPrompts: prompts.length,
          feedbackEvents: allFeedback,
          weakest,
        })
      );

      const streak = parseInt(localStorage.getItem("legacypp_streak") || "0");
      const stars = parseInt(localStorage.getItem("legacypp_stars") || "0");
      localStorage.setItem("legacypp_streak", String(streak + 1));
      localStorage.setItem("legacypp_stars", String(stars + scores.length));

      await cleanup();
      router.push("/report");
    } else {
      setCurrentIndex((i) => i + 1);
      setMicState("idle");
    }
  }, [currentIndex, prompts.length, scores, allFeedback, sessionId, sessionStartedAt, router]);

  if (prompts.length === 0) return null;

  const currentPrompt = prompts[currentIndex];
  const progress = (currentIndex / prompts.length) * 100;

  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={async () => { await cleanup(); router.push("/child/home"); }}
            className="text-muted hover:text-error transition-colors p-1"
          >
            <X size={22} />
          </button>
          <span className="font-data text-sm text-muted">
            {currentIndex + 1} / {prompts.length}
          </span>
          <div className="w-6" />
        </div>

        {/* Progress dots */}
        <div className="flex gap-2 justify-center mb-8">
          {prompts.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2.5 rounded-full transition-all duration-300",
                i < currentIndex ? "bg-success w-6"
                  : i === currentIndex ? "bg-primary w-8"
                  : "bg-border w-2.5"
              )}
            />
          ))}
        </div>

        {/* Loading state */}
        {!agoraReady && (
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            <p className="text-sm font-body text-muted">Connecting Sparky…</p>
          </div>
        )}

        {/* Agent speaking indicator */}
        {agentSpeaking && (
          <div className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 mb-4 text-primary text-sm font-body">
            <Volume2 size={16} className="animate-pulse" />
            Sparky is speaking…
          </div>
        )}

        {/* Phoneme target */}
        <div className="text-center mb-2">
          <span className="inline-block bg-secondary/10 text-secondary text-xs font-data font-bold px-3 py-1 rounded-full">
            Target sound: {currentPrompt.phonemeTarget}
          </span>
        </div>

        {/* Phrase card */}
        <Card elevated className="text-center mb-6 py-10 border-2 border-primary/10">
          <div className="text-6xl mb-4">{currentPrompt.imageEmoji}</div>
          <p className="font-heading font-bold text-3xl text-text leading-tight">
            {currentPrompt.text}
          </p>
        </Card>

        {/* Processing indicator */}
        {micState === "processing" && (
          <div className="flex items-center justify-center gap-2 text-primary font-body text-sm mb-4">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            Sending to Sparky…
          </div>
        )}

        {/* Mic button */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleMicToggle}
            disabled={micState === "processing" || !agoraReady || agentSpeaking}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg active:scale-95 disabled:opacity-40",
              micState === "listening"
                ? "bg-error animate-pulse shadow-red-200"
                : "bg-primary hover:bg-primary-dark shadow-primary/30"
            )}
          >
            {micState === "listening" ? (
              <MicOff className="text-white" size={32} />
            ) : (
              <Mic className="text-white" size={32} />
            )}
          </button>

          <p className="text-xs font-body text-muted text-center">
            {!agoraReady && "Setting up your session…"}
            {agoraReady && agentSpeaking && "Wait for Sparky to finish…"}
            {agoraReady && !agentSpeaking && micState === "idle" && "Tap the mic and say the phrase!"}
            {micState === "listening" && "Listening… tap to stop"}
            {micState === "processing" && "Sparky is thinking…"}
            {micState === "done" && "Great! What next?"}
          </p>

          {micState === "done" && (
            <div className="flex gap-3 mt-2">
              <Button variant="ghost" size="md" onClick={handleRetry}>
                <RotateCcw size={16} /> Try Again
              </Button>
              <Button size="md" onClick={handleNext}>
                {currentIndex + 1 >= prompts.length ? "Finish" : "Next"}
                <SkipForward size={16} />
              </Button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-8 w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </main>
  );
}
