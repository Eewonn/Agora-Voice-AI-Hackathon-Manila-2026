"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Clock,
  Settings,
  LogOut,
  Flame,
  Target,
  BookOpen,
  Star,
  ChevronRight,
  Baby,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { getWeekHistory, getLatestSession } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type NavKey = "overview" | "progress" | "history" | "settings";

const NAV_ITEMS: { icon: React.ElementType; label: string; key: NavKey }[] = [
  { icon: LayoutDashboard, label: "Overview", key: "overview" },
  { icon: User, label: "Child Progress", key: "progress" },
  { icon: Clock, label: "Session History", key: "history" },
  { icon: Settings, label: "Settings", key: "settings" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayEntry {
  day: string;
  score: number;
  completed: boolean;
}

function buildWeekGrid(
  raw: { started_at: string; session_scores: { overall: number }[] }[]
): DayEntry[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const label = DAY_LABELS[d.getDay()];
    const dateStr = d.toISOString().split("T")[0];
    const session = raw.find((s) => s.started_at?.startsWith(dateStr));
    return {
      day: label,
      score: session?.session_scores?.[0]?.overall ?? 0,
      completed: !!session,
    };
  });
}

/* ─── Charts ────────────────────────────────────────────────── */
function DonutChart({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="8"
          />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-heading font-bold text-lg text-text">
          {value}%
        </span>
      </div>
      <span className="text-xs font-data font-bold text-muted">{label}</span>
    </div>
  );
}

