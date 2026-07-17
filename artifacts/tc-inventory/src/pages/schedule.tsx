import { useGetSchedule, getGetScheduleQueryKey, getListSamplesQueryKey, useUpdateSample } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isThisWeek, parseISO } from "date-fns";
import { AlertTriangle, Clock, CheckCircle2, Calendar, ArrowRight, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const stageColors: Record<string, string> = {
  initiation: "bg-purple-100 text-purple-800",
  multiplication: "bg-teal-100 text-teal-800",
  rooting: "bg-amber-100 text-amber-800",
  acclimatization: "bg-emerald-100 text-emerald-800",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  contaminated: "bg-red-100 text-red-800",
  discarded: "bg-gray-100 text-gray-800",
  archived: "bg-blue-100 text-blue-800",
};

type Bucket = {
  label: string;
  sublabel: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  items: ScheduledSample[];
};

function urgencyGroup(daysUntil: number): "overdue" | "today" | "thisWeek" | "upcoming" {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil <= 7) return "thisWeek";
  return "upcoming";
}

interface ScheduledSample {
  id: number;
  sampleCode: string;
  cultivar: string;
  stage: string;
  status: string;
  quantity: number;
  location: string;
  mediaType?: string | null;
  nextActionDate: string;
  nextAction?: string | null;
  daysUntilAction: number;
}

function ActionCard({
  sample,
  onMarkDone,
  isPending,
}: {
  sample: ScheduledSample;
  onMarkDone: (id: number) => void;
  isPending: boolean;
}) {
  const days = sample.daysUntilAction;
  const group = urgencyGroup(days);

  const borderClass =
    group === "overdue"
      ? "border-l-red-500"
      : group === "today"
        ? "border-l-amber-500"
        : group === "thisWeek"
          ? "border-l-yellow-400"
          : "border-l-primary";

  const daysLabel =
    days < 0
      ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`
      : days === 0
        ? "Due today"
        : `${days} day${days !== 1 ? "s" : ""} remaining`;

  const daysColor =
    days < 0
      ? "text-red-600 font-semibold"
      : days === 0
        ? "text-amber-600 font-semibold"
        : days <= 7
          ? "text-yellow-600"
          : "text-muted-foreground";

  return (
    <div
      className={`bg-card border border-border border-l-4 ${borderClass} rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4`}
      data-testid={`schedule-card-${sample.id}`}
    >
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/samples/${sample.id}`}>
            <span className="font-mono font-semibold text-primary hover:underline cursor-pointer text-sm">
              {sample.sampleCode}
            </span>
          </Link>
          <Badge variant="outline" className={`capitalize border-0 text-xs ${stageColors[sample.stage] ?? ""}`}>
            {sample.stage}
          </Badge>
          <Badge variant="outline" className={`capitalize border-0 text-xs ${statusColors[sample.status] ?? ""}`}>
            {sample.status}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm text-foreground font-medium">{sample.cultivar}</span>
        </div>

        {sample.nextAction && (
          <div className="flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium">{sample.nextAction}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{sample.location}</span>
          {sample.mediaType && <span>{sample.mediaType}</span>}
          <span>{sample.quantity} vessel{sample.quantity !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">
            {format(parseISO(sample.nextActionDate), "MMM d, yyyy")}
          </div>
          <div className={`text-xs ${daysColor}`}>{daysLabel}</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/transfers/new?fromSampleId=${sample.id}`}>
            <Button variant="outline" size="sm" data-testid={`button-transfer-${sample.id}`}>
              Transfer
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onMarkDone(sample.id)}
            disabled={isPending}
            data-testid={`button-done-${sample.id}`}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function BucketSection({
  label,
  sublabel,
  icon,
  items,
  onMarkDone,
  pendingId,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  items: ScheduledSample[];
  onMarkDone: (id: number) => void;
  pendingId: number | null;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        {icon}
        <div>
          <h2 className="text-base font-semibold leading-none">{label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        </div>
        <span className="ml-auto text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((s) => (
          <ActionCard
            key={s.id}
            sample={s}
            onMarkDone={onMarkDone}
            isPending={pendingId === s.id}
          />
        ))}
      </div>
    </section>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSample = useUpdateSample();

  const { data: scheduled, isLoading } = useGetSchedule(
    { days: 60 },
    { query: { queryKey: getGetScheduleQueryKey({ days: 60 }) } },
  );

  function handleMarkDone(id: number) {
    updateSample.mutate(
      { id, data: { nextActionDate: undefined, nextAction: undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSamplesQueryKey() });
          toast({ title: "Action cleared", description: "Next action removed from schedule." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to clear action.", variant: "destructive" });
        },
      },
    );
  }

  const pendingId = updateSample.isPending ? (updateSample.variables as { id: number })?.id ?? null : null;

  const overdue: ScheduledSample[] = [];
  const today: ScheduledSample[] = [];
  const thisWeek: ScheduledSample[] = [];
  const upcoming: ScheduledSample[] = [];

  if (scheduled) {
    for (const s of scheduled as ScheduledSample[]) {
      const g = urgencyGroup(s.daysUntilAction);
      if (g === "overdue") overdue.push(s);
      else if (g === "today") today.push(s);
      else if (g === "thisWeek") thisWeek.push(s);
      else upcoming.push(s);
    }
  }

  const total = (scheduled?.length ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Action Schedule</h1>
        <p className="text-muted-foreground mt-1">
          Upcoming subcultures, stage transitions, and long-term storage transfers — next 60 days
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              {[1, 2].map((j) => <Skeleton key={j} className="h-24 w-full" />)}
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No actions scheduled</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Open a sample and set a next action date to see it here.
          </p>
          <Link href="/samples">
            <Button className="mt-6">Go to Samples</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <BucketSection
            label="Overdue"
            sublabel="Past their scheduled date — act now"
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            items={overdue}
            onMarkDone={handleMarkDone}
            pendingId={pendingId}
          />
          <BucketSection
            label="Today"
            sublabel={format(new Date(), "EEEE, MMMM d")}
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            items={today}
            onMarkDone={handleMarkDone}
            pendingId={pendingId}
          />
          <BucketSection
            label="This Week"
            sublabel="Next 7 days"
            icon={<Calendar className="h-4 w-4 text-yellow-500" />}
            items={thisWeek}
            onMarkDone={handleMarkDone}
            pendingId={pendingId}
          />
          <BucketSection
            label="Upcoming"
            sublabel="Within the next 60 days"
            icon={<Calendar className="h-4 w-4 text-primary" />}
            items={upcoming}
            onMarkDone={handleMarkDone}
            pendingId={pendingId}
          />
        </div>
      )}
    </div>
  );
}
