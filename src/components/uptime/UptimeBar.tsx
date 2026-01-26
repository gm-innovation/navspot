import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DayStatus } from '@/hooks/useUptimeMonitor';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface UptimeBarProps {
  days: DayStatus[];
  height?: number;
  showLabels?: boolean;
}

function getBarColor(uptime: number, status: DayStatus['status']): string {
  if (status === 'no_data') return 'bg-muted';
  if (uptime === 100) return 'bg-green-500';
  if (uptime >= 99) return 'bg-green-400';
  if (uptime >= 95) return 'bg-yellow-500';
  if (uptime >= 90) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function UptimeBar({ days, height = 32, showLabels = true }: UptimeBarProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-0.5" style={{ height }}>
        {days.map((day, index) => (
          <Tooltip key={day.date}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex-1 rounded-sm transition-all hover:opacity-80 cursor-pointer min-w-[2px]',
                  getBarColor(day.uptime_percent, day.status)
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="font-medium">
                {format(parseISO(day.date), "d 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-muted-foreground">
                Uptime: {day.uptime_percent.toFixed(2)}%
              </div>
              {day.downtime_minutes > 0 && (
                <div className="text-muted-foreground">
                  Offline: {formatDuration(day.downtime_minutes)}
                </div>
              )}
              {day.incidents > 0 && (
                <div className="text-muted-foreground">
                  {day.incidents} incidente{day.incidents > 1 ? 's' : ''}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{days.length} dias atrás</span>
          <span>Hoje</span>
        </div>
      )}
    </div>
  );
}
