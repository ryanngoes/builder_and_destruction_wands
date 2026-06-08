import * as mc from "@minecraft/server";
import * as astraAPI from "../astraAPI.js";
import { StorageQuantityScoreboard } from "../astraAPI.js";
import { pullItemFromDrawer, pushItemToDrawer, drawerCanAcceptItem, getDrawerEntities } from "./storageDrawer.js";

// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

const SIDES = ["north", "south", "east", "west", "above", "below"];
const MOVE_SPEED = 2.4;
const MOVE_Y_OFFSET = -0.3;

export const containerBlock = [
  "minecraft:chest",
  "minecraft:furnace",
  "minecraft:lit_furnace",
  "minecraft:barrel",
  "minecraft:hopper",
  "minecraft:dispenser",
];

/** Retorna true para qualquer drawer do mod */
function isDrawer(block) {
  const id = block?.typeId ?? "";
  return id.startsWith("rc_sd:") && id.includes("_drawer_");
}

/** Retorna true para qualquer bloco que pode receber/enviar itens */
function isContainer(block) {
  return containerBlock.includes(block?.typeId) || isDrawer(block);
}

// ─────────────────────────────────────────────
// Configuração de faces comuns (itemPipe)
// ─────────────────────────────────────────────

const itemPipeFaces = Object.fromEntries(SIDES.map((s) => [s, ["itemPipe"]]));

export const blocksConfig = (block) => {
  const typeId = typeof block === "string" ? block : block?.typeId;
  if (!typeId) return undefined;

  if (typeId.startsWith("rc_sd:") && typeId.includes("_drawer_")) {
    return {
      faces: itemPipeFaces,
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    };
  }

  const allSlots = getAllSlotsQuantity(block);

  const map = {
    "minecraft:chest": { faces: itemPipeFaces, outputSlots: allSlots, inputSlots: allSlots },
    "minecraft:furnace": { faces: itemPipeFaces, outputSlots: [2], inputSlots: [0] },
    "minecraft:lit_furnace": { faces: itemPipeFaces, outputSlots: [2], inputSlots: [0] },
    "rc_sd:pipe": { faces: itemPipeFaces },
    "minecraft:barrel": { faces: itemPipeFaces, outputSlots: allSlots, inputSlots: allSlots },
    "minecraft:hopper": { faces: itemPipeFaces },
    "minecraft:dispenser": { faces: itemPipeFaces },
  };

  return map[typeId];
};

// ─────────────────────────────────────────────
// Componente principal do pipe
// ─────────────────────────────────────────────

export function pipeComponent(data) {
  data.blockComponentRegistry.registerCustomComponent("rc_sd:pipe", {

    onTick: ({ block, dimension }) => {
      const pulls = getPullSides(block);

      for (const side of pulls) {
        let targetBlock;
        try {
          targetBlock = block[side]?.();
        } catch {
          continue; // bloco fora do chunk carregado
        }
        if (!targetBlock) continue;

        // ── Drawer: usa a API própria do drawer ──
        if (isDrawer(targetBlock)) {
          const drawerData = getDrawerEntities(targetBlock);
          if (!drawerData) continue;

          let slotIndex = -1;
          let drawerItem = null;

          for (const vi of drawerData.visualItems) {
            if (!vi?.isValid) continue;
            const qty = StorageQuantityScoreboard.get(vi);
            if (qty <= 0) continue;
            const it = vi.getComponent("minecraft:inventory")?.container?.getItem(0);
            if (it) { slotIndex = Number(vi.nameTag); drawerItem = it; break; }
          }

          if (slotIndex < 0 || !drawerItem) continue;

          const path = findPathForItem(block, drawerItem);
          if (!path[0]) continue;

          const pulled = pullItemFromDrawer(targetBlock, slotIndex);
          if (!pulled) continue;

          spawnPipeVisual(dimension, pulled, targetBlock, block);
          continue;
        }

        // ── Container normal (chest, furnace, barrel…) ──
        const inventory = targetBlock.getComponent("minecraft:inventory");
        if (!inventory) continue;

        const config = blocksConfig(targetBlock);
        const outputSlots = config?.outputSlots ?? [];

        for (const i of outputSlots) {
          const item = inventory.container.getItem(i);
          if (!item) continue;

          const path = findPathForItem(block, item);
          if (!path[0]) continue;

          if (item.amount > 1) {
            const remaining = item.clone();
            remaining.amount = item.amount - 1;
            inventory.container.setItem(i, remaining);
          } else {
            inventory.container.setItem(i, undefined);
          }

          spawnPipeVisual(dimension, item, targetBlock, block);
          break;
        }
      }
    },

    beforeOnPlayerPlace: (event) => {
      event.cancel = true;
      const { block, player } = event;
      const InventoryManager = new astraAPI.InventoryManager(player);
      mc.system.runTimeout(() => {
        event.block.setPermutation(event.permutationToPlace);
        connectBlock(block, false);
        InventoryManager.clearMainhand(1, false);
        block.dimension.playSound('dig.stone', block.center(), { pitch: 1.25 })
      });
    },

    onPlayerBreak: ({ block, dimension }) => {
      disconnectBlock(block, false);
      const center = block.center();

      const items = dimension.getEntities({
        location: center,
        maxDistance: 0.8,
        type: "rc_sd:pipe_visual_item",
      });

      for (const item of items) {
        const drop = item.getComponent("minecraft:inventory")?.container?.getItem(0);
        if (drop) dimension.spawnItem(drop, center);
        item.remove();
      }
    },
  });
}

