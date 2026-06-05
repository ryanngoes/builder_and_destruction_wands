import * as mc from "@minecraft/server";
import * as astraAPI from "../astraAPI.js";

const sides = ["north", "south", "east", "west", "above", "below"];

export function pipeComponent(data) {
  data.blockComponentRegistry.registerCustomComponent("rc_sd:pipe", {
    onTick: ({ block, dimension }, { params }) => {
      const pulls = getPullSides(block);

      //console.warn(`pulls: ${pulls.join(", ")}`);

      for (const side of pulls) {
        const targetBlock = block[side]()

        const pos = targetBlock.location

        //console.warn(`targetBlock: ${targetBlock.typeId} at ${pos.x},${pos.y},${pos.z}`);

        const inventory = targetBlock.getComponent("minecraft:inventory"); if (!inventory) continue;

        const config = blocksConfig(targetBlock);
        const outputSlots = config?.outputSlots ?? []; // fallback se não existir

        for (const i of outputSlots) {
          const item = inventory.container.getItem(i);
          if (!item) continue;

          const itmeType = astraAPI.itemType(block, item);
          const itemTypeNumber = astraAPI.typeToNumber(itmeType);

          const replace =
            itmeType === "fake"
              ? `rc_sd:${item.typeId.split(":")[1]}_item_fake`
              : item.typeId;

          const path = findPathForItem(block, item);

          if (!path[0]) return;


          // spawn do item no centro do bloco de origem

          const itemEntity = dimension.spawnEntity("rc_sd:pipe_visual_item", {
            x: targetBlock.center().x,
            y: pos.y + 0.2,
            z: targetBlock.center().z,
          });

          itemEntity.setDynamicProperty('rc_sd:initial_block', targetBlock.location)

          mc.system.runTimeout(() => dimension?.playSound("random.pop", block.center(), { pitch: 0.65, volume: 0.035 }), 5);

          const inventoryItem = itemEntity.getComponent(
            "minecraft:inventory"
          );
          const container = inventoryItem.container;
          const newItem = item.clone();
          newItem.amount = 1;

          mc.system.runTimeout(() =>
            itemEntity.runCommand(
              `replaceitem entity @s slot.weapon.${itmeType === "item" ? "mainhand" : "offhand"
              } 0 ${replace}`),
            1
          );

          astraAPI.moveItemFromContainers(
            inventory.container,
            i,
            container,
            0,
            1
          );

          //inventory.container.transferItem(i, inventory.container); // força atualização do slot

          moveEntity(itemEntity, targetBlock, block, {
            speed: 2.3,
            yOffset: -0.3,
          });

          break;
        }
      }

    },
    beforeOnPlayerPlace: (event, { params }) => {
      event.cancel = true;
      const { block, player } = event;
      const InventoryManager = new astraAPI.InventoryManager(player);
      mc.system.runTimeout(() => {
        event.block.setPermutation(event.permutationToPlace);
        connectBlock(block, false);
        InventoryManager.clearMainhand(1, false)
      });
    },
    onPlayerBreak: ({ block, dimension, brokenBlockPermutation }, { params }) => {
      disconnectBlock(block, false)
      const center = block.center();
      const items = dimension.getEntities({
        location: center,
        maxDistance: 0.8,
        type: "rc_sd:item",
      });

      for (const item of items) {
        const inventory = item.getComponent("minecraft:inventory");
        const drop = inventory.container.getItem(0);

        dimension.spawnItem(drop, center);

        item.remove();
      }

    },
  });
}

