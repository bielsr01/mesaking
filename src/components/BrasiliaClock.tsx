import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const fmtTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const fmtDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

export function BrasiliaClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm"
      title="Horário de Brasília (GMT-3)"
    >
      <Clock className="w-4 h-4 text-primary" />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-semibold tabular-nums">
          {fmtTime.format(now)}
        </span>
        {!compact && (
          <span className="text-[10px] text-muted-foreground -mt-0.5">
            {fmtDate.format(now)} · Brasília
          </span>
        )}
      </div>
    </div>
  );
}

export default BrasiliaClock;
