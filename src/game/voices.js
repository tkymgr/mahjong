import { CHARACTERS } from './characters.js';
export const VOICE_ACTIONS=Object.freeze({zimo:'ツモ',rong:'ロン',peng:'ポン',chi:'チー',gang:'カン',lizhi:'リーチ'});
export const VOICE_IDS=Object.freeze(['player',...CHARACTERS.map(character=>character.id)]);
