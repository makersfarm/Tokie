import type { Mood } from '@core/types';

export const GREETINGS = [
  '고마워✨',
  '헤헤',
  '쓰담쓰담~',
  '넹',
  '💕',
  '오 안녕'
] as const;

export const BURST_BY_MOOD: Record<'happy' | 'normal' | 'sleepy', readonly string[]> = {
  happy:  ['오 키 핀좌 우적~', '배 터져✨', '맛있다맛있다', 'GG 그만 먹어...'],
  normal: ['흠냠', '잘 먹는 중~', '오늘 풍년이네'],
  sleepy: ['오 깨워줘서 고마워...', '오랜만에 먹는다', '기운나려나']
};

function pick<T>(arr: readonly T[], rng: () => number): T {
  const i = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[i]!;
}

export function pickGreeting(rng: () => number = Math.random): string {
  return pick(GREETINGS, rng);
}

export function pickBurstLine(mood: Mood, rng: () => number = Math.random): string {
  const bucket =
      mood === 'happy'                       ? BURST_BY_MOOD.happy
    : mood === 'sad' || mood === 'sleepy'    ? BURST_BY_MOOD.sleepy
    :                                          BURST_BY_MOOD.normal;
  return pick(bucket, rng);
}
