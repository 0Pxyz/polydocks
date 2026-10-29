/**
 * Shared intent vocabulary: one definition for tool-gating (intent.ts) and
 * skill selection (skills/index.ts). PT+EN, prefix-tolerant stems, grouped so
 * every alternative carries its own word boundaries.
 */

export const ARTIFACT_WORD =
  /\b(plugin|tab|tool|feed|experience|experi[eê]ncia|ferramenta|aba|widget|timer|dashboard|reader|leitor)\b/;

// Broken-behavior reports: the artifact exists and must be repaired in place,
// never recreated.
export const FIX_WORD =
  /\b(fix\w*|arrum\w*|consert\w*|resolv\w*|quebrad\w*|broken|doesn'?t work|does not work|doesnt work|not working|não funciona|nao funciona|bug)\b/;

export const UPDATE_WORD =
  /\b(update\w*|modify|modif\w*|fix|change\w*|group by|add\w*|adiciona\w*|acrescenta\w*|atualiz\w*|modific\w*|corrig\w*|alter\w*|agrup\w*|muda\w*|mude\w*|arrum\w*|consert\w*|resolv\w*|quebrad\w*|broken|doesn'?t work|does not work|not working|não funciona|nao funciona|bug)\b/;