function findPathForItem(startBlock, item, maxNodes = 512) {
  const queue = [startBlock];
  let qi = 0;

  const parentMap = new Map(); // chave → chave do pai
  const blockMap = new Map(); // chave → objeto bloco

  const startKey = blockKey(startBlock);
  parentMap.set(startKey, null);
  blockMap.set(startKey, startBlock);

  while (qi < queue.length) {
    if (qi >= maxNodes) return [];

    const currentBlock = queue[qi++];
    const currentKey = blockKey(currentBlock);

    for (const face of sides) {
      if (isItemduct(currentBlock) && isFaceBlocked(currentBlock, face)) continue;

      let neighbor;
      try {
        neighbor = currentBlock[face]?.();
      } catch {
        continue; // bloco fora do chunk carregado
      }

      if (!neighbor) continue;

      const neighborKey = blockKey(neighbor);
      if (parentMap.has(neighborKey)) continue;

      const opp = astraAPI.invertFace[face];
      if (isItemduct(neighbor) && isFaceBlocked(neighbor, opp)) continue;

      if (containerBlock.includes(neighbor.typeId)) {
        if (neighborKey !== startKey && canAcceptItem(neighbor, item)) {
          parentMap.set(neighborKey, currentKey);
          blockMap.set(neighborKey, neighbor);
          return buildPath(parentMap, blockMap, neighborKey);
        }
        continue; // container inválido não expande
      }

      if (isItemduct(neighbor)) {
        parentMap.set(neighborKey, currentKey);
        blockMap.set(neighborKey, neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [];
}

function reFindPathForItem(startBlock, targetLocation, item, maxNodes = 512) {
  const queue = [startBlock];
  let qi = 0;

  const parentMap = new Map();
  const blockMap = new Map();

  const startKey = blockKey(startBlock);
  parentMap.set(startKey, null);
  blockMap.set(startKey, startBlock);

  const initialBlock = startBlock.dimension.getBlock(targetLocation);

  const targetKey = blockKey(initialBlock);

  while (qi < queue.length) {
    if (qi >= maxNodes) return [];

    const currentBlock = queue[qi++];
    const currentKey = blockKey(currentBlock);

    for (const face of sides) {
      if (isItemduct(currentBlock) && isFaceImpassable(currentBlock, face)) continue;

      let neighbor;
      try {
        neighbor = currentBlock[face]?.();
      } catch {
        continue;
      }

      if (!neighbor) continue;

      const neighborKey = blockKey(neighbor);
      if (parentMap.has(neighborKey)) continue;

      // ✅ Verificação do target acontece para qualquer bloco vizinho
      if (neighborKey === targetKey) {
        if (neighbor.typeId === "minecraft:air" || !containerBlock.includes(neighbor.typeId)) return [];
        parentMap.set(neighborKey, currentKey);
        blockMap.set(neighborKey, neighbor);
        return buildPath(parentMap, blockMap, neighborKey);
      }

      // Containers que não são o target: não expande
      if (containerBlock.includes(neighbor.typeId)) {
        continue;
      }

      // Só expande se for duto
      if (isItemduct(neighbor)) {
        parentMap.set(neighborKey, currentKey);
        blockMap.set(neighborKey, neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [];
}

function blockKey(block) {
  const { x, y, z } = block.location;
  return `${x}/${y}/${z}/${block.dimension.id}`;
}

function buildPath(parentMap, blockMap, endKey) {
  const path = [];
  let key = endKey;
  while (key !== null) {
    path.push(blockMap.get(key));
    key = parentMap.get(key);
  }
  return path.reverse();
}

function isItemduct(block) {
  return block?.typeId === "rc_sd:pipe";
}

function isFaceBlocked(block, face) {
  try {
    const state = block?.permutation?.getState?.(`rc_sd:${face}`);
    return state === "pull" || state === "false";
  } catch {
    return false;
  }
}

function isFaceImpassable(block, face) {
  try {
    const state = block?.permutation?.getState?.(`rc_sd:${face}`);
    return state === "false";
  } catch {
    return false;
  }
}

const faces = ["above", "below", "north", "south", "west", "east"];

export function connectBlock(block, once = false) {
  let found = false;

  for (const face of faces) {
    const faceBlock = block[face]();

    const stateName = `rc_sd:${face}`;
    const currentState = block.permutation.getState(stateName);

    const blockProperty = blocksConfig(block)?.faces?.[face];

    const neighborFace = astraAPI.invertFace(face);

    const blockFaceProperty =
      blocksConfig(faceBlock)?.faces?.[
      astraAPI.trueFace(faceBlock, neighborFace)
      ];

    const hasCommonProperty =
      blockProperty &&
      blockFaceProperty &&
      blockProperty.some((prop) => blockFaceProperty.includes(prop));

    if (hasCommonProperty) found = true;

    if (hasCommonProperty) {
      if (block?.typeId.endsWith("pipe")) {
        if (currentState !== "pull") {
          astraAPI.setPermutation(block, stateName, "true");
        }
      }

      if (!once) {
        connectBlock(faceBlock, true);
      }
    } else if (block?.typeId.includes("pipe")) {
      if (currentState !== "pull") {
        astraAPI.setPermutation(block, stateName, "false");
      }
    }
  }
}

export function disconnectBlock(block, once) {
  const faces = ["above", "below", "north", "south", "west", "east"];

  for (const face of faces) {
    const faceBlock = block[face]();
    const blockFaceProperty =
      blocksConfig(faceBlock)?.faces?.[
      astraAPI.trueFace(faceBlock, astraAPI.invertFace(face))
      ];

    if (block?.typeId.includes("pipe")) {
      const currentState = block.permutation.getState(`rc_sd:${face}`);

      if (blockFaceProperty?.includes("itemPipe")) {
        // Se há conexão e o estado atual é "false", muda para "true"
        // Se já é "pull", mantém "pull"
        if (currentState === "false") {
          astraAPI.setPermutation(block, `rc_sd:${face}`, "true");
        }
      } else {
        // Se não há conexão, muda para "false"
        astraAPI.setPermutation(block, `rc_sd:${face}`, "false");
      }
    }

    if (blockFaceProperty?.includes("itemPipe") && !once) {
      disconnectBlock(faceBlock, true);
    }
  }
}

mc.system.afterEvents.scriptEventReceive.subscribe(
  ({ id, sourceEntity: entity, message }) => {
    if (id == "rc_sd:pipe_visual_item") {
      if (!entity?.isValid) return;

      const block = entity.dimension.getBlock(entity.location);
      //console.warn(block.typeId)
      const inventory = entity.getComponent("minecraft:inventory");
      const container = inventory.container;
      const item = container.getItem(0);
      const path = findPathForItem(block, item);
      const rePath = reFindPathForItem(block, entity.getDynamicProperty('rc_sd:initial_block'), item);
      if (block.typeId === "minecraft:air") {
        block.dimension.spawnItem(item, block.center());
        entity.remove();
      }
      if (path[1] && entity?.isValid) {
        const nextBlock = entity.dimension.getBlock({
          x: path[1].x,
          y: path[1].y,
          z: path[1].z,
        });
        moveEntity(entity, block, nextBlock, { speed: 2.3, yOffset: -0.3 });

        if (containerBlock.includes(block.typeId)) {
          const inventoryBlock = block.getComponent(
            "minecraft:inventory"
          );
          const containerBlock = inventoryBlock.container;
          const added = containerBlock.addItem(item);
          if (entity.isValid)
            entity?.remove();
        }
      } else {
        if (!entity?.isValid) return
        if (containerBlock.includes(block.typeId)) {
          const inventoryBlock = block.getComponent(
            "minecraft:inventory"
          );
          const containerBlock = inventoryBlock.container;
          const added = containerBlock.addItem(item);
          entity?.remove();
        } else if (rePath[1]) {
          const nextBlock = entity.dimension.getBlock({
            x: rePath[1].x,
            y: rePath[1].y,
            z: rePath[1].z,
          });
          moveEntity(entity, block, nextBlock, { speed: 2.3, yOffset: -0.3 });
        }
      }
    }
  }
);

function moveEntity(entity, startBlock, endBlock, options = {}) {
  const speed =
    typeof options.speed === "number" ? Math.max(0.01, options.speed) : 2;
  const tickStep =
    typeof options.tickStep === "number"
      ? Math.max(1, options.tickStep | 0)
      : 1;

  // quanto descer (em blocos). ex: -0.25 desce um quarto de bloco
  const yOffset = typeof options.yOffset === "number" ? options.yOffset : -0.25;

  if (!entity || !startBlock || !endBlock) return;

  const startC = startBlock.center();
  const endC = endBlock.center();

  // aplique o offset na trajetória inteira
  const start = { x: startC.x, y: startC.y + yOffset, z: startC.z };
  const end = { x: endC.x, y: endC.y + yOffset, z: endC.z };

  const dir = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (dist === 0) {
    try {
      entity.teleport(end);
    } catch { }
    if (options.onArrive) options.onArrive(entity, endBlock);
    return;
  }

  const TPS = 20;
  const totalTicks = Math.max(1, Math.ceil((dist / speed) * TPS));
  let tick = 0;

  const id = mc.system.runInterval(() => {
    try {
      tick += tickStep;
      const t = Math.min(1, tick / totalTicks);

      const pos = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      };

      entity.teleport(pos);

      if (t >= 1) {
        mc.system.clearRun(id);
        if (options.onArrive) options.onArrive(entity, endBlock);
      }
    } catch {
      mc.system.clearRun(id);
    }
  }, tickStep);

  return id;
}

function canAcceptItem(targetBlock, item) {
  try {
    const inv = targetBlock.getComponent("minecraft:inventory")?.container;
    if (!inv || !item) return false;

    const config = blocksConfig(targetBlock);
    const inputSlots = config?.inputSlots ?? []; // fallback se não existir

    for (const i of inputSlots) {
      const slot = inv.getItem(i);
      // slot vazio => cabe
      if (!slot) return true;

      // mesmo item + empilhável + ainda não lotou a pilha
      const sameType = slot.typeId === item.typeId;
      const stackable = slot.isStackable && item.isStackable;
      if (sameType && stackable && slot.amount < slot.maxAmount) {
        return true;
      }
    }
  } catch { }
  return false;
}

function getPullSides(block) {
  const pulls = [];

  for (const side of sides) {
    if (block.permutation.getState(`rc_sd:${side}`) === "pull") {
      pulls.push(side);
    }
  }
  return pulls;
}

function isEntrable(block) {
  return containerBlock.includes(block?.typeId) || blocksConfig(block)?.faces;
}

export const containerBlock = [
  "minecraft:chest",
  "minecraft:furnace",
  "minecraft:lit_furnace",
  "minecraft:barrel",
  "minecraft:hopper",
  "minecraft:dispenser",
];

function getAllSlotsQuantity(block) {
  const inv = block?.getComponent?.("minecraft:inventory");
  const container = inv?.container;
  if (!container) return [];

  return Array.from({ length: container.size }, (_, i) => i);
}

const itemPipeFaces = {
  above: ["itemPipe"],
  below: ["itemPipe"],
  north: ["itemPipe"],
  south: ["itemPipe"],
  west: ["itemPipe"],
  east: ["itemPipe"],
};

const drawerFaces = {
  north: ["itemPipe"],
  south: ["itemPipe"],
  east: ["itemPipe"],
  west: ["itemPipe"],
  above: ["itemPipe"],
  below: ["itemPipe"],
};

export const blocksConfig = (block) => {
  const typeId = typeof block === "string" ? block : block.typeId;

  // pega qualquer drawer automaticamente
  if (typeId.startsWith("rc_sd:") && typeId.includes("_drawer_")) {
    return {
      faces: drawerFaces,
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    };
  }

  const map = {
    "minecraft:chest": {
      faces: itemPipeFaces,
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    },

    "minecraft:furnace": {
      faces: itemPipeFaces,
      outputSlots: [2],
      inputSlots: [0],
    },

    "minecraft:lit_furnace": {
      faces: itemPipeFaces,
      outputSlots: [2],
      inputSlots: [0],
    },

    "rc_sd:pipe": {
      faces: itemPipeFaces,
    },

    "minecraft:barrel": {
      faces: itemPipeFaces,
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    },

    "minecraft:hopper": {
      faces: itemPipeFaces,
    },

    "minecraft:dispenser": {
      faces: itemPipeFaces,
    },
  };

  return map[typeId];
};