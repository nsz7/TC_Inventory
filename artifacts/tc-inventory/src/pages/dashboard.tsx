import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dates";
import { Link } from "wouter";
import { ArrowRight, TestTube2, ArrowRightLeft, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of tissue culture inventory</p>
        </div>
        <div className="flex gap-2">
          <Link href="/samples/new">
            <Button>
              <TestTube2 className="mr-2 h-4 w-4" />
              New Sample
            </Button>
          </Link>
          <Link href="/transfers/new">
            <Button variant="secondary">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Record Transfer
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Samples</CardTitle>
            <TestTube2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSamples}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Transfers</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalTransfers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Stages</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.byStage.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Transfers</CardTitle>
            <CardDescription>The latest subculture and transfer events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.recentTransfers.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No recent transfers.</p>
              ) : (
                summary.recentTransfers.map(transfer => (
                  <div key={transfer.id} className="flex items-center justify-between p-4 border rounded-md">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{transfer.fromSampleCode}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm font-medium">{transfer.toSampleCode || "External"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {transfer.technician} • {format(parseLocalDate(transfer.transferDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">Qty: {transfer.quantityTransferred}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {summary.recentTransfers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <Link href="/transfers">
                  <Button variant="ghost" className="w-full text-primary hover:text-primary">
                    View all transfers <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.byStage.map(stage => (
                <div key={stage.label} className="flex items-center justify-between">
                  <div className="text-sm font-medium capitalize">{stage.label}</div>
                  <div className="text-sm text-muted-foreground">{stage.count} samples</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
