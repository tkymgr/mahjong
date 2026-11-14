import tileSpec from '../../assets/models/tile-spec.json' with { type: 'json' };
export const TILE = Object.freeze({ ...tileSpec.dimensions, pitch: tileSpec.dimensions.width + 2 });
// Preserve the far edge and extend the felt beyond the near viewport edge.
export const TABLE = Object.freeze({ width: 1060, depth: 1060, centerZ: 0, foregroundExtension: 520 });
export const CAMERA = Object.freeze({ position: [0, 1900, 1350], target: [0, 0, 10], horizontalFov: 38 });
export const PLAYER_HAND = Object.freeze({ scale: 1.55, meldScale: 1.05, maxWidth: .80, bottom: 12, pitch: 10 });
export const HAND_DISTANCE = 460;
export const WORLD_TILE_SCALE = .76;
export const RIVER_SCALE = WORLD_TILE_SCALE;
export const BOARD_WIDTH = 1536;
export const BOARD_HEIGHT = 720;

export function faceFile(tile) {
  if (tile[0] === 'z') return ['east','south','west','north','white','green','red'][+tile[1] - 1] + '.png';
  const suit = {m:'man',p:'pin',s:'sou'}[tile[0]];
  return tile[1] === '0' ? `red-${suit}-5.png` : `${suit}-${tile[1]}.png`;
}
export const TILE_CODES = [...['m','p','s'].flatMap(suit => Array.from({length:9},(_,i)=>suit+(i+1))), ...Array.from({length:7},(_,i)=>'z'+(i+1)), 'm0','p0','s0'];

// Fixed player IDs keep their physical seats while seat winds rotate each hand.
export function seatPosition(player, along, distance = HAND_DISTANCE) {
  return [{ x:along,z:distance,yaw:0 },{ x:distance,z:-along,yaw:90 },{ x:-along,z:-distance,yaw:180 },{ x:-distance,z:along,yaw:270 }][player];
}
export function riverPosition(player, row, column, sideways, precedingSideways, scale = RIVER_SCALE) {
  const pitch = TILE.width * scale, extra = precedingSideways ? (TILE.height - TILE.width)*scale : 0;
  const along = (column - 2.5) * pitch + extra + (sideways ? (TILE.height-TILE.width)*scale/2 : 0);
  const distance = 150 + row * TILE.height * scale;
  const p = seatPosition(player,along,distance);
  return {...p, yaw:p.yaw + (sideways?90:0)};
}
