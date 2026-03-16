"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Star, Play, Lock, Home, BookOpen, Trophy, User, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  childName: string;
  childAge: number;
  parentName: string;
}

type Tab = "home" | "lessons" | "rewards" | "profile";

const LEVELS = [
  { id: 1, label: "R Sounds",     emoji: "🦁", color: "#0EA5A6", shadow: "#0b8a8b", bg: "#E0F7F7", active: true,  desc: "Practice the R sound",      examples: ["red","rabbit","run"] },
  { id: 2, label: "S Sounds",     emoji: "🐍", color: "#F97316", shadow: "#ea580c", bg: "#FFF0E8", active: false, desc: "Master the S sound",        examples: ["sun","sea","sing"] },
  { id: 3, label: "L & SH",       emoji: "🌊", color: "#F59E0B", shadow: "#d97706", bg: "#FFFBE8", active: false, desc: "L and SH together",         examples: ["shell","she","like"] },
  { id: 4, label: "TH Sounds",    emoji: "🌸", color: "#22C55E", shadow: "#16a34a", bg: "#E8FFF0", active: false, desc: "The tricky TH sound",       examples: ["three","think","this"] },
  { id: 5, label: "Mix & Master", emoji: "⭐", color: "#6366F1", shadow: "#4f46e5", bg: "#F0EEFF", active: false, desc: "Combine everything!",       examples: ["mix","all","sounds"] },
];

const BADGES = [
  { id: 1, emoji: "🎙️", label: "First Practice", desc: "Finish your first session",  minStars: 1 },
  { id: 2, emoji: "🔥", label: "3-Day Streak",   desc: "Practice 3 days in a row",   minStreak: 3 },
  { id: 3, emoji: "⭐", label: "Star Collector", desc: "Earn 10 stars total",          minStars: 10 },
  { id: 4, emoji: "🏆", label: "Level Up!",      desc: "Complete Level 1",            minStars: 5 },
  { id: 5, emoji: "🎯", label: "Sharp Sounds",   desc: "Score 90%+ in a session",     minStars: 15 },
  { id: 6, emoji: "💪", label: "Persistence",    desc: "Practice 5 days in a row",    minStreak: 5 },
];

const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
  { key: "home",    icon: Home,     label: "Home"    },
  { key: "lessons", icon: BookOpen, label: "Lessons" },
  { key: "rewards", icon: Trophy,   label: "Rewards" },
  { key: "profile", icon: User,     label: "Profile" },
];