function LineChart({ data }: { data: DayEntry[] }) {
  const max = 100;
  const w = 520;
  const h = 120;
  const pad = { top: 10, bottom: 24, left: 8, right: 8 };

  const points = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * (w - pad.left - pad.right),
    y: pad.top + (1 - d.score / max) * (h - pad.top - pad.bottom),
    ...d,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${h - pad.bottom} L ${
      points[0].x
    } ${h - pad.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={areaD} fill="#0EA5A6" fillOpacity="0.08" />
      <path
        d={pathD}
        fill="none"
        stroke="#0EA5A6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p) =>
        p.completed ? (
          <circle key={p.day} cx={p.x} cy={p.y} r="4" fill="#0EA5A6" />
        ) : null
      )}
      {points.map((p) => (
        <text
          key={p.day}
          x={p.x}
          y={h - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#64748B"
          fontFamily="var(--font-atkinson)"
        >
          {p.day}
        </text>
      ))}
    </svg>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-body text-text">{label}</span>
        <span className="text-sm font-heading font-bold text-text">
          {value}%
        </span>
      </div>
      <div className="h-2.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function ParentDashboardPage() {
  const router = useRouter();
  const { signOut, user } = useAuth();

  const [childName, setChildName] = useState("");
  const [parentName, setParentName] = useState("");
  const [childAge, setChildAge] = useState<number | null>(null);
  const [childEmail, setChildEmail] = useState("");
  const [weekHistory, setWeekHistory] = useState<DayEntry[]>(
    DAY_LABELS.map((d) => ({ day: d, score: 0, completed: false }))
  );
  const [recentActivity, setRecentActivity] = useState<
    { text: string; when: string; completed: boolean }[]
  >([]);
  const [stats, setStats] = useState({
    streak: 0,
    accuracy: 0,
    wordsMastered: 0,
    stars: 0,
  });
  const [latestScores, setLatestScores] = useState({
    pronunciation: 0,
    fluency: 0,
    articulation: 0,
    confidence: 0,
  });
  const [focusAreas] = useState([
    { label: "S Sound", value: 80, color: "#0EA5A6" },
    { label: "TH Sound", value: 65, color: "#F59E0B" },
    { label: "R Sound", value: 90, color: "#2563EB" },
  ]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<NavKey>("overview");

  useEffect(() => {
    const stored = localStorage.getItem("legacypp_profile");
    if (!stored) { router.replace("/"); return; }
    const profile = JSON.parse(stored);
    setChildName(profile.childName ?? "");
    setParentName(profile.parentName ?? "");
    setChildAge(profile.childAge ?? null);

    const streak = parseInt(localStorage.getItem("legacypp_streak") || "0");
    const stars = parseInt(localStorage.getItem("legacypp_stars") || "0");

    if (!profile.childId) {
      setStats({ streak, accuracy: 0, wordsMastered: 0, stars });
      setLoading(false);
      return;
    }

    Promise.all([
      getWeekHistory(profile.childId),
      getLatestSession(profile.childId),
    ])
      .then(([history, latest]) => {
        const grid = buildWeekGrid(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          history as any
        );
        setWeekHistory(grid);

        const completed = grid.filter((d) => d.completed);
        const avgAccuracy = completed.length
          ? Math.round(
              completed.reduce((a, b) => a + b.score, 0) / completed.length
            )
          : 0;

        setStats({
          streak,
          accuracy: avgAccuracy,
          wordsMastered: stars * 2,
          stars,
        });

        if (latest) {
          const scores = latest.session_scores?.[0];
          if (scores) {
            setLatestScores({
              pronunciation: scores.pronunciation ?? 0,
              fluency: scores.fluency ?? 0,
              articulation: scores.articulation ?? 0,
              confidence: scores.confidence ?? 0,
            });
            const acts = [];
            const topSound =
              scores.pronunciation > 80 ? '"S" sound' : '"R" sound';
            acts.push({
              text: `Completed ${topSound} mission`,
              when: "Today",
              completed: true,
            });
            const avgScore = Math.round(
              ((scores.pronunciation ?? 0) +
                (scores.fluency ?? 0) +
                (scores.articulation ?? 0) +
                (scores.confidence ?? 0)) /
                4
            );
            if (avgScore > 75) {
              acts.push({
                text: `Earned ${Math.floor(avgScore / 20)} stars for accuracy`,
                when: "Today",
                completed: true,
              });
            }
            acts.push({
              text: 'Mastered the word "SUN"',
              when: "2 days ago",
              completed: true,
            });
            setRecentActivity(acts);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Grab email from auth context (set after mount)
    if (user?.email) setChildEmail(user.email);
  }, [router, user]);

  const handleSignOut = async () => {
    await signOut();
    localStorage.clear();
    router.replace("/auth");
  };

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-56 bg-surface shadow-sm flex flex-col py-6 px-4 shrink-0">
        <div className="mb-2 px-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white text-sm font-heading font-bold">
              L
            </div>
            <div>
              <p className="font-heading font-bold text-text text-xs leading-tight">
                Legacy++
              </p>
              <p className="text-muted text-xs font-body">
                Voice AI Speech Therapy
              </p>
            </div>
          </div>
        </div>

        {/* Parent info */}
        <div className="flex items-center gap-2 bg-bg rounded-xl px-3 py-2 mb-6 mt-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-heading font-bold text-sm">
            {parentName?.[0]?.toUpperCase() ?? "P"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-body font-semibold text-text truncate">
              {parentName || "Parent"}
            </p>
            <p className="text-xs font-body text-muted">{childName}&apos;s Parent</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveNav(item.key)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-colors text-left",
                activeNav === item.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-bg hover:text-text"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pt-4 border-t border-border space-y-1">
          <button
            onClick={() => router.push("/child/home")}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-body font-medium text-muted hover:bg-bg hover:text-primary transition-colors"
          >
            <Baby size={16} />
            Child View
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium text-muted hover:text-error hover:bg-error/5 transition-colors"
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto px-8 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeNav === "overview" && (
              <OverviewSection
                stats={stats}
                weekHistory={weekHistory}
                focusAreas={focusAreas}
                recentActivity={recentActivity}
                childName={childName}
                onNavigate={(p) => router.push(p)}
              />
            )}
            {activeNav === "progress" && (
              <ProgressSection
                latestScores={latestScores}
                focusAreas={focusAreas}
                childName={childName}
                stats={stats}
              />
            )}
            {activeNav === "history" && (
              <HistorySection
                weekHistory={weekHistory}
                recentActivity={recentActivity}
                onNavigate={(p) => router.push(p)}
              />
            )}
            {activeNav === "settings" && (
              <SettingsSection
                parentName={parentName}
                childName={childName}
                childAge={childAge}
                email={childEmail || user?.email || ""}
                onSignOut={handleSignOut}
                onNavigate={(p) => router.push(p)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Overview Section ──────────────────────────────────────── */
function OverviewSection({
  stats,
  weekHistory,
  focusAreas,
  recentActivity,
  childName,
  onNavigate,
}: {
  stats: { streak: number; accuracy: number; wordsMastered: number; stars: number };
  weekHistory: DayEntry[];
  focusAreas: { label: string; value: number; color: string }[];
  recentActivity: { text: string; when: string; completed: boolean }[];
  childName: string;
  onNavigate: (p: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl text-text">
          Parent Dashboard
        </h1>
        <Button size="md" onClick={() => onNavigate("/practice")}>
          <Mic size={16} /> Start Practice
        </Button>
      </div>

      {/* Welcome banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-4 mb-6 flex items-center gap-4">
        <div className="text-4xl">🦕</div>
        <div>
          <p className="font-heading font-semibold text-text">
            {childName}&apos;s progress is looking great!
          </p>
          <p className="text-sm font-body text-muted">
            Keep up the daily practice to see continued improvement.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            icon: <Flame size={20} className="text-warning" />,
            label: "Weekly Streak",
            value: `${stats.streak} Days`,
            bg: "bg-warning/10",
          },
          {
            icon: <Target size={20} className="text-success" />,
            label: "Avg Accuracy",
            value: `${stats.accuracy}%`,
            bg: "bg-success/10",
          },
          {
            icon: <BookOpen size={20} className="text-secondary" />,
            label: "Words Mastered",
            value: String(stats.wordsMastered),
            bg: "bg-secondary/10",
          },
          {
            icon: <Star size={20} className="text-accent" />,
            label: "Stars Earned",
            value: String(stats.stars),
            bg: "bg-accent/10",
          },
        ].map((s) => (
          <Card
            key={s.label}
            className={cn("flex items-center gap-3 py-4", s.bg, "border-0")}
          >
            {s.icon}
            <div>
              <p className="text-xs font-body text-muted">{s.label}</p>
              <p className="font-heading font-bold text-xl text-text">
                {s.value}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Weekly progress chart */}
        <Card elevated className="col-span-2">
          <h2 className="font-heading font-semibold text-base text-text mb-4">
            Weekly Progress
          </h2>
          <LineChart data={weekHistory} />
        </Card>

        {/* Focus areas */}
        <Card elevated>
          <h2 className="font-heading font-semibold text-base text-text mb-4">
            Focus Areas
          </h2>
          <div className="flex justify-around items-center h-32">
            {focusAreas.map((f) => (
              <DonutChart
                key={f.label}
                value={f.value}
                color={f.color}
                label={f.label}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card elevated>
        <h2 className="font-heading font-semibold text-base text-text mb-3">
          Recent Activity
        </h2>
        {recentActivity.length === 0 ? (
          <p className="text-muted font-body text-sm">
            No sessions yet. Start practicing!
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recentActivity.map((a, i) => (
              <div
                key={i}
                className="flex justify-between items-center py-3"
              >
                <div className="flex items-center gap-2">
                  {a.completed ? (
                    <CheckCircle2 size={16} className="text-success shrink-0" />
                  ) : (
                    <Circle size={16} className="text-border shrink-0" />
                  )}
                  <span className="text-sm font-body text-text">{a.text}</span>
                </div>
                <span className="text-xs font-data text-muted">{a.when}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ─── Progress Section ──────────────────────────────────────── */
function ProgressSection({
  latestScores,
  focusAreas,
  childName,
  stats,
}: {
  latestScores: { pronunciation: number; fluency: number; articulation: number; confidence: number };
  focusAreas: { label: string; value: number; color: string }[];
  childName: string;
  stats: { streak: number; accuracy: number; wordsMastered: number; stars: number };
}) {
  const hasData = Object.values(latestScores).some((v) => v > 0);
  const avg = hasData
    ? Math.round(
        (latestScores.pronunciation +
          latestScores.fluency +
          latestScores.articulation +
          latestScores.confidence) /
          4
      )
    : 0;

  return (
    <>
      <h1 className="font-heading font-bold text-2xl text-text mb-6">
        {childName}&apos;s Progress
      </h1>

      {!hasData ? (
        <Card elevated className="text-center py-16">
          <div className="text-5xl mb-4">📊</div>
          <p className="font-heading font-semibold text-text mb-2">
            No session data yet
          </p>
          <p className="text-muted font-body text-sm">
            Complete a practice session to see detailed scores here.
          </p>
        </Card>
      ) : (
        <>
          {/* Overall score */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card elevated className="col-span-1 flex flex-col items-center justify-center py-8">
              <p className="text-sm font-body text-muted mb-2">
                Overall Score
              </p>
              <div className="relative w-28 h-28">
                <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="8"
                  />
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    fill="none"
                    stroke="#0EA5A6"
                    strokeWidth="8"
                    strokeDasharray={`${(avg / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-heading font-bold text-2xl text-primary">
                  {avg}%
                </span>
              </div>
              <p className="text-xs font-data text-muted mt-2">Last Session</p>
            </Card>

            <Card elevated className="col-span-2">
              <h2 className="font-heading font-semibold text-base text-text mb-4">
                Skill Breakdown
              </h2>
              <div className="space-y-4">
                <ScoreBar
                  label="Clarity (Pronunciation)"
                  value={latestScores.pronunciation}
                  color="#0EA5A6"
                />
                <ScoreBar
                  label="Smoothness (Fluency)"
                  value={latestScores.fluency}
                  color="#16A34A"
                />
                <ScoreBar
                  label="Articulation"
                  value={latestScores.articulation}
                  color="#2563EB"
                />
                <ScoreBar
                  label="Confidence"
                  value={latestScores.confidence}
                  color="#F59E0B"
                />
              </div>
            </Card>
          </div>

          {/* Phoneme focus areas */}
          <Card elevated className="mb-6">
            <h2 className="font-heading font-semibold text-base text-text mb-5">
              Sound Focus Areas
            </h2>
            <div className="flex justify-around items-center">
              {focusAreas.map((f) => (
                <DonutChart
                  key={f.label}
                  value={f.value}
                  color={f.color}
                  label={f.label}
                />
              ))}
            </div>
          </Card>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Stars Earned", value: stats.stars, emoji: "⭐" },
              { label: "Words Mastered", value: stats.wordsMastered, emoji: "📚" },
              { label: "Day Streak", value: stats.streak, emoji: "🔥" },
            ].map((s) => (
              <Card key={s.label} elevated className="text-center py-5">
                <div className="text-3xl mb-2">{s.emoji}</div>
                <div className="font-heading font-bold text-2xl text-text">
                  {s.value}
                </div>
                <div className="text-xs font-body text-muted mt-1">
                  {s.label}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ─── History Section ───────────────────────────────────────── */
function HistorySection({
  weekHistory,
  recentActivity,
  onNavigate,
}: {
  weekHistory: DayEntry[];
  recentActivity: { text: string; when: string; completed: boolean }[];
  onNavigate: (p: string) => void;
}) {
  const completedDays = weekHistory.filter((d) => d.completed);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl text-text">
          Session History
        </h1>
        <Button size="md" onClick={() => onNavigate("/practice")}>
          <ChevronRight size={16} /> New Session
        </Button>
      </div>

      {/* This week */}
      <Card elevated className="mb-6">
        <h2 className="font-heading font-semibold text-base text-text mb-4">
          This Week
        </h2>
        <div className="flex justify-between gap-2">
          {weekHistory.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-heading font-bold text-sm",
                  d.completed
                    ? "bg-primary text-white shadow-sm"
                    : "bg-bg text-muted"
                )}
              >
                {d.completed ? `${d.score}` : "—"}
              </div>
              <span className="text-xs font-data text-muted">{d.day}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <span className="text-sm font-body text-muted">
            {completedDays.length} of 7 days practiced
          </span>
          {completedDays.length > 0 && (
            <span className="text-sm font-heading font-bold text-primary">
              Avg{" "}
              {Math.round(
                completedDays.reduce((a, b) => a + b.score, 0) /
                  completedDays.length
              )}
              %
            </span>
          )}
        </div>
      </Card>

      {/* Recent milestones */}
      <Card elevated>
        <h2 className="font-heading font-semibold text-base text-text mb-4">
          Recent Milestones
        </h2>
        {recentActivity.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-muted font-body text-sm">
              No activity yet. Complete a practice session to see milestones!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-bg rounded-xl p-3"
              >
                <CheckCircle2
                  size={18}
                  className="text-success mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body text-text">{a.text}</p>
                  <p className="text-xs font-data text-muted mt-0.5">
                    {a.when}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ─── Settings Section ──────────────────────────────────────── */
function SettingsSection({
  parentName,
  childName,
  childAge,
  email,
  onSignOut,
  onNavigate,
}: {
  parentName: string;
  childName: string;
  childAge: number | null;
  email: string;
  onSignOut: () => void;
  onNavigate: (p: string) => void;
}) {
  return (
    <>
      <h1 className="font-heading font-bold text-2xl text-text mb-6">
        Settings
      </h1>

      {/* Parent account */}
      <Card elevated className="mb-4">
        <h2 className="font-heading font-semibold text-base text-text mb-4">
          Parent Account
        </h2>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-lg">
            {parentName?.[0]?.toUpperCase() ?? "P"}
          </div>
          <div>
            <p className="font-body font-semibold text-text">
              {parentName || "Parent"}
            </p>
            <p className="text-muted text-sm font-body">{email}</p>
          </div>
        </div>
      </Card>

      {/* Child profile */}
      <Card elevated className="mb-4">
        <h2 className="font-heading font-semibold text-base text-text mb-4">
          Child Profile
        </h2>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl">
            🦕
          </div>
          <div>
            <p className="font-body font-semibold text-text">{childName}</p>
            {childAge && (
              <p className="text-muted text-sm font-body">Age {childAge}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => onNavigate("/child/home")}
          className="w-full flex items-center justify-center gap-2 border border-primary/30 text-primary px-4 py-2.5 rounded-xl font-body font-semibold text-sm hover:bg-primary/5 transition-colors"
        >
          Go to Child View <ChevronRight size={16} />
        </button>
      </Card>

      {/* Privacy */}
      <Card elevated className="mb-4 border border-success/20 bg-success/5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="text-success mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-heading font-semibold text-text text-sm mb-1">
              Privacy &amp; Data
            </p>
            <ul className="space-y-1">
              {[
                "Audio is processed in real-time only — never stored",
                "All data is encrypted in transit and at rest",
                "You can request data deletion at any time",
                "No data is shared with third parties",
              ].map((item) => (
                <li key={item} className="text-xs font-body text-muted">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* Sign out */}
      <Card elevated className="border border-error/20">
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 text-error font-body font-semibold text-sm py-1 hover:opacity-80 transition-opacity"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </Card>
    </>
  );
}
