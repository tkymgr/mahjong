export const EXPRESSION_LABELS = Object.freeze({normal:'通常',happy:'喜び',upset:'悔しさ',flustered:'焦り・着崩れ',crisis:'大きな着崩れ'});

// Points are indexed by fixed player ID, not the rotating seat wind.
// Result standings are a snapshot after the pending settlement; the core
// applies that settlement only after the result confirmation.
export function characterAppearance(character, playerId, model, rules, result = null) {
  const start = rules?.startPoints || 25000;
  const points = result?.standings?.[playerId] ?? model?.defen?.[playerId] ?? start;
  const delta = result?.players?.find(player => player.id === playerId)?.delta ?? 0;
  let mood = 'normal';
  if (result?.type === 'hule' && result.winnerId === playerId) mood = 'happy';
  else if (points <= start * .30) mood = 'crisis';
  else if (points <= start * .60) mood = 'flustered';
  else if (delta < 0 || points <= start * .90) mood = 'upset';
  else if (points >= start * 1.20) mood = 'happy';
  return {mood,moodLabel:EXPRESSION_LABELS[mood],avatar:character.expressions?.[mood] || character.avatar,baseAvatar:character.avatar};
}