// ─────────────────────────────────────────────
// BFS: encontra caminho até container que aceita o item
// ─────────────────────────────────────────────

function findPathForItem(startBlock, item, maxNodes = 512) {
  const queue = [startBlock];
  let qi = 0;
  const parentMap = new Map();
  const blockMap = new Map();

  const startKey = blockKey(startBlock);
  parentMap.set(startKey, null);
  blockMap.set(startKey, startBlock);

  while (qi < queue.length) {
    if (qi >= maxNodes) return [];

    const currentBlock = queue[qi++];
    const currentKey = blockKey(currentBlock);

    for (const face of SIDES) {
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

      const opp = astraAPI.invertFace(face);
      if (isItemduct(neighbor) && isFaceBlocked(neighbor, opp)) continue;

      if (containerBlock.includes(neighbor.typeId) || isDrawer(neighbor)) {
        if (neighborKey !== startKey && canAcceptItem(neighbor, item)) {
          parentMap.set(neighborKey, currentKey);
          blockMap.set(neighborKey, neighbor);
          return buildPath(parentMap, blockMap, neighborKey);
        }
        continue; // container que não aceita: não expande
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

// ─────────────────────────────────────────────
// BFS: re-encontra caminho de volta ao bloco de origem
// ─────────────────────────────────────────────

function reFindPathForItem(startBlock, targetLocation, item, maxNodes = 512) {
  const queue = [startBlock];
  let qi = 0;
  const parentMap = new Map();
  const blockMap = new Map();

  const startKey = blockKey(startBlock);
  parentMap.set(startKey, null);
  blockMap.set(startKey, startBlock);

  const targetBlock = startBlock.dimension.getBlock(targetLocation);
  if (!targetBlock) return [];
  const targetKey = blockKey(targetBlock);

  while (qi < queue.length) {
    if (qi >= maxNodes) return [];

    const currentBlock = queue[qi++];
    const currentKey = blockKey(currentBlock);

    for (const face of SIDES) {
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

      if (neighborKey === targetKey) {
        if (neighbor.typeId === "minecraft:air" || (!containerBlock.includes(neighbor.typeId) && !isDrawer(neighbor))) return [];
        parentMap.set(neighborKey, currentKey);
        blockMap.set(neighborKey, neighbor);
        return buildPath(parentMap, blockMap, neighborKey);
      }

      if (containerBlock.includes(neighbor.typeId) || isDrawer(neighbor)) continue; // não expande containers que não são o target

      if (isItemduct(neighbor)) {
        parentMap.set(neighborKey, currentKey);
        blockMap.set(neighborKey, neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [];
}

// ─────────────────────────────────────────────
// Utilitários de bloco
// ─────────────────────────────────────────────

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

/** Acesso seguro a vizinho: protege contra chunk descarregado */
function getNeighborSafe(block, face) {
  try {
    return block?.[face]?.();
  } catch {
    return undefined;
  }
}

/** Face bloqueada para passagem de BFS (pull ou desconectado) */
function isFaceBlocked(block, face) {
  try {
    const state = block?.permutation?.getState?.(`rc_sd:${face}`);
    return state === "pull" || state === "false";
  } catch {
    return false;
  }
}

/** Face impassável apenas quando desconectada (false); pull ainda passa */
function isFaceImpassable(block, face) {
  try {
    const state = block?.permutation?.getState?.(`rc_sd:${face}`);
    return state === "false";
  } catch {
    return false;
  }
}

function getPullSides(block) {
  return SIDES.filter(
    (side) => block.permutation.getState(`rc_sd:${side}`) === "pull"
  );
}

function canAcceptItem(targetBlock, item) {
  // Drawer: delega para a API dedicada
  if (isDrawer(targetBlock)) {
    return drawerCanAcceptItem(targetBlock, item);
  }

  // Container normal
  try {
    const inv = targetBlock.getComponent("minecraft:inventory")?.container;
    if (!inv || !item) return false;

    const inputSlots = blocksConfig(targetBlock)?.inputSlots ?? [];
    for (const i of inputSlots) {
      const slot = inv.getItem(i);
      if (!slot) return true;
      if (
        slot.typeId === item.typeId &&
        slot.isStackable &&
        item.isStackable &&
        slot.amount < slot.maxAmount
      ) {
        return true;
      }
    }
  } catch { /* inventário indisponível */ }
  return false;
}

function getAllSlotsQuantity(block) {
  const container = block?.getComponent?.("minecraft:inventory")?.container;
  if (!container) return [];
  return Array.from({ length: container.size }, (_, i) => i);
}

// ─────────────────────────────────────────────
// Conexão / desconexão de blocos
// ─────────────────────────────────────────────

export function connectBlock(block, once = false) {
  const blockConfig = blocksConfig(block);

  for (const face of SIDES) {
    const faceBlock = getNeighborSafe(block, face);
    if (!faceBlock) continue;

    const stateName = `rc_sd:${face}`;
    const currentState = block.permutation.getState(stateName);

    const blockProperty = blockConfig?.faces?.[astraAPI.trueFace(block, face)];
    const neighborFace = astraAPI.invertFace(face);
    const neighborProperty = blocksConfig(faceBlock)?.faces?.[astraAPI.trueFace(faceBlock, neighborFace)];

    const hasCommonProperty =
      blockProperty &&
      neighborProperty &&
      blockProperty.some((prop) => neighborProperty.includes(prop));

    if (hasCommonProperty) {
      if (isItemduct(block) && currentState !== "pull") {
        astraAPI.setPermutation(block, stateName, "true");
      }
      if (!once) connectBlock(faceBlock, true);
    } else if (isItemduct(block)) {
      if (currentState !== "pull") {
        astraAPI.setPermutation(block, stateName, "false");
      }
    }
  }
}

export function disconnectBlock(block, once = false) {
  for (const face of SIDES) {
    const faceBlock = getNeighborSafe(block, face);
    if (!faceBlock) continue;

    const neighborFace = astraAPI.invertFace(face);
    const neighborProperty =
      blocksConfig(faceBlock)?.faces?.[astraAPI.trueFace(faceBlock, neighborFace)];

    if (isItemduct(block)) {
      const currentState = block.permutation.getState(`rc_sd:${face}`);

      if (neighborProperty?.includes("itemPipe")) {
        if (currentState === "false") {
          astraAPI.setPermutation(block, `rc_sd:${face}`, "true");
        }
      } else {
        astraAPI.setPermutation(block, `rc_sd:${face}`, "false");
      }
    }

    if (neighborProperty?.includes("itemPipe") && !once) {
      disconnectBlock(faceBlock, true);
    }
  }
}

// ─────────────────────────────────────────────
// Spawn da entidade visual no pipe
// ─────────────────────────────────────────────

function spawnPipeVisual(dimension, item, fromBlock, toBlock) {
  const itemType = astraAPI.itemType(fromBlock, item)
  const numberToType = astraAPI.typeToNumber(itemType);

  const replace =
    itemType === "fake"
      ? `rc_sd:${item.typeId.split(":")[1]}_item_fake`
      : item.typeId;

  const spawnPos = {
    x: fromBlock.center().x,
    y: fromBlock.location.y + 0.2,
    z: fromBlock.center().z,
  };

  const itemEntity = dimension.spawnEntity("rc_sd:pipe_visual_item", spawnPos);
  itemEntity.setDynamicProperty("rc_sd:initial_block", fromBlock.location);
  itemEntity.setProperty("rc_sd:visual_type", numberToType);

  mc.system.runTimeout(
    () => dimension?.playSound("random.pop", toBlock.center(), { pitch: 0.65, volume: 0.035 }),
    5
  );

  mc.system.runTimeout(
    () =>
      itemEntity.runCommand(
        `replaceitem entity @s slot.weapon.${itemType === "item" ? "mainhand" : "offhand"} 0 ${replace}`
      ),
    1
  );

  // Coloca o item no inventário da entidade visual (amount = 1)
  const entityInventory = itemEntity.getComponent("minecraft:inventory");
  const singleItem = item.clone();
  singleItem.amount = 1;
  entityInventory.container.setItem(0, singleItem);

  moveEntity(itemEntity, fromBlock, toBlock, { speed: MOVE_SPEED, yOffset: MOVE_Y_OFFSET });

  return itemEntity;
}



function moveEntity(entity, startBlock, endBlock, options = {}) {
  const speed = typeof options.speed === "number" ? Math.max(0.01, options.speed) : 2;
  const tickStep = typeof options.tickStep === "number" ? Math.max(1, options.tickStep | 0) : 1;
  const yOffset = typeof options.yOffset === "number" ? options.yOffset : -0.25;

  if (!entity || !startBlock || !endBlock) return;

  const startC = startBlock.center();
  const endC = endBlock.center();
  const start = { x: startC.x, y: startC.y + yOffset, z: startC.z };
  const end = { x: endC.x, y: endC.y + yOffset, z: endC.z };

  const dir = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const dist = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);

  if (dist === 0) {
    try { entity.teleport(end); } catch { /* entidade inválida */ }
    options.onArrive?.(entity, endBlock);
    return;
  }

  const TPS = 20;
  const totalTicks = Math.max(1, Math.ceil((dist / speed) * TPS));
  let tick = 0;

  const id = mc.system.runInterval(() => {
    try {
      tick += tickStep;
      const t = Math.min(1, tick / totalTicks);
      entity.teleport({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      });

      if (t >= 1) {
        mc.system.clearRun(id);
        options.onArrive?.(entity, endBlock);
      }
    } catch {
      mc.system.clearRun(id); // entidade removida durante a animação
    }
  }, tickStep);

  return id;
}

// ─────────────────────────────────────────────
// Script event: atualiza rota da entidade visual
// ─────────────────────────────────────────────

mc.system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: entity }) => {
  if (id !== "rc_sd:pipe_visual_item") return;
  if (!entity?.isValid) return;

  const block = entity.dimension.getBlock(entity.location);
  const inventory = entity.getComponent("minecraft:inventory");
  const item = inventory?.container?.getItem(0);

  // Chunk descarregado: bloco indisponível, não há como continuar
  if (!block) {
    if (entity.isValid) entity.remove();
    return;
  }

  // Item chegou a um bloco de ar (pipe quebrado): dropa e remove
  if (block.typeId === "minecraft:air") {
    if (item) block.dimension.spawnItem(item, block.center());
    entity.remove();
    return;
  }

  // Se a entidade pousou num drawer: deposita via API do drawer e remove
  if (isDrawer(block)) {
    if (item) {
      const accepted = pushItemToDrawer(block, item);
      if (!accepted && entity.isValid) {
        // Sem espaço no drawer: dropa o item no chão
        block.dimension.spawnItem(item, block.center());
      }
    }
    if (entity.isValid) entity.remove();
    return;
  }

  // Se a entidade pousou num container normal: deposita e remove
  if (containerBlock.includes(block.typeId)) {
    const containerInv = block.getComponent("minecraft:inventory")?.container;
    if (item && containerInv) containerInv.addItem(item);
    if (entity.isValid) entity.remove();
    return;
  }

  const path = findPathForItem(block, item);

  if (path[1] && entity.isValid) {
    // Avança pelo caminho encontrado
    const nextBlock = entity.dimension.getBlock(path[1].location);
    moveEntity(entity, block, nextBlock, { speed: MOVE_SPEED, yOffset: MOVE_Y_OFFSET });
  } else {
    // Sem caminho à frente: tenta voltar ao bloco de origem
    const rePath = reFindPathForItem(
      block,
      entity.getDynamicProperty("rc_sd:initial_block"),
      item
    );
    if (rePath[1] && entity.isValid) {
      const nextBlock = entity.dimension.getBlock(rePath[1].location);
      moveEntity(entity, block, nextBlock, { speed: MOVE_SPEED, yOffset: MOVE_Y_OFFSET });
    }
  }
});
