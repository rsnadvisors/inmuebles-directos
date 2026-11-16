import type { Counts, Week } from "../../lib/owner-dashboard";
import { contacts } from "../../lib/owner-dashboard";

/** Gráficos del dashboard del anunciante: SVG dibujado a escala en el servidor, sin librerías. */
function niceMax(value: number, floor: number): number {
  const v = Math.max(value, floor);
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
  return 10 * step;
}
const fmt = (v: number) => v.toLocaleString("es-PE");
const weekLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

/** ¿Cuántas personas te contactan cada semana? Barras apiladas (WhatsApp + llamadas) y línea de visitas (eje derecho). */
export function WeeklyContactsChart({ weeks }: { weeks: Week[] }) {
  const W = 440, H = 190, L = 34, R = 404, T = 16, B = 152;
  const maxC = niceMax(Math.max(0, ...weeks.map(w => w.call + w.whatsapp)), 4);
  const maxV = niceMax(Math.max(0, ...weeks.map(w => w.view)), 10);
  const yC = (v: number) => B - (v / maxC) * (B - T);
  const yV = (v: number) => B - (v / maxV) * (B - T);
  const slot = (R - L) / Math.max(weeks.length, 1);
  const bw = Math.min(28, slot * 0.6);
  const cx = (i: number) => L + slot * i + slot / 2;
  const ticks = [0, 0.5, 1];
  const line = weeks.map((w, i) => `${cx(i).toFixed(1)},${yV(w.view).toFixed(1)}`).join(" ");
  const last = weeks.length - 1;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Contactos por semana: WhatsApp y llamadas en barras, visitas en línea" className="acct-chart">
    {ticks.map(t => <g key={t}>
      <line x1={L} x2={R} y1={yC(maxC * t)} y2={yC(maxC * t)} className="acct-chart-grid" />
      <text x={L - 6} y={yC(maxC * t) + 4} textAnchor="end">{fmt(maxC * t)}</text>
      <text x={R + 6} y={yC(maxC * t) + 4}>{fmt(maxV * t)}</text>
    </g>)}
    {weeks.map((w, i) => {
      const x = cx(i) - bw / 2;
      return <g key={w.week}>
        {w.whatsapp > 0 && <rect x={x} y={yC(w.whatsapp)} width={bw} height={B - yC(w.whatsapp)} rx="3" className="acct-chart-a" />}
        {w.call > 0 && <rect x={x} y={yC(w.whatsapp + w.call)} width={bw} height={yC(w.whatsapp) - yC(w.whatsapp + w.call)} rx="3" className="acct-chart-b" />}
        <text x={cx(i)} y={H - 20} textAnchor="middle">{weekLabel(w.week)}</text>
      </g>;
    })}
    {weeks.length > 1 && <polyline points={line} fill="none" className="acct-chart-line" />}
    {weeks.length > 0 && <circle cx={cx(last)} cy={yV(weeks[last].view)} r="3.5" className="acct-chart-dot" />}
    <text x={2} y={H - 4}>← contactos</text>
    <text x={W - 2} y={H - 4} textAnchor="end">visitas →</text>
  </svg>;
}

/** ¿Qué anuncio rinde y cuál necesita ayuda? Barras en HTML para que los títulos largos nunca se corten:
 * el título va completo (hasta 2 líneas) encima de su barra. «Revisar» solo con 14 días o más publicado. */
export const QUIET_AFTER_DAYS = 14;
export function ListingContactsChart({ rows }: { rows: { id: string; title: string; counts: Counts; ageDays: number }[] }) {
  const top = rows.slice(0, 6);
  const max = niceMax(Math.max(0, ...top.map(r => contacts(r.counts))), 4);
  return <div className="acct-bars" role="img" aria-label="Contactos de los últimos 30 días por anuncio">
    <ul>
      {top.map(r => {
        const c = contacts(r.counts);
        const quiet = c === 0 && r.ageDays >= QUIET_AFTER_DAYS;
        return <li key={r.id}>
          <span className="acct-bar-row">
            <span className="acct-bar-title" title={r.title}>{r.title}</span>
            <span className={quiet ? "acct-bar-value crit" : "acct-bar-value"}>{fmt(c)}{c === 0 ? (quiet ? " · revisar" : " · recién publicado") : ""}</span>
          </span>
          <span className="acct-bar-track"><span className="acct-bar-fill" style={{ width: `${c > 0 ? Math.max(3, (c / max) * 100) : 0}%` }} /></span>
        </li>;
      })}
    </ul>
    <span className="acct-bar-scale"><span>0</span><span>{fmt(max)}</span></span>
  </div>;
}
