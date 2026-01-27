import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon | ReactNode;
  iconColor?: string;
  description?: string;
  className?: string;
}

export function MetricCard({ 
  title, 
  value, 
  change, 
  changeType = "neutral", 
  icon,
  iconColor,
  description,
  className 
}: MetricCardProps) {
  const changeColors = {
    positive: "text-green-600 dark:text-green-400",
    negative: "text-red-600 dark:text-red-400",
    neutral: "text-muted-foreground"
  };

  // Check if icon is a LucideIcon (function) or ReactNode (element)
  const isIconComponent = typeof icon === 'function';
  const IconComponent = isIconComponent ? icon as LucideIcon : null;

  return (
    <Card className={cn("transition-all hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {isIconComponent && IconComponent ? (
          <IconComponent className={cn("h-4 w-4 text-muted-foreground", iconColor)} />
        ) : (
          <span className="h-4 w-4 flex items-center justify-center">{icon as ReactNode}</span>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {change && (
          <p className={cn("text-xs mt-1", changeColors[changeType])}>
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
