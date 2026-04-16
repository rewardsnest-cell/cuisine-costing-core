import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ChefHat, FileText, Receipt, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold font-display">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your catering operations today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Recipes" value="0" icon={ChefHat} color="bg-primary/10 text-primary" />
        <StatCard label="Inventory Items" value="0" icon={Package} color="bg-success/10 text-success" />
        <StatCard label="Active Quotes" value="0" icon={FileText} color="bg-gold/20 text-warm" />
        <StatCard label="Pending Receipts" value="0" icon={Receipt} color="bg-warning/20 text-warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-success" />
              <h3 className="font-display text-lg font-semibold">Cost Trends</h3>
            </div>
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              <p>Process receipts to see cost trend analytics here.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h3 className="font-display text-lg font-semibold">Low Stock Alerts</h3>
            </div>
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              <p>Add inventory items with par levels to see alerts.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
