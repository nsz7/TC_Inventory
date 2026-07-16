import { useListSamples, getListSamplesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const STAGE_COLORS: Record<string, string> = {
  initiation: "#a78bfa",
  multiplication: "#2dd4bf",
  rooting: "#fbbf24",
  acclimatization: "#34d399",
  "long-term storage": "#38bdf8",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  contaminated: "#ef4444",
  archived: "#3b82f6",
  discarded: "#9ca3af",
};

export default function Analytics() {
  const { data: allSamples, isLoading } = useListSamples(
    {},
    { query: { queryKey: getListSamplesQueryKey() } },
  );

  const stats = useMemo(() => {
    if (!allSamples) return null;

    // Vessels by stage (active only)
    const vesselsByStage: Record<string, number> = {};
    const countByStatus: Record<string, number> = {};
    const vesselsByCultivar: Record<string, number> = {};
    let totalVessels = 0;
    let activeSamples = 0;
    let contaminatedSamples = 0;

    for (const s of allSamples) {
      countByStatus[s.status] = (countByStatus[s.status] ?? 0) + 1;
      if (s.status === "active") {
        activeSamples++;
        vesselsByStage[s.stage] = (vesselsByStage[s.stage] ?? 0) + s.quantity;
        totalVessels += s.quantity;
        vesselsByCultivar[s.cultivar || "Unknown"] =
          (vesselsByCultivar[s.cultivar || "Unknown"] ?? 0) + s.quantity;
      }
      if (s.status === "contaminated") contaminatedSamples++;
    }

    const stageData = Object.entries(vesselsByStage).map(([label, vessels]) => ({
      stage: label.charAt(0).toUpperCase() + label.slice(1),
      vessels,
    }));

    const statusData = Object.entries(countByStatus).map(([label, count]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      count,
      fill: STATUS_COLORS[label] ?? "#9ca3af",
    }));

    const cultivarData = Object.entries(vesselsByCultivar)
      .sort((a, b) => b[1] - a[1])
      .map(([label, vessels]) => ({ label, vessels }));

    const contaminationRate =
      allSamples.length > 0
        ? ((contaminatedSamples / allSamples.length) * 100).toFixed(1)
        : "0.0";

    return {
      stageData,
      statusData,
      cultivarData,
      totalVessels,
      activeSamples,
      contaminatedSamples,
      contaminationRate,
      totalSamples: allSamples.length,
    };
  }, [allSamples]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Inventory summary and trends</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="mr-2 h-4 w-4" />
          Print / Export
        </Button>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">TC Inventory — Analytics Report</h2>
        <p className="text-sm text-gray-600">Generated: {format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Samples</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalSamples}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Vessels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalVessels}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeSamples}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contamination Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${parseFloat(stats.contaminationRate) > 10 ? "text-red-600" : "text-foreground"}`}>
              {stats.contaminationRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stats.contaminatedSamples} contaminated</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vessels by Stage</CardTitle>
            <CardDescription>Active vessels grouped by culture stage</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.stageData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active samples.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.stageData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [value, "Vessels"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="vessels" radius={[4, 4, 0, 0]}>
                    {stats.stageData.map((entry) => (
                      <Cell
                        key={entry.stage}
                        fill={STAGE_COLORS[entry.stage.toLowerCase()] ?? "#a3a3a3"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Samples by Status</CardTitle>
            <CardDescription>Distribution across all lifecycle statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats.statusData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ label, count }) => `${label}: ${count}`}
                    labelLine={false}
                  >
                    {stats.statusData.map((entry) => (
                      <Cell key={entry.label} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" />
                  <Tooltip formatter={(value) => [value, "Samples"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cultivar breakdown */}
      {stats.cultivarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vessels by Cultivar</CardTitle>
            <CardDescription>Active vessel count per cultivar/variety</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, stats.cultivarData.length * 52)}>
              <BarChart
                data={stats.cultivarData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
              >
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={120} />
                <Tooltip formatter={(value) => [value, "Vessels"]} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="vessels" fill="#2dd4bf" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Summary table for print */}
      <Card className="print:block">
        <CardHeader>
          <CardTitle>Stage Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground">Stage</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Active Vessels</th>
              </tr>
            </thead>
            <tbody>
              {stats.stageData.map((row) => (
                <tr key={row.stage} className="border-b last:border-0">
                  <td className="py-2 capitalize">{row.stage}</td>
                  <td className="py-2 text-right tabular-nums">{row.vessels}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{stats.totalVessels}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Print footer */}
      <div className="hidden print:block mt-6 pt-4 border-t text-xs text-gray-500">
        <p>TC Inventory — {window.location.hostname}</p>
      </div>
    </div>
  );
}
