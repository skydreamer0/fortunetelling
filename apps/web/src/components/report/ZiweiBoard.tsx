/** Zi Wei twelve-palace board in the traditional 4×4 layout. */

import { useState } from 'react';
import type { PalaceView, Star, ZiweiBoard as Board } from '../../model/selectors';

const MUTAGEN_CLASS: Record<string, string> = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };

function brightnessTone(score: number | null): string {
  if (score == null) return 'none';
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'mid';
  return 'low';
}

function StarMark({ star, detailed = false }: { star: Star; detailed?: boolean }) {
  return (
    <span className="star" data-tone={brightnessTone(star.brightnessScore)}>
      <span className="star__name">{star.name}</span>
      {star.brightness && <span className="star__brightness">{star.brightness}</span>}
      {star.mutagen && (
        <span className={`mutagen mutagen--${MUTAGEN_CLASS[star.mutagen] ?? 'other'}`} title={`化${star.mutagen}`}>
          {detailed ? `化${star.mutagen}` : star.mutagen}
        </span>
      )}
    </span>
  );
}

function Palace({ palace, selected, onSelect }: { palace: PalaceView; selected: boolean; onSelect: () => void }) {
  const flags = [
    palace.isSoul && '命',
    palace.isBody && '身',
    palace.isCurrentDecade && '限',
    palace.isYearPalace && '年',
  ].filter(Boolean) as string[];
  return (
    <button
      type="button"
      className={`palace${selected ? ' is-selected' : ''}${palace.isSoul ? ' palace--soul' : ''}`}
      style={{ gridRow: palace.row, gridColumn: palace.column }}
      aria-pressed={selected}
      aria-label={`${palace.name}，${palace.stem}${palace.branch}，力量 ${palace.score} 分`}
      onClick={onSelect}
    >
      <span className="palace__head">
        <span className="palace__name">{palace.name}</span>
        <span className="palace__branch">{palace.stem}{palace.branch}</span>
      </span>
      <span className="palace__stars">
        {palace.majorStars.length > 0
          ? palace.majorStars.map(star => <StarMark key={star.name} star={star} />)
          : <span className="palace__empty">借對宮</span>}
      </span>
      <span className="palace__minor">
        {palace.minorStars.slice(0, 3).map(star => <StarMark key={star.name} star={star} />)}
        {palace.minorStars.length > 3 && <span className="palace__more">+{palace.minorStars.length - 3}</span>}
      </span>
      <span className="palace__foot">
        <span className="palace__flags">{flags.map(flag => <i key={flag}>{flag}</i>)}</span>
        {palace.decade && <span className="palace__decade">{palace.decade[0]}–{palace.decade[1]}</span>}
      </span>
      <span className="palace__strength" style={{ width: `${palace.score}%` }} aria-hidden="true" />
    </button>
  );
}

export function ZiweiBoard({ board, name }: { board: Board; name: string }) {
  const soul = board.palaces.find(palace => palace.isSoul) ?? board.palaces[0];
  const [selectedIndex, setSelectedIndex] = useState(soul.index);
  const selected = board.palaces.find(palace => palace.index === selectedIndex) ?? soul;
  const transforms = [...selected.majorStars, ...selected.minorStars].filter(star => star.mutagen);

  return (
    <div className="board-wrap">
      <div className="board" aria-label="紫微斗數十二宮命盤">
        {board.palaces.map(palace => (
          <Palace key={palace.index} palace={palace} selected={palace.index === selected.index}
            onSelect={() => setSelectedIndex(palace.index)} />
        ))}
        <div className="board__center">
          <div className="board__identity">
            <span className="board__kicker">紫微斗數・本命盤</span>
            <span className="board__name">{name || '命主'}</span>
            <span>{board.lunarDate}</span>
            <span>{board.fiveElementsClass}・命主{board.soulMaster}・身主{board.bodyMaster}</span>
          </div>
          <div className="board__detail" aria-live="polite">
            <p className="board__detail-name">
              {selected.name}<span>{selected.stem}{selected.branch}</span>
            </p>
            <p className="board__detail-score">力量 <strong>{selected.score}</strong> / 100</p>
            <p className="board__detail-stars">
              {selected.majorStars.length > 0
                ? selected.majorStars.map(star => <StarMark key={star.name} star={star} detailed />)
                : '本宮無主星，解讀時參考對宮。'}
            </p>
            {transforms.length > 0 && (
              <p className="board__detail-note">生年四化：{transforms.map(star => `${star.name}化${star.mutagen}`).join('、')}</p>
            )}
            {selected.decade && <p className="board__detail-note">大限 虛歲 {selected.decade[0]}–{selected.decade[1]}</p>}
          </div>
        </div>
      </div>
      <p className="board__legend">
        <span><i className="legend-flag">命</i>命宮</span>
        <span><i className="legend-flag">身</i>身宮</span>
        <span><i className="legend-flag">限</i>目前大限</span>
        <span><i className="legend-flag">年</i>流年命宮</span>
        <span><i className="mutagen mutagen--lu">祿</i><i className="mutagen mutagen--quan">權</i><i className="mutagen mutagen--ke">科</i><i className="mutagen mutagen--ji">忌</i>生年四化</span>
        <span>底線長度＝宮位力量</span>
      </p>
      {board.yearTransforms && (
        <p className="footnote">
          流年 {board.yearTransforms.stem}{board.yearTransforms.branch} 四化：
          {board.yearTransforms.stars.map((star, index) => `${star}化${['祿', '權', '科', '忌'][index]}`).join('、')}
        </p>
      )}
    </div>
  );
}
