import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { parseLocalDate } from "@/lib/dates";
import { useOptions } from "@/hooks/use-options";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInCalendarDays } from "date-fns";
import { AlertTriangle, Clock, Calendar, CalendarClock } from "lucide-react";

interface StageOption {
  id: number;
  label: string;
}

interface ScheduledBatch {
  id: number;
  sampleCode: string;
  subcode: string;
  varietyLabel: string | null;
  strainLabel: string | null;
  stage: string;
  location: string;
  computedQuantity: string;
  contaminationAlert: boolean;
  computedDueDate: string;
  dueDateOverride: string | null;
  notes: string | null;
  isOverdue: boolean;
}

function urgencyGroup(daysUntil: number): "overdue" | "today" | "thisWeek" | "upcoming" {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil <= 7) return "thisWeek";
  return "upcoming";
}

function ScheduleCard({ batch, today }: { batch: ScheduledBatch; today: Date }) {
  const dueDate = parseLocalDate(batch.computedDueDate);
  const days = differenceInCalendarDays(dueDate, today);
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
    <Link href={`/batches/${batch.id}`}>
      <div
        className={`bg-card border border-border border-l-4 ${borderClass} rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:bg-muted/30`}
        data-testid={`schedule-card-${batch.sampleCode}-${batch.subcode}`}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-primary text-sm">
              {batch.sampleCode}-{batch.subcode}
            </span>
            <Badge variant="outline" className="capitalize text-xs">
              {batch.stage}
            </Badge>
            {batch.contaminationAlert && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                Alert
              </Badge>
            )}
            {batch.dueDateOverride && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1">Override</span>
            )}
          </div>

          <div className="text-sm text-foreground font-medium">
            {batch.varietyLabel ?? "—"}
            {batch.strainLabel && <span className="text-muted-foreground"> · {batch.strainLabel}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{batch.location}</span>
            <span>{batch.computedQuantity} vessel{batch.computedQuantity !== "1" ? "s" : ""}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-medium text-foreground">{format(dueDate, "MMM d, yyyy")}</div>
          <div className={`text-xs ${daysColor}`}>{daysLabel}</div>
        </div>
      </div>
    </Link>
  );
}

function BucketSection({
  label,
  sublabel,
  icon,
  items,
  today,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  items: ScheduledBatch[];
  today: Date;
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
        {items.map((b) => (
          <ScheduleCard key={b.id} batch={b} today={today} />
        ))}
      </div>
    </section>
  );
}

export default function Schedule() {
  const [stageFilter, setStageFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const { data: scheduled, isLoading } = useQuery({
    queryKey: ["schedule", { stage: stageFilter, location: locationFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (locationFilter !== "all") params.set("location", locationFilter);
      return apiFetch<ScheduledBatch[]>(`/api/schedule?${params}`);
    },
  });
  const { data: stageOptions } = useOptions("stage");
  const { data: locationOptions } = useOptions("location");
  const stages = useMemo(() => (stageOptions ?? []).map((s: StageOption) => s.label), [stageOptions]);
  const locations = useMemo(() => (locationOptions ?? []).map((s: StageOption) => s.label), [locationOptions]);

  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00"), []);

  const buckets = useMemo(() => {
    const overdue: ScheduledBatch[] = [];
    const dueToday: ScheduledBatch[] = [];
    const thisWeek: ScheduledBatch[] = [];
    const upcoming: ScheduledBatch[] = [];
    for (const b of scheduled ?? []) {
      const days = differenceInCalendarDays(parseLocalDate(b.computedDueDate), today);
      const g = urgencyGroup(days);
      if (g === "overdue") overdue.push(b);
      else if (g === "today") dueToday.push(b);
      else if (g === "thisWeek") thisWeek.push(b);
      else upcoming.push(b);
    }
    return { overdue, dueToday, thisWeek, upcoming };
  }, [scheduled, today]);

  const total = scheduled?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground mt-1">Batches by computed due date — subcultures, stage transitions, and storage renewals.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-lg border">
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-schedule-stage-filter">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage} className="capitalize">
                {stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-schedule-location-filter">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto self-center">
          {total} batch{total !== 1 ? "es" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              {[1, 2].map((j) => (
                <Skeleton key={j} className="h-24 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nothing scheduled</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No batch matching these filters has a computed due date yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <BucketSection
            label="Overdue"
            sublabel="Past their due date — act now"
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            items={buckets.overdue}
            today={today}
          />
          <BucketSection
            label="Today"
            sublabel={format(today, "EEEE, MMMM d")}
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            items={buckets.dueToday}
            today={today}
          />
          <BucketSection
            label="This week"
            sublabel="Next 7 days"
            icon={<CalendarClock className="h-4 w-4 text-yellow-500" />}
            items={buckets.thisWeek}
            today={today}
          />
          <BucketSection
            label="Upcoming"
            sublabel="Beyond the next 7 days"
            icon={<Calendar className="h-4 w-4 text-primary" />}
            items={buckets.upcoming}
            today={today}
          />
        </div>
      )}
    </div>
  );
}
