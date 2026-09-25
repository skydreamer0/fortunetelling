/** Dependency-free SVG radar chart with an accessible data table. */

export interface RadarSeries {
  name: string;
  values: number[];
  tone: 'primary' | 'secondary' | 'muted';
}

interface RadarProps {
  labels: string[];
  series: RadarSeries[];
  max?: number;
  unit?: string;
  title: string;
  size?: number;
}

/** Point on axis `index` of `count`, at `ratio` of the radius; axis 0 points straight up. */
export function radarPoint(index: number, count: number, ratio: number, radius: number, center: number): [number, number] {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Scale maximum rounded up to the next 10, never below `floor`, so small shares stay readable. */
export function niceMax(values: number[], floor = 40, ceiling = 100): number {
  const peak = Math.max(0, ...values);
  return Math.min(ceiling, Math.max(floor, Math.ceil(peak / 10) * 10));
}

export function Radar({ labels, series, max = 100, unit = '', title, size = 320 }: RadarProps) {
  const center = size / 2;
  const radius = size / 2 - 44;
  const count = labels.length;
  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = (ratio: (index: number) => number) =>
    labels.map((_, index) => radarPoint(index, count, ratio(index), radius, center).map(round).join(',')).join(' ');

  return (
    <figure className="radar">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title} className="radar__svg">
        {rings.map(ring => (
          <polygon key={ring} points={polygon(() => ring)} className={`radar__ring${ring === 1 ? ' radar__ring--outer' : ''}`} />
        ))}
        {labels.map((label, index) => {
          const [x, y] = radarPoint(index, count, 1, radius, center);
          const [lx, ly] = radarPoint(index, count, 1, radius + 22, center);
          const anchor = Math.abs(lx - center) < 6 ? 'middle' : lx > center ? 'start' : 'end';
          return (
            <g key={label}>
              <line x1={center} y1={center} x2={round(x)} y2={round(y)} className="radar__spoke" />
              <text x={round(lx)} y={round(ly)} textAnchor={anchor} dominantBaseline="middle" className="radar__label">{label}</text>
            </g>
          );
        })}
        <text x={center + 4} y={round(center - radius - 4)} className="radar__scale">{max}{unit}</text>
        {series.map(item => (
          <g key={item.name} className={`radar__series radar__series--${item.tone}`}>
            <polygon points={polygon(index => Math.max(0, Math.min(1, (item.values[index] ?? 0) / max)))} className="radar__area" />
            {item.values.map((value, index) => {
              const [x, y] = radarPoint(index, count, Math.max(0, Math.min(1, value / max)), radius, center);
              return <circle key={labels[index]} cx={round(x)} cy={round(y)} r={3} className="radar__dot" />;
            })}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="radar__legend">
          {series.map(item => (
            <span key={item.name} className={`radar__key radar__key--${item.tone}`}>{item.name}</span>
          ))}
        </figcaption>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">軸</th>{series.map(item => <th key={item.name} scope="col">{item.name}</th>)}</tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {series.map(item => <td key={item.name}>{item.values[index]}{unit}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
