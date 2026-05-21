import { useEffect, useRef } from 'react';
import type { FilterPreset } from '../../types/filter';

const THUMB_W = 120;
const THUMB_H = 80;

interface FilterCardProps {
  filter:        FilterPreset;
  selected:      boolean;
  thumbnail:     ImageData | undefined;
  loading:       boolean;
  hintsEnabled:  boolean;
  onClick:       () => void;
}

export default function FilterCard({
  filter, selected, thumbnail, loading, hintsEnabled, onClick,
}: FilterCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (thumbnail) {
      ctx.putImageData(thumbnail, 0, 0);
    } else {
      // Placeholder gradient — film-dark to film-border, diagonal
      const g = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
      g.addColorStop(0, '#1a1816');
      g.addColorStop(1, '#3a3632');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    }
  }, [thumbnail]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group p-1.5 rounded-sm text-left transition-all duration-150 border',
        selected
          ? 'border-film-amber bg-film-amber/[0.07]'
          : 'border-film-border hover:brightness-125 hover:border-film-muted',
      ].join(' ')}
    >
      <div className="relative w-full aspect-[3/2] overflow-hidden rounded-[2px]">
        <canvas
          ref={canvasRef}
          width={THUMB_W}
          height={THUMB_H}
          className="block w-full h-full"
        />
        {loading && (
          <div className="absolute inset-0 shimmer pointer-events-none" aria-hidden />
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className={[
          'text-[12px] font-medium font-sans truncate',
          selected ? 'text-film-amber' : 'text-film-text',
        ].join(' ')}>
          {filter.name}
        </div>
        {hintsEnabled && (
          <div className="text-[11px] italic text-film-text-dim mt-0.5 leading-snug line-clamp-2">
            {filter.hintText}
          </div>
        )}
      </div>
    </button>
  );
}