export default function ChildHomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [streak, setStreak]     = useState(0);
  const [stars,  setStars]      = useState(0);
  const [tab,    setTab]        = useState<Tab>("home");

  useEffect(() => {
    const raw = localStorage.getItem("legacypp_profile");
    if (!raw) { router.replace("/"); return; }
    setProfile(JSON.parse(raw));
    setStreak(parseInt(localStorage.getItem("legacypp_streak") || "0"));
    setStars(parseInt(localStorage.getItem("legacypp_stars")  || "0"));
  }, [router]);

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* ── Top bar ────────────────────────────────────────── */}
      <header className="bg-surface border-b-2 border-border px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-[0_3px_0_#0b8a8b]">
            <span className="text-white font-heading font-extrabold text-base">L</span>
          </div>
          <span className="font-heading font-extrabold text-lg text-text">
            Legacy<span className="text-primary">++</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-warning/15 border-2 border-warning/30 text-warning px-3 py-1.5 rounded-xl">
            <Flame size={16} className="fill-warning" />
            <span className="font-heading font-extrabold text-sm">{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-accent/15 border-2 border-accent/30 text-accent px-3 py-1.5 rounded-xl">
            <Star size={16} className="fill-accent" />
            <span className="font-heading font-extrabold text-sm">{stars}</span>
          </div>
        </div>
      </header>

      {/* ── Main scrollable content ─────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-24 px-5 pt-6">
        {tab === "home"    && <HomeTab    name={profile.childName} onStart={() => router.push("/practice")} />}
        {tab === "lessons" && <LessonsTab onStart={() => router.push("/practice")} />}
        {tab === "rewards" && <RewardsTab streak={streak} stars={stars} />}
        {tab === "profile" && <ProfileTab profile={profile} onParent={() => router.push("/parent/dashboard")} />}
      </main>

      {/* ── Bottom tab bar ──────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t-2 border-border flex z-50">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors",
              tab === t.key ? "text-primary" : "text-muted hover:text-text"
            )}
          >
            <t.icon
              size={22}
              strokeWidth={tab === t.key ? 2.5 : 1.8}
              className={tab === t.key ? "text-primary" : "text-muted"}
            />
            <span className={cn(
              "text-[11px] font-heading font-bold leading-none",
              tab === t.key ? "text-primary" : "text-muted"
            )}>
              {t.label}
            </span>
            {tab === t.key && (
              <span className="absolute bottom-0 w-10 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ─── Home Tab ──────────────────────────────────────────────── */
function HomeTab({ name, onStart }: { name: string; onStart: () => void }) {
  return (
    <div className="flex flex-col items-center max-w-lg mx-auto">

      {/* Greeting */}
      <div className="text-center mb-8 animate-pop-up">
        <div className="text-8xl mb-3 animate-float select-none">🦕</div>
        <h1 className="font-heading font-extrabold text-3xl text-text">
          Hi, {name}! 👋
        </h1>
        <p className="text-muted font-body mt-1">Ready for today&apos;s speech mission?</p>
      </div>

      {/* Level path */}
      <div className="w-full mb-10">
        <h2 className="font-heading font-bold text-base text-muted uppercase tracking-wider mb-5 text-center">
          Your Journey
        </h2>

        {/* Vertical staggered path */}
        <div className="relative flex flex-col items-center gap-3">
          {/* Connecting line */}
          <div className="absolute left-1/2 top-10 bottom-10 w-1 -translate-x-1/2 bg-border rounded-full z-0" />

          {LEVELS.map((level, i) => {
            const isLeft  = i % 2 === 1;
            return (
              <div
                key={level.id}
                className={cn(
                  "relative z-10 flex items-center gap-4 w-full",
                  isLeft ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Node */}
                {level.active ? (
                  <button
                    onClick={onStart}
                    className="btn-3d shrink-0 w-20 h-20 rounded-3xl flex flex-col items-center justify-center gap-1 animate-bounce-in"
                    style={{
                      backgroundColor: level.color,
                      boxShadow: `0 5px 0 ${level.shadow}`,
                    }}
                  >
                    <span className="text-3xl select-none">{level.emoji}</span>
                    <Play className="text-white fill-white" size={14} />
                  </button>
                ) : (
                  <div
                    className="shrink-0 w-16 h-16 rounded-3xl flex flex-col items-center justify-center gap-1 border-3 border-border bg-surface opacity-60"
                  >
                    <span className="text-2xl select-none grayscale">{level.emoji}</span>
                    <Lock size={12} className="text-muted" />
                  </div>
                )}

                {/* Label card */}
                <div
                  className={cn(
                    "flex-1 rounded-2xl border-2 px-4 py-3",
                    level.active
                      ? "border-2 shadow-sm"
                      : "border-border bg-surface opacity-60"
                  )}
                  style={level.active ? {
                    backgroundColor: level.bg,
                    borderColor: level.color + "55",
                  } : {}}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-data font-extrabold uppercase tracking-wide"
                      style={level.active ? { color: level.color } : { color: "#94a3b8" }}
                    >
                      Level {level.id}
                    </span>
                    {level.active && (
                      <span
                        className="text-[10px] font-heading font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: level.color }}
                      >
                        ACTIVE
                      </span>
                    )}
                    {!level.active && (
                      <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded-full bg-border text-muted">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <p className="font-heading font-extrabold text-text text-base leading-tight mt-0.5">
                    {level.label}
                  </p>
                  <p className="text-xs font-body text-muted mt-0.5">{level.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onStart}
        className="btn-3d w-full max-w-sm bg-primary text-white rounded-2xl py-5 font-heading font-extrabold text-xl shadow-[0_5px_0_#0b8a8b] flex items-center justify-center gap-3"
      >
        <Play className="fill-white text-white" size={22} />
        Start Today&apos;s Lesson!
      </button>
    </div>
  );
}

/* ─── Lessons Tab ───────────────────────────────────────────── */
function LessonsTab({ onStart }: { onStart: () => void }) {
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-heading font-extrabold text-2xl text-text mb-2">All Lessons</h2>
      <p className="text-muted font-body text-sm mb-6">Complete each level to unlock the next one!</p>

      <div className="space-y-3">
        {LEVELS.map((level, i) => (
          <div
            key={level.id}
            className={cn(
              "rounded-3xl border-2 p-4 flex items-center gap-4 transition-all",
              level.active
                ? "border-2 shadow-md"
                : "border-border bg-surface/70 opacity-70"
            )}
            style={level.active ? { borderColor: level.color + "66", backgroundColor: level.bg } : {}}
          >
            {/* Icon */}
            <div
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 border-2",
                level.active ? "border-2" : "border-border bg-bg grayscale"
              )}
              style={level.active ? { borderColor: level.color + "55", backgroundColor: level.color + "22" } : {}}
            >
              {level.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-data font-extrabold uppercase tracking-wide"
                  style={{ color: level.active ? level.color : "#94a3b8" }}>
                  Level {level.id}
                </span>
                {!level.active && <Lock size={11} className="text-muted" />}
              </div>
              <p className="font-heading font-extrabold text-text text-base">{level.label}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {level.examples.map((ex) => (
                  <span key={ex}
                    className="text-[11px] font-body px-2 py-0.5 rounded-full border"
                    style={level.active
                      ? { color: level.color, borderColor: level.color + "44", backgroundColor: level.color + "11" }
                      : { color: "#94a3b8", borderColor: "#cbd5e1" }}
                  >
                    &quot;{ex}&quot;
                  </span>
                ))}
              </div>
            </div>

            {level.active ? (
              <button
                onClick={onStart}
                className="btn-3d shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: level.color, boxShadow: `0 3px 0 ${level.shadow}` }}
              >
                <Play className="text-white fill-white ml-0.5" size={20} />
              </button>
            ) : (
              <div className="shrink-0 w-10 h-10 rounded-2xl bg-border/50 flex items-center justify-center">
                <span className="font-heading font-extrabold text-muted text-sm">{i + 1}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Rewards Tab ───────────────────────────────────────────── */
function RewardsTab({ streak, stars }: { streak: number; stars: number }) {
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-heading font-extrabold text-2xl text-text mb-6">My Rewards</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-warning/10 border-2 border-warning/30 rounded-3xl p-5 text-center">
          <div className="text-5xl mb-2 animate-float select-none">🔥</div>
          <div className="font-heading font-extrabold text-4xl text-warning">{streak}</div>
          <div className="font-body text-sm text-muted mt-1">Day Streak</div>
        </div>
        <div className="bg-accent/10 border-2 border-accent/30 rounded-3xl p-5 text-center">
          <div className="text-5xl mb-2 animate-float select-none" style={{ animationDelay: "0.3s" }}>⭐</div>
          <div className="font-heading font-extrabold text-4xl text-accent">{stars}</div>
          <div className="font-body text-sm text-muted mt-1">Stars Earned</div>
        </div>
      </div>

      {/* Badges */}
      <h3 className="font-heading font-extrabold text-lg text-text mb-4">Badges</h3>
      <div className="grid grid-cols-2 gap-3">
        {BADGES.map((badge) => {
          const earned =
            ("minStars"  in badge && stars  >= (badge.minStars  ?? 0)) ||
            ("minStreak" in badge && streak >= (badge.minStreak ?? 0));
          return (
            <div
              key={badge.id}
              className={cn(
                "rounded-3xl border-2 p-4 flex items-center gap-3 transition-all",
                earned
                  ? "border-accent/40 bg-accent/8 shadow-sm"
                  : "border-border bg-surface opacity-50 grayscale"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0",
                earned ? "bg-accent/15" : "bg-bg"
              )}>
                {badge.emoji}
              </div>
              <div className="min-w-0">
                <p className="font-heading font-extrabold text-sm text-text leading-tight">
                  {badge.label}
                </p>
                <p className="font-body text-xs text-muted mt-0.5 leading-tight">
                  {badge.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Profile Tab ───────────────────────────────────────────── */
function ProfileTab({
  profile,
  onParent,
}: {
  profile: Profile;
  onParent: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-heading font-extrabold text-2xl text-text mb-6">My Profile</h2>

      {/* Avatar card */}
      <div className="bg-primary/8 border-2 border-primary/25 rounded-3xl p-6 flex items-center gap-5 mb-4">
        <div className="w-20 h-20 bg-primary/15 rounded-3xl flex items-center justify-center text-5xl border-2 border-primary/25 select-none">
          🦕
        </div>
        <div>
          <p className="font-heading font-extrabold text-2xl text-text">{profile.childName}</p>
          <p className="font-body text-muted mt-0.5">Age {profile.childAge}</p>
          {profile.parentName && (
            <p className="font-body text-sm text-muted mt-1">
              👨‍👩‍👧 {profile.parentName}&apos;s child
            </p>
          )}
        </div>
      </div>

      {/* Parent Dashboard CTA */}
      <button
        onClick={onParent}
        className="btn-3d w-full bg-secondary text-white rounded-2xl py-4 font-heading font-extrabold text-base shadow-[0_4px_0_#4f46e5] flex items-center justify-center gap-2"
      >
        <Users size={20} />
        View Parent Dashboard
        <ChevronRight size={18} />
      </button>

      <p className="text-center text-xs font-body text-muted mt-3">
        Ask a parent to open the dashboard for you
      </p>
    </div>
  );
}
