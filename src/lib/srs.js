export const MAX_REVIEW_INTERVAL_DAYS = 45;
export const RELEARN_DELAY_MS = 15 * 60 * 1000;

export const getNextReviewPlan = (card, difficulty) => {
  const currentInterval = Math.max(
    0,
    Math.min(MAX_REVIEW_INTERVAL_DAYS, Number(card?.interval || 0))
  );
  const isNewOrLearning = card?.status === 'new' || card?.status === 'learning';

  if (difficulty === 'again') {
    return {
      interval: 0,
      status: 'learning',
      delayMs: RELEARN_DELAY_MS,
      lapseDelta: isNewOrLearning ? 0 : 1,
    };
  }

  let interval = 1;
  if (isNewOrLearning) {
    if (difficulty === 'hard') interval = 1;
    if (difficulty === 'good') interval = 2;
    if (difficulty === 'easy') interval = 4;
  } else {
    if (difficulty === 'hard') interval = Math.max(1, Math.round(currentInterval * 1.2));
    if (difficulty === 'good') interval = Math.max(2, Math.round(currentInterval * 1.8));
    if (difficulty === 'easy') interval = Math.max(4, Math.round(currentInterval * 2.3));
  }

  interval = Math.min(MAX_REVIEW_INTERVAL_DAYS, interval);

  return {
    interval,
    status: interval >= 21 && difficulty !== 'hard' ? 'mastered' : 'review',
    delayMs: interval * 24 * 60 * 60 * 1000,
    lapseDelta: 0,
  };
};

export const calculateReviewSchedule = (card, difficulty, now = Date.now()) => {
  const plan = getNextReviewPlan(card, difficulty);

  return {
    ...card,
    interval: plan.interval,
    lapseCount: Number(card?.lapseCount || 0) + plan.lapseDelta,
    status: plan.status,
    nextReviewAt: now + plan.delayMs,
    lastReviewedAt: now,
  };
};
