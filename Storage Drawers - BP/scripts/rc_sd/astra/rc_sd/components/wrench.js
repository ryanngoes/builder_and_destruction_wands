import * as mc from "@minecraft/server";

export function setPermutation(block, stateAdd, stateValue) {
    const result = block.permutation.getAllStates();
    result[stateAdd] = stateValue;
    block.setPermutation(mc.BlockPermutation.resolve(block?.typeId, result));
}

export function invertFace(face) {
    if (face == 'above') return 'below'
    if (face == 'below') return 'above'
    if (face == 'north') return 'south'
    if (face == 'south') return 'north'
    if (face == 'west') return 'east'
    if (face == 'east') return 'west'

}

export const containerBlock = [
  "minecraft:chest",
  "minecraft:furnace",
  "minecraft:lit_furnace",
  "minecraft:barrel",
  "minecraft:hopper",
  "minecraft:dispenser",
];

export function wrenchComponent(data) {
  data.itemComponentRegistry.registerCustomComponent("rc_sd:wrench", {
    onUseOn: ({ itemStack, source: player, block, blockFace }, { params }) => {
      const faceMap = {
        Up: "above",
        Down: "below",
        North: "north",
        South: "south",
        East: "east",
        West: "west",
      };

      const face = faceMap[blockFace];
      if (!face) return;

      const neighbor = block[face]?.();
      if (!neighbor) return;

      if (neighbor.typeId !== "rc_sd:pipe") return;

      const pipeFace = invertFace(face);

      const stateKey = `rc_sd:${pipeFace}`;
      const current = neighbor.permutation.getState(stateKey);

      setPermutation(
        neighbor,
        stateKey,
        current === "pull" ? "false" : (current === "false" ? "true" : "pull")
      );
      player.playSound("item.spyglass.use", { pitch: 2 });
    },
  });
};

function rotateBlock90(block) {
  const perm = block.permutation;

  // 1) Cardinal (mais comum em blocos 4-direções)
  const cardinalState = "minecraft:cardinal_direction";
  const cardinalOrder = ["north", "east", "south", "west"];

  try {
    const cur = perm.getState(cardinalState);
    if (typeof cur === "string" && cardinalOrder.includes(cur)) {
      const next =
        cardinalOrder[(cardinalOrder.indexOf(cur) + 1) % cardinalOrder.length];
      block.setPermutation(perm.withState(cardinalState, next));
      return true;
    }
  } catch {}

  // 2) Facing (às vezes inclui up/down)
  const facingState = "minecraft:facing_direction";
  const facingOrder = [0, 1, 2, 3, 4, 5];

  try {
    const cur = perm.getState(facingState);
    if (typeof cur === "string" && facingOrder.includes(cur)) {
      const next =
        facingOrder[(facingOrder.indexOf(cur) + 1) % facingOrder.length];
      block.setPermutation(perm.withState(facingState, next));
      return true;
    }
  } catch {}

  return false; // não tem state rotacionável
}
