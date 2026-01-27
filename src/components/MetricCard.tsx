import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode, isValidElement } from "react";

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

  // Check if icon is already a rendered React element (JSX like <Icon />)
  // If not, it's a LucideIcon component that needs to be instantiated
  const isRenderedElement = isValidElement(icon);

  const renderIcon = () => {
    if (isRenderedElement) {
      // Already a JSX element like <Clock className="..." />
      return icon;
    }
    // It's a LucideIcon component reference, instantiate it
    const IconComponent = icon as LucideIcon;
    return <IconComponent className={cn("h-4 w-4 text-muted-foreground", iconColor)} />;
  };

  return (
    <Card className={cn("transition-all hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {renderIcon()}
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
