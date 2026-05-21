import * as mc from "@minecraft/server";
import * as astraAPI from "../astraAPI.js";

const sides = ["north", "south", "east", "west", "above", "below"];

export function pipeComponent(data) {
  data.blockComponentRegistry.registerCustomComponent("rc_sd:pipe", {
    onTick: ({ block, dimension }, { params }) => {
      const pulls = getPullSides(block);

      for (const side of pulls) {
        const pos = directionToPosition(block, side);

        const targetBlock = dimension.getBlock({
          x: pos.x,
          y: pos.y,
          z: pos.z,
        });

        const inventory = targetBlock.getComponent("minecraft:inventory");
        if (!inventory) continue;

        const config = blocksConfig(targetBlock);
        const outputSlots = config?.outputSlots ?? []; // fallback se não existir

        for (const i of outputSlots) {
          const item = inventory.container.getItem(i);
          if (!item) continue;

          const itmeType = API.getItemType(block, item);
          const itemTypeNumber = API.typeToNumber(itmeType);

          const replace =
            itmeType === "fake"
              ? `rc_sd:${item.typeId.split(":")[1]}_item_fake`
              : item.typeId;

          if (!findPathForItem(block, item)[0]) return;

          // spawn do item no centro do bloco de origem
          const itemEntity = dimension.spawnEntity("rc_sd:item", {
            x: targetBlock.center().x,
            y: pos.y + 0.2,
            z: targetBlock.center().z,
          });

          const inventoryItem = itemEntity.getComponent(
            "minecraft:inventory"
          );
          const container = inventoryItem.container;
          const newItem = item.clone();
          newItem.amount = 1;

          //if(itmeType === item)
          //itemEntity.setProperty('rc_sd:type_item', itemTypeNumber)

          mc.system.runTimeout(
            () =>
              itemEntity.runCommand(
                `replaceitem entity @s slot.weapon.${itmeType === "item" ? "mainhand" : "offhand"
                } 0 ${replace}`
              ),
            1
          );

          astraAPI.moveItemFromContainers(
            inventory.container,
            i,
            container,
            0,
            1
          );

          moveEntity(itemEntity, targetBlock, block, {
            speed: 2.7,
            yOffset: -0.3,
          });

          break;
        }
      }

    },
    beforeOnPlayerPlace: (event, { params }) => {
      event.cancel = true;
      const block = event.block;
      mc.system.runTimeout(() => {
        event.block.setPermutation(event.permutationToPlace);
        connectBlock(block, false);
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

function getPullSides(block) {
  const pulls = [];

  for (const side of sides) {
    if (block.permutation.getState(`rc_sd:${side}`) === "pull") {
      pulls.push(side);
    }
  }
  return pulls;
}

function directionToPosition(block, direction) {
  const { x, y, z } = block.location;

  switch (direction) {
    case "north":
      return { x, y, z: z - 1 };
    case "south":
      return { x, y, z: z + 1 };
    case "west":
      return { x: x - 1, y, z };
    case "east":
      return { x: x + 1, y, z };
    case "above":
      return { x, y: y + 1, z };
    case "below":
      return { x, y: y - 1, z };
    default:
      return { x, y, z }; // se não conhecer a direção, retorna a própria posição
  }
}

function findPathForItem(startBlock, item) {
  // "queue" aqui é uma FILA de caminhos.
  // Cada elemento é um array: [bloco1, bloco2, bloco3...]
  // Começamos com um caminho que só tem o bloco inicial.
  const queue = [[startBlock]];

  // Índice da fila (pra não usar shift(), que é mais pesado)
  // qi aponta para o "próximo caminho a processar".
  let qi = 0;

  // visited guarda os dutos já visitados, para não andar em loop infinito.
  // Usamos uma string com x/y/z/dimension pra virar uma chave única.
  const visited = new Set();
  visited.add(
    `${startBlock.x}/${startBlock.y}/${startBlock.z}/${startBlock.dimension.id}`
  );

  // Enquanto ainda existirem caminhos para explorar...
  while (qi < queue.length) {
    // Pegamos o próximo caminho da FILA (FIFO).
    // Isso faz a busca ser BFS: primeiro explora os mais curtos.
    const currentPath = queue[qi++];

    // O bloco atual é o último do caminho.
    const currentBlock = currentPath[currentPath.length - 1];

    // Testamos todos os lados possíveis (north/south/east/west/above/below)
    for (const face of sides) {
      // Se o bloco atual é um duto e esse lado está marcado como "pull",
      // significa que esse lado é ENTRADA (puxa item do vizinho).
      // Então a gente NÃO deve mandar o item por esse lado.
      if (isItemduct(currentBlock) && isFacePull(currentBlock, face)) continue;

      // Pega o bloco vizinho nessa face.
      const neighbor = currentBlock[face]?.();
      if (!neighbor) continue;

      // Chave única do vizinho (pra controlar visited).
      const key = `${neighbor.x}/${neighbor.y}/${neighbor.z}/${neighbor.dimension.id}`;

      // Se já visitamos esse bloco/duto, pula pra evitar loop.
      if (visited.has(key)) continue;

      // Face oposta (ex.: north <-> south) para checar o "pull" no vizinho.
      const opp = racoAPI.invertFace[face];

      // Se o vizinho é um duto e a face oposta dele é "pull",
      // significa que esse vizinho está puxando do bloco atual.
      // Logo não faz sentido empurrar item pra lá (fluxo contrário).
      if (isItemduct(neighbor) && isFacePull(neighbor, opp)) continue;

      // Se o vizinho for um container (baú/máquina/etc)...
      if (containerBlock.includes(neighbor.typeId)) {
        // Evita considerar o próprio bloco inicial como destino.
        // (Caso startBlock também seja container em algumas situações)
        const isSame =
          neighbor.location.x === startBlock.location.x &&
          neighbor.location.y === startBlock.location.y &&
          neighbor.location.z === startBlock.location.z &&
          neighbor.dimension.id === startBlock.dimension.id;

        // Se NÃO for o mesmo bloco e o container puder aceitar o item,
        // então achamos um destino válido e retornamos o caminho completo.
        // Como é BFS, esse será o caminho MAIS CURTO encontrado até um destino válido.
        if (!isSame && canAcceptItem(neighbor, item)) {
          return [...currentPath, neighbor];
        }
      }

      // Se o vizinho for um duto, continuamos expandindo a busca por ele.
      if (isItemduct(neighbor)) {
        // Marca como visitado NO MOMENTO em que entra na fila,
        // isso evita enfileirar o mesmo duto várias vezes por caminhos diferentes.
        visited.add(key);

        // Enfileira um novo caminho: caminho atual + vizinho
        queue.push([...currentPath, neighbor]);
      }
    }
  }

  // Se a fila acabou e não encontramos container válido, não existe caminho.
  return [];
}

function isItemduct(block) {
  return block?.typeId === "rc_sd:glass_pipe";
}

function isFacePull(block, face) {
  try {
    return block?.permutation?.getState?.(`rc_sd:${face}`) === "pull";
  } catch {
    return false;
  }
}

const faces = ["above", "below", "north", "south", "west", "east"];

export function connectBlock(block, once = false) {
  let found = false
  for (const face of faces) {
    const faceBlock = block[face]()

    const blockProperty = blocksConfig(block)?.faces?.[face]

    const neighborFace = astraAPI.invertFace(face);

    const blockType = blocksConfig(faceBlock)?.type;
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
        astraAPI.setPermutation(block, `rc_sd:${face}`, "true");
      }
      if (!once) {
        connectBlock(faceBlock, true)
      }
    } else if (block?.typeId.includes("pipe")) {
      astraAPI.setPermutation(block, `rc_sd:${face}`, "false")
    };
  }
}

function disconnectBlock(block, once) {
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
    if (id == "rc_sd:move" && entity) {
      const block = entity.dimension.getBlock(entity.location);
      const inventory = entity.getComponent("minecraft:inventory");
      const container = inventory.container;
      const item = container.getItem(0);
      const path = findPathForItem(block, item);
      if (path[1]) {
        const nextBlock = entity.dimension.getBlock({
          x: path[1].x,
          y: path[1].y,
          z: path[1].z,
        });
        //console.warn(JSON.stringify(path))
        moveEntity(entity, block, nextBlock, { speed: 2.5, yOffset: -0.3 });
        if (block.typeId === "minecraft:air") {
          block.dimension.spawnItem(item, block.center());
          entity.remove();
        }
        if (containerBlock.includes(nextBlock.typeId)) {
          mc.system.runTimeout(() => {

            const inventoryBlock = nextBlock.getComponent(
              "minecraft:inventory"
            );
            const containerBlock = inventoryBlock.container;
            containerBlock.addItem(item);
            entity?.remove();
          }, 10);
        }
      } else console.warn("nao tem ");
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

export const blocksConfig = (block) => {
  const typeId = typeof block === "string" ? block : block.typeId;

  const map = {
    "minecraft:chest": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    },

    "minecraft:furnace": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
      outputSlots: [2],
      inputSlots: [0],
    },

    "minecraft:lit_furnace": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
      outputSlots: [2],
      inputSlots: [0],
    },

    "rc_sd:pipe": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
    },

    "minecraft:barrel": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
      outputSlots: getAllSlotsQuantity(block),
      inputSlots: getAllSlotsQuantity(block),
    },

    "minecraft:hopper": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
    },

    "minecraft:dispenser": {
      faces: {
        above: ["itemPipe"],
        below: ["itemPipe"],
        north: ["itemPipe"],
        south: ["itemPipe"],
        west: ["itemPipe"],
        east: ["itemPipe"],
      },
    },

    "minecraft:diamond_block": {
      faces: {
        north: ["itemduct"],
        south: ["itemduct"],
        east: ["itemduct"],
        west: ["itemduct"],
        above: ["itemduct"],
        below: ["itemduct"],
      },
    },
  };

  return map[typeId];
};