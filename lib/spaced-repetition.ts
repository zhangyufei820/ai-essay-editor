/**
 * SM-2 interval repetition algorithm.
 *
 * @param quality 0-5, where 0 means forgotten and 5 means instant recall.
 * @param repetitions Current consecutive successful repetitions.
 * @param easeFactor Current ease factor, usually initialized to 2.5.
 * @param interval Current interval in days.
 */
export function sm2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  interval: number,
): { repetitions: number; easeFactor: number; interval: number; nextReview: Date } {
  const normalizedQuality = Math.min(5, Math.max(0, Math.round(quality)))
  let newReps = Math.max(0, Math.floor(repetitions))
  let newEF = Number.isFinite(easeFactor) ? easeFactor : 2.5
  let newInterval = Math.max(1, Math.floor(interval))

  if (normalizedQuality >= 3) {
    if (newReps === 0) newInterval = 1
    else if (newReps === 1) newInterval = 6
    else newInterval = Math.round(newInterval * newEF)
    newReps += 1
  } else {
    newReps = 0
    newInterval = 1
  }

  newEF = newEF + (0.1 - (5 - normalizedQuality) * (0.08 + (5 - normalizedQuality) * 0.02))
  if (newEF < 1.3) newEF = 1.3

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)

  return { repetitions: newReps, easeFactor: newEF, interval: newInterval, nextReview }
}
