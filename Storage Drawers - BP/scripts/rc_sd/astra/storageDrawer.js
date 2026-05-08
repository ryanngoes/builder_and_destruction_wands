import * as mc from '@minecraft/server';
import * as API from './API.js';
import FaceSelectionPlains from './faceSelection.js';

function rotate(x, y, angle) {
  const rad = angle * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx = Math.round(x * cos - y * sin);
  const ry = Math.round(x * sin + y * cos);

  return { x: rx, y: ry };
}

function getAndCleanStorageLocations(entityController, dimension) {
  const storageLocationsStr = entityController.getDynamicProperty("rc_sd:storageLocations") || "[]";
  const storageLocations = JSON.parse(storageLocationsStr);

  // Filtra apenas localizações válidas (blocos que existem e são drawers)
  const validLocations = storageLocations.filter(location => {
    const block = dimension.getBlock(location);
    return block && block.typeId.includes('_drawer');
  });

  // Atualiza a dynamic property se houve mudanças
  if (validLocations.length !== storageLocations.length) {
    entityController.setDynamicProperty("rc_sd:storageLocations", JSON.stringify(validLocations));
  }

  return validLocations;
}

// Função para mostrar indicadores visuais
function showStorageIndicators(validLocations, dimension) {
  validLocations.forEach(location => {
    const block = dimension.getBlock(location);
    dimension.getEntities({
      location: { x: location.x + 0.5, y: location.y, z: location.z + 0.5 },
      type: `rc_sd:block_selection`,
      maxDistance: 0.5
    })[0]?.remove(); // Remove indicador existente, se houver
    dimension.spawnEntity(`rc_sd:block_selection`, {
      x: location.x + 0.5,
      y: location.y,
      z: location.z + 0.5
    });
  });
}

const isFrontFace = (block, face) => block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();

mc.system.beforeEvents.startup.subscribe((data) => {
  data.blockComponentRegistry.registerCustomComponent("rc_sd:storage_config", {
    beforeOnPlayerPlace({ block, dimension, permutationToPlace, player }, { params }) {
      if (block.typeId === 'rc_sd:ender_drawer') return;

      const Block = permutationToPlace.getItemStack();

      const equipment = player.getComponent("equippable");
      const itemStack = equipment.getEquipment("Mainhand");
      const lores = itemStack.getLore();
      if (!lores || lores.length === 0) return;

      // Define o tipo do bloco pelo typeId
      let type = "1x1";
      if (Block.typeId.includes("drawer_4")) type = "2x2";
      else if (Block.typeId.includes("drawer2")) type = "1x2";
      else if (Block.typeId.includes("drawer_1x1")) type = "1x1";
      else if (Block.typeId.includes("ender_drawer")) type = "ender";

      // Dicionário com número de slots
      const slotCounts = {
        "1x1": 1,
        "1x2": 2,
        "2x2": 4,
        "ender": 1
      };
      const slotCount = slotCounts[type];
      if (!slotCount) return;

      mc.system.runTimeout(() => {
        const center = {
          x: block.location.x + 0.5,
          y: block.location.y + 0.5,
          z: block.location.z + 0.5
        };

        const itemEntities = dimension.getEntities({
          location: center,
          maxDistance: 0.6,
          families: ['rc_sd:item']
        });

        const inventoryEntity = dimension.getEntities({
          location: center,
          maxDistance: 0.6,
          type: 'rc_sd:storage_inventory'
        })[0];

        if (!inventoryEntity) return;

        for (let i = 0; i < slotCount; i++) {
          const lore = lores[i];
          if (!lore || lore.includes("*")) continue;

          // Remove §r§8 prefix
          const cleaned = lore.replace("§r§8", "");
          const [typeId, qtyStr] = cleaned.split(": ").map(s => s.trim());
          const quantity = parseInt(qtyStr);
          if (!typeId || isNaN(quantity)) continue;



          const itemEntity = type === "1x1" || type === "ender"
            ? itemEntities[0]
            : itemEntities.find(e => e.typeId === `rc_sd:item_${i}`);

          if (!itemEntity) continue;

          const itemStack = new mc.ItemStack(typeId, 1);
          itemEntity.getComponent("inventory").container.setItem(0, itemStack);
          itemEntity.setDynamicProperty(`rc_sd:quantity_${i}`, quantity);

          // Opcional: também aplica ajuste visual
          const itemType = API.getItemType(block, itemStack);
          const adjust = API.typeToNumber(itemType);
          itemEntity.setProperty("rc_sd:ajust_item", adjust);

          // Se for ender, adiciona propriedades extras
          if (type === "ender") {
            itemEntity.setDynamicProperty("rc_sd:ajust_item", adjust);
            itemEntity.setDynamicProperty("rc_sd:item_typeId", typeId);
          }

          // Opcional: aplicar item visual
          const replaceId = itemType === "fake"
            ? `rc_sd:${typeId.split(":")[1]}_item_fake`
            : typeId;

          const inventorySlot = API.getInventorySlot(type, i);
          if (inventorySlot !== undefined) {
            mc.system.runTimeout(() => {
              itemEntity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
              API.setItemSlot(replaceId, inventorySlot, inventoryEntity);
              API.setPermutation(block, "rc_sd:has_item", true)
            }, 1);
          }
        }
      }, 1);
    },
    onPlayerBreak({ block, dimension, brokenBlockPermutation, player }, { params }) {
      if (block.typeId === 'rc_sd:ender_drawer') {
        const entity = dimension.getEntities({
          location: block.center(),
          families: ['rc_sd:item'],
          maxDistance: 0.5
        })[0];
        API.deleteFrequency(entity.getDynamicProperty("rc_sd:enderDrawerFrequency"))
        return
      }
      if (!brokenBlockPermutation.getState("rc_sd:has_item") || player.getGameMode() === "Creative") return;

      const Block = brokenBlockPermutation.getItemStack();
      let type = "1x1"; // padrão de fallback

      if (Block.typeId.includes("drawer_4")) type = "2x2";
      else if (Block.typeId.includes("drawer2")) type = "1x2";
      else if (Block.typeId.includes("drawer_1x1")) type = "1x1";
      else if (Block.typeId.includes("ender_drawer")) type = "ender";


      // Define número de slots baseado no tipo do drawer
      const slotCounts = {
        "1x1": 1,
        "1x2": 2,
        "2x2": 4,
        "ender": 1
      };

      const slotCount = slotCounts[type];
      if (!slotCount) return;

      const lores = [];

      for (let i = 0; i < slotCount; i++) {
        const entityType = type === "1x1" || type === "ender"
          ? "rc_sd:item"
          : `rc_sd:item_${i}`;

        const entity = dimension.getEntities({
          location: block.center(),
          type: entityType,
          maxDistance: 0.5
        })[0];

        if (!entity) {
          lores.push(`§r§8*`); // Slot vazio (sem entidade)
          continue;
        }

        const container = entity.getComponent("inventory").container;
        const item = container.getItem(0);

        if (!item || item.typeId === "rc_sd:air") {
          lores.push(`§r§8*`);
        } else {
          const quantityKey = entity.getDynamicPropertyIds().find(k => k.startsWith("rc_sd:quantity_"));
          const quantity = quantityKey ? entity.getDynamicProperty(quantityKey) : 0;
          lores.push(`§r§8${item.typeId}: ${quantity}`);
        }
      }

      // Adiciona lores e dropa o bloco com elas
      const storageItem = new mc.ItemStack(Block.typeId, 1);
      storageItem.setLore(lores);
      dimension.spawnItem(storageItem, block.location);
    },
    onTick({ block, dimension }, { params }) {

      hopperSystem(block)

      const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
      const amountPerSlot = config.amount_per_slot;

      const entity = dimension.getEntities({
        location: block.center(),
        type: 'rc_sd:storage_inventory',
        maxDistance: 0.5
      })[0];

      const limit = API.getStorageLimit(block, amountPerSlot, entity, entity.getComponent("inventory").container);

      const slotEntities = dimension.getEntities({
        location: block.center(),
        families: ['rc_sd:item'],
        maxDistance: 0.5
      })

      if (!entity) return;

      const inventory = entity.getComponent("inventory").container;

      // Verifica se o bloco tem o modo de coleta ativado
      let foundCollector = false;
      for (let x = 0; x < inventory.size; x++) {
        const item = inventory.getItem(x);
        if (item && item.typeId === "rc_sd:collector_utility") {
          API.setPermutation(block, 'rc_sd:collector_upgrade', true);
          foundCollector = true;
          break;
        }
      }

      if (!foundCollector) {
        API.setPermutation(block, 'rc_sd:collector_upgrade', false);
        return;
      }


      if (block.permutation.getState("rc_sd:collect_utility") === false) return;

      const nearbyItems = dimension.getEntities({
        location: block.center(),
        type: "minecraft:item",
        maxDistance: 3
      });

      for (const drop of nearbyItems) {

        const droppedItem = drop.getComponent("minecraft:item")?.itemStack;
        for (const slotEntity of slotEntities) {
          const inventory = slotEntity.getComponent("inventory").container;
          const invItem = inventory.getItem(0);
          const quantityKey = slotEntity.getDynamicPropertyIds().find(key => key.startsWith("rc_sd:quantity_"));
          const quantity = quantityKey ? slotEntity.getDynamicProperty(quantityKey) : 0;

          if (!invItem) continue;

          if (API.compareItems(invItem, droppedItem) && quantity < limit) {
            slotEntity.setDynamicProperty(quantityKey, quantity + 1)

            if (droppedItem.amount > 1) {

              const singleItem = droppedItem.clone();
              singleItem.amount -= 1
              const entity = dimension.spawnItem(singleItem, drop.location);
              entity.clearVelocity()
              drop.remove()

            } else {
              drop.remove();
            }

            break
          }
        }
      }
    },
    onPlace: ({ block, dimension }, { params }) => {
      const location = block.center();

      const config = block.getComponent("rc_sd:storage_config")?.customComponentParameters.params;
      const type = config?.type; // "1x1", "1x2", "2x2", "ender"

      const offsets = {
        "ender": [[-1, 31, 0.5]],
        "1x1": [[-1, 31, 0.5]],
        "1x2": [[-1, 48.5, -13.6], [-1, 16.5, -13.6]],
        "2x2": [[16, 48.5, -13.6], [-17, 48.5, -13.6], [16, 16.5, -13.6], [-17, 16.5, -13.6]]
      };

      const angle = API.directionToAngle(block.permutation.getState("minecraft:cardinal_direction"));

      const typeOffsets = offsets[type];
      if (!typeOffsets) return;

      for (let i = 0; i < typeOffsets.length; i++) {
        const offset = typeOffsets[i];
        const rotated = rotate(offset[0], offset[2], angle); // x, z

        const entityLocation = {
          x: location.x + rotated.x / 64.0,
          y: location.y - 0.5 + offset[1] / 64.0,
          z: location.z + rotated.y / 64.0,
        };

        let entityType;
        if (type === "ender" || type === "1x1") {
          entityType = "rc_sd:item";
        } else {
          entityType = `rc_sd:item_${i}`;
        }

        // Checa se a entidade já existe no local
        const existing = dimension.getEntities({
          location: location,
          type: entityType,
          maxDistance: 0.5
        })[0];

        if (!existing) {
          const entity = dimension.spawnEntity(entityType, entityLocation);
          entity.setProperty("rc_sd:rotation_y", angle);
          entity.setDynamicProperty("rc_sd:ajust_item", 0);
          const currentItem = entity.getComponent("inventory").container.getItem(0);
          if (type === "ender") {

            const frequency = API.getRandomItems(API.itemsList, 6);
            const frequencyKey = JSON.stringify(frequency);

            entity.setDynamicProperty("rc_sd:enderDrawerFrequency", frequencyKey);

            let stored = mc.world.getDynamicProperty("rc_sd:WorldFrequency");
            let frequencyData = stored ? JSON.parse(stored) : {};

            if (!frequencyData[frequencyKey]) {
              frequencyData[frequencyKey] = {
                quantity: 0,
                ajust_item: 0,
                item: API.serializeItem(new mc.ItemStack("rc_sd:air"))
              };
            }
            mc.world.setDynamicProperty("rc_sd:WorldFrequency", JSON.stringify(frequencyData));
          }
        }
      }
      const id = block.typeId.split(":")[1]
      const parts = id.split("_")
      const item = `rc_sd:${parts[0]}_front_${parts[2]}`;

      dimension.runCommand(`summon rc_sd:storage_inventory tile.rc_sd:drawer.name ${block.location.x} ${block.location.y + 0.5} ${block.location.z}`);

      const entity = dimension.getEntities({
        location: block.center(),
        type: 'rc_sd:storage_inventory',
        maxDistance: 0.5
      })[0];

      const entities = block.dimension.getEntities({
        location: block.center(),
        families: ['rc_sd:item'],
        maxDistance: 0.5
      });

      if (block.typeId !== "rc_sd:ender_drawer") entity.getComponent("inventory").container.setItem(0, new mc.ItemStack(item))

      for (let i = 1; i < 8; i++) {
        API.setItemSlot("rc_sd:air", i, entity);
      }

      for (const entity of entities) {
        API.setItemSlot("rc_sd:air", 0, entity);
      }

    },
    onPlayerInteract: ({ block, face, faceLocation, player, dimension }, { params }) => {
      const equipment = player.getComponent("equippable");
      const itemStack = equipment.getEquipment("Mainhand");
      const itemStackSlot = equipment.getEquipmentSlot(mc.EquipmentSlot.Mainhand);
      const inventory = player.getComponent("inventory").container;

      if (itemStack?.typeId === 'rc_sd:linking_tool') {

        const lore = itemStack.getLore() || [];
        const loreIndex = lore.findIndex(l => l.startsWith("§r§eLinking Action:"));
        const isCurrentlyAdd = lore[loreIndex].includes("§tAdd");

        const controllerLocation = itemStack.getDynamicProperty("rc_sd:controllerLocation");

        if (!controllerLocation) {
          player.onScreenDisplay.setActionBar('§cNo controller configured! Right-click a Storage Controller first');
          return;
        }

        // Busca a entidade do controller
        const entityController = dimension.getEntities({
          location: { x: controllerLocation.x + 0.5, y: controllerLocation.y + 0.5, z: controllerLocation.z + 0.5 },
          type: `rc_sd:storage_inventory`,
          maxDistance: 0.5
        })[0];

        if (!entityController) {
          player.onScreenDisplay.setActionBar('§cController not found! Make sure it is placed correctly');
          return;
        }

        const controllerArea = entityController.getDynamicProperty("rc_sd:controllerArea") || 8;

        // Verifica se o bloco clicado está dentro da área de controle (8x8x8)
        if (isInArea(block.location, controllerLocation, controllerArea)) {

          // Pega as localizações atuais dos storages
          const validStorageLocations = getAndCleanStorageLocations(entityController, dimension);
          const locationExists = validStorageLocations.some(loc => compareLocations(loc, block.location));

          let finalLocations = validStorageLocations;
          let message = '';

          if (isCurrentlyAdd) {
            if (!locationExists && block.typeId.includes('_drawer')) {
              finalLocations = [...validStorageLocations, block.location];
              message = '§bLinked drawer to the controller';
            } else if (!block.typeId.includes('_drawer')) {
              player.onScreenDisplay.setActionBar('§cThis block is not a valid drawer!');
              return;
            } else {
              message = '§bDrawer already linked to the controller';
            }
          } else {
            finalLocations = validStorageLocations.filter(loc => !compareLocations(loc, block.location));
            message = '§bRemoved drawer from the controller';

            // Remove indicador do bloco atual
            dimension.getEntities({
              location: block.center(),
              type: `rc_sd:block_selection`,
              maxDistance: 0.5
            })[0]?.remove();
          }

          // Atualiza storage locations se houve mudança
          if (finalLocations.length !== validStorageLocations.length) {
            entityController.setDynamicProperty("rc_sd:storageLocations", JSON.stringify(finalLocations));
          }

          player.onScreenDisplay.setActionBar(message);

          // Mostra todos os indicadores
          showStorageIndicators(finalLocations, dimension);
          dimension.spawnEntity(`rc_sd:block_selection`, {
            x: controllerLocation.x + 0.5,
            y: controllerLocation.y,
            z: controllerLocation.z + 0.5
          });

        }
      } else if (itemStack?.typeId === 'rc_sd:linking_tool_frequency' && block.typeId === "rc_sd:ender_drawer") {
        const entity = dimension.getEntities({
          location: block.center(),
          type: 'rc_sd:item',
          maxDistance: 0.5
        })[0];

        if(entity.getDynamicProperty(`rc_sd:quantity_0`) > 0) {
          player.onScreenDisplay.setActionBar("§cIt is not possible to change the frequency. Remove all items from the drawer")
          player.playSound('note.bass')
          return
        } else player.onScreenDisplay.setActionBar("§bChanged drawer frequency")

        //se for igual, retorna
        if (JSON.stringify(extractFrequencyFromLore(itemStack.getLore())) === entity.getDynamicProperty("rc_sd:enderDrawerFrequency")) return

        entity.setProperty('rc_sd:ajust_item', itemStack.getDynamicProperty('rc_sd:ajust_item'));
        entity.setDynamicProperty('rc_sd:ajust_item', itemStack.getDynamicProperty('rc_sd:ajust_item'));
        entity.setDynamicProperty('rc_sd:enderDrawerFrequency', JSON.stringify(extractFrequencyFromLore(itemStack.getLore())));

      } else if (itemStack?.typeId === 'rc_sd:configuration_tool' && block.typeId !== "rc_sd:ender_drawer") {
        if (block.permutation.getState('rc_sd:lock') === false) API.setPermutation(block, 'rc_sd:lock', true)
        else API.setPermutation(block, 'rc_sd:lock', false)
      }

      if (!player || !isFrontFace(block, face)) return;

      const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
      const type = config.type; // "1x1", "1x2", "2x2", "ender"
      const amountPerSlot = config.amount_per_slot;

      const slotConfigs = {
        "ender": [
          { origin: [1, 1], size: [14, 14] }
        ],
        "1x1": [
          { origin: [1, 1], size: [14, 14] }
        ],
        "1x2": [
          { origin: [1, 1], size: [14, 6] },
          { origin: [1, 9], size: [14, 6] }
        ],
        "2x2": [
          { origin: [1, 1], size: [6, 6] },
          { origin: [9, 0], size: [6, 6] },
          { origin: [1, 9], size: [6, 6] },
          { origin: [9, 9], size: [6, 6] },
        ]
      };

      const slotAreas = slotConfigs[type];
      if (!slotAreas) return;

      const playerGetView = player.getBlockFromViewDirection();

      const slot = new FaceSelectionPlains(...slotAreas).getSelected(playerGetView);

      if (slot === undefined) return;

      const entityType = type === "1x1" || type === "ender"
        ? "rc_sd:item"
        : `rc_sd:item_${slot}`

      const entity = dimension.getEntities({
        location: block.center(),
        type: entityType,
        maxDistance: 0.5
      })[0];

      if (!entity) return;



      const entityInventory = dimension.getEntities({
        location: block.center(),
        type: `rc_sd:storage_inventory`,
        maxDistance: 0.5
      })[0];

      const limit = API.getStorageLimit(block, amountPerSlot, entityInventory, entityInventory.getComponent("inventory").container);

      const quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

      API.doubleClick(player)

      let totalAdded = 0;
      if (itemStack?.typeId === 'rc_sd:linking_tool' || itemStack?.typeId === 'rc_sd:linking_tool_frequency' || itemStack?.typeId === 'rc_sd:configuration_tool') return

      if (quantity < limit) {
        if (itemStack) {
          let slotBonus = 0;
          if (block.typeId.includes("drawer_1x1")) {
            slotBonus = 1;
          } else if (block.typeId.includes("drawer2")) {
            slotBonus = 2;
          } else if (block.typeId.includes("drawer_4")) {
            slotBonus = 4;
          }

          if (((quantity === 0 && block.permutation.getState("rc_sd:lock") === false) || entityInventory.getComponent('inventory').container.getItem(slot + slotBonus)?.typeId === 'rc_sd:air') || quantity === 0 && block.typeId === 'rc_sd:ender_drawer') {
            const getItemType = API.getItemType(block, itemStack);
            const getNUmberItemType = API.typeToNumber(getItemType);

            const replaceId = getItemType === "fake"
              ? `rc_sd:${itemStack.typeId.split(":")[1]}_item_fake`
              : itemStack.typeId;

            const inventorySlot = API.getInventorySlot(type, slot);

            mc.system.runTimeout(() => {
              entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
              if (inventorySlot !== undefined) {
                API.setItemSlot(replaceId, inventorySlot, entityInventory);
              }
            }, 1);

            const newItem = itemStack.clone();
            newItem.amount = 1;
            entity.getComponent("inventory").container.setItem(0, newItem);
            entity.setProperty("rc_sd:ajust_item", getNUmberItemType);
            if (block.typeId === 'rc_sd:ender_drawer') {
            const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
            const frequencyData = API.getFrequencyData(frequency);
            API.setFrequency(frequency, frequencyData.quantity, getNUmberItemType, itemStack)
          }

          }

        }

        if (!player.hasTag("doubleClick")) {
          if (itemStack) {
            if (API.compareItems(entity.getComponent('inventory').container.getItem(0), itemStack)) {
              const spaceLeft = limit - quantity;

              if (itemStack.amount > spaceLeft) {
                totalAdded += spaceLeft;
                itemStack.amount = itemStack.amount - spaceLeft;
                itemStackSlot.setItem(itemStack);
              } else {
                totalAdded += itemStackSlot.amount;
                itemStackSlot.setItem(undefined);
              }
            }
          }
          entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity + totalAdded);
          if (block.typeId === 'rc_sd:ender_drawer') {
            const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
            const frequencyData = API.getFrequencyData(frequency);
            API.setFrequency(frequency, quantity + totalAdded, frequencyData.ajust_item, API.loadInv(frequencyData.item))
          }
        }

        if (player.hasTag("doubleClick")) {
          for (let x = 0; x < inventory.size; x++) {
            const item = inventory.getItem(x);

            if (!item) continue;

            if (API.compareItems(entity.getComponent('inventory').container.getItem(0), item)) {
              const spaceLeft = limit - (quantity + totalAdded);

              if (item.amount > spaceLeft) {
                totalAdded += spaceLeft;
                inventory.setItem(x, new mc.ItemStack(item.typeId, item.amount - spaceLeft));
                break;
              } else {
                totalAdded += item.amount;
                inventory.setItem(x, undefined);
              }
            }
          }
          entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity + totalAdded);
          if (block.typeId === 'rc_sd:ender_drawer') {
            const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
            const frequencyData = API.getFrequencyData(frequency);
            API.setFrequency(frequency, quantity + totalAdded, frequencyData.ajust_item, API.loadInv(frequencyData.item))
          }
        }

        API.playerActionBar(limit, player, entity, entityInventory, slot);
      } else if (quantity >= limit && block.permutation.getState("rc_sd:void_upgrade")) {

        if (!player.hasTag("doubleClick")) {
          if (API.compareItems(entity.getComponent('inventory').container.getItem(0), itemStack)) {
            itemStackSlot.setItem(undefined);
          }
        }

        if (player.hasTag("doubleClick")) {
          for (let x = 0; x < inventory.size; x++) {
            const item = inventory.getItem(x);

            if (!item) continue;

            if (API.compareItems(entity.getComponent('inventory').container.getItem(0), item)) {
              inventory.setItem(x, undefined);
            }
          }
        }
      }

      const itemEntities = dimension.getEntities({
        location: block.center(),
        families: ["rc_sd:item"],
        maxDistance: 0.5
      });

      let hasAnyItem = false;

      for (const entity of itemEntities) {
        const container = entity.getComponent("inventory").container;
        const item = container.getItem(0);
        if (item && item.typeId !== "rc_sd:air") {
          hasAnyItem = true;
          break;
        }
      }
      API.setPermutation(block, "rc_sd:has_item", hasAnyItem);

    }

  })
})

mc.world.afterEvents.entityHitBlock.subscribe(data => {
  const { hitBlock: block, damagingEntity } = data;

  const itemStack = damagingEntity.getComponent("equippable").getEquipment("Mainhand");

  const config = block.getComponent("rc_sd:storage_config")?.customComponentParameters.params;
  const type = config?.type; // "1x1", "1x2", "2x2", "ender"
  const amountPerSlot = config?.amount_per_slot;
  const dimension = block?.dimension;

  if (!block.typeId.includes(`_drawer`) || damagingEntity.typeId !== `minecraft:player`) return;

  if ((itemStack?.typeId === "rc_sd:linking_tool" || itemStack?.typeId === "rc_sd:linking_tool_frequency") && block.typeId === "rc_sd:ender_drawer") {
    const lore = itemStack.getLore();

    const entity = dimension.getEntities({
      location: block.center(),
      type: 'rc_sd:item',
      maxDistance: 0.5
    })[0];

    if (entity) {
      let loreText = []
      for (let x = 0; x < 4; x++) {
        loreText.push(lore[x])
      }
      if (itemStack?.typeId === "rc_sd:linking_tool") itemStack.setDynamicProperty('rc_sd:oldLore', JSON.stringify(loreText));

      // Cria novo item com novo ID
      const newItem = new mc.ItemStack("rc_sd:linking_tool_frequency", 1);

      // Copia todas as dynamicProperties
      const keys = itemStack.getDynamicPropertyIds();
      for (const key of keys) {
        const value = itemStack.getDynamicProperty(key);
        if (value !== undefined) {
          newItem.setDynamicProperty(key, value);
        }
      }

      let frequencyArray = entity.getDynamicProperty("rc_sd:enderDrawerFrequency");

      if (typeof frequencyArray === "string") {
        try {
          frequencyArray = JSON.parse(frequencyArray);
        } catch (e) {
          frequencyArray = [frequencyArray];
        }
      }

      const frequencyLore = ['§r§7Frequency:'];

      if (Array.isArray(frequencyArray)) {
        frequencyArray.forEach(item => {
          frequencyLore.push(`"${item}",`);
        });
      }

      newItem.setLore(frequencyLore);

      newItem.setDynamicProperty('rc_sd:ajust_item', entity.getDynamicProperty("rc_sd:ajust_item") ?? 0)

      // Substitui item na mão ou inventário
      API.updateItem(damagingEntity, newItem);
      damagingEntity.onScreenDisplay.setActionBar("§bStored frequency in the tool");
    }
  }

  const playerGetView = damagingEntity.getBlockFromViewDirection();

  if (!isFrontFace(playerGetView.block, playerGetView.face)) return;

  const slotConfigs = {
    "ender": [
      { origin: [1, 1], size: [14, 14] }
    ],
    "1x1": [
      { origin: [1, 1], size: [14, 14] }
    ],
    "1x2": [
      { origin: [1, 1], size: [14, 6] },
      { origin: [1, 9], size: [14, 6] }
    ],
    "2x2": [
      { origin: [1, 1], size: [6, 6] },
      { origin: [9, 0], size: [6, 6] },
      { origin: [1, 9], size: [6, 6] },
      { origin: [9, 9], size: [6, 6] },
    ]
  };

  const slotAreas = slotConfigs[type];
  if (!slotAreas) return;

  const slot = new FaceSelectionPlains(...slotAreas).getSelected(playerGetView);

  if (slot === undefined) return;

  const entityInventory = damagingEntity.dimension.getEntities({
    location: block.center(),
    type: `rc_sd:storage_inventory`
  })[0];

  const limit = API.getStorageLimit(block, amountPerSlot, entityInventory, entityInventory.getComponent("inventory").container)

  const entityType = type === "1x1" || type === "ender"
    ? "rc_sd:item"
    : `rc_sd:item_${slot}`

  const entity = dimension.getEntities({
    location: block.center(),
    type: entityType,
    maxDistance: 0.5
  })[0];

  const quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

  if (quantity > 0) {
    if (damagingEntity.isSneaking) {
      API.sneakingPull(slot, quantity, damagingEntity, entity, block, entity.getComponent('inventory').container.getItem(0));
    } else {
      API.normalPull(slot, quantity, damagingEntity, entity, block, entity.getComponent('inventory').container.getItem(0));
    }
  } else {
    API.resetStorage(slot, quantity, entity, block);
  }

  const itemEntities = dimension.getEntities({
    location: block.center(),
    families: ["rc_sd:item"],
    maxDistance: 0.5
  });

  let hasAnyItem = false;

  for (const entity of itemEntities) {
    const container = entity.getComponent("inventory").container;
    const item = container.getItem(0);
    if (item && item.typeId !== "rc_sd:air") {
      hasAnyItem = true;
      break;
    } else hasAnyItem = false
  }
  API.setPermutation(block, "rc_sd:has_item", hasAnyItem);

  API.playerActionBar(limit, damagingEntity, entity, entityInventory, slot);

});

mc.world.beforeEvents.playerBreakBlock.subscribe(data => {
  const { block, player } = data;

  const itemStack = player.getComponent("equippable").getEquipment("Mainhand");

  if ((itemStack?.typeId === "rc_sd:linking_tool" || itemStack?.typeId === "rc_sd:linking_tool_frequency") && block.typeId === "rc_sd:ender_drawer") data.cancel = true

  const config = block.getComponent("rc_sd:storage_config")?.customComponentParameters.params;
  const type = config?.type; // "1x1", "1x2", "2x2", "ender"

  const playerGetView = player.getBlockFromViewDirection();

  if (!isFrontFace(playerGetView.block, playerGetView.face)) return;

  if (!block.typeId.includes(`_drawer`)) return

  const slotConfigs = {
    "ender": [
      { origin: [1, 1], size: [14, 14] }
    ],
    "1x1": [
      { origin: [1, 1], size: [14, 14] }
    ],
    "1x2": [
      { origin: [1, 1], size: [14, 6] },
      { origin: [1, 9], size: [14, 6] }
    ],
    "2x2": [
      { origin: [1, 1], size: [6, 6] },
      { origin: [9, 0], size: [6, 6] },
      { origin: [1, 9], size: [6, 6] },
      { origin: [9, 9], size: [6, 6] },
    ]
  };

  const slotAreas = slotConfigs[type];
  if (!slotAreas) return;

  const slot = new FaceSelectionPlains(...slotAreas).getSelected(playerGetView);

  if (slot === undefined) return;

  if (player.getGameMode() === "Creative") data.cancel = true;


});

function isInArea(pos1, pos2, radius) {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  const dz = Math.abs(pos1.z - pos2.z);
  return dx <= radius && dy <= radius && dz <= radius;
}

function compareLocations(loc1, loc2) {
  return loc1.x === loc2.x && loc1.y === loc2.y && loc1.z === loc2.z;
}

function extractFrequencyFromLore(lore) {
  const frequency = [];

  for (let i = 0; i < lore.length; i++) {
    const line = lore[i];

    if (line.startsWith("§r§7Frequency:")) continue;

    const clean = line.trim().replace(/"|,|§r/g, '');

    if (clean) frequency.push(clean);
  }

  return frequency;
}

function hopperSystem(block) {
  const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
  const amountPerSlot = config.amount_per_slot;
  const type = config.type;
  const faces = ["above", "east", "south", "west", "north"];

  for (const face of faces) {
    const thisBlock = block[face]();
    if (thisBlock?.typeId === "minecraft:hopper") {
      const states = thisBlock.permutation.getAllStates();
      if (states["facing_direction"] === API.directionToNum(API.invertFace(face)) && states["toggle_bit"] === false) {

        const hopperInventory = thisBlock.getComponent("inventory").container;

        for (let i = 0; i < hopperInventory.size; i++) {
          const hopperItem = hopperInventory.getItem(i);
          if (!hopperItem) continue;

          const dimension = block.dimension;
          const entityInventory = dimension.getEntities({
            location: block.center(),
            type: "rc_sd:storage_inventory",
            maxDistance: 0.5
          })[0];

          if (!entityInventory) continue;

          const inventory = entityInventory.getComponent("inventory").container;

          const limit = API.getStorageLimit(block, amountPerSlot, entityInventory, inventory);

          const slotEntities = dimension.getEntities({
            location: block.center(),
            families: ['rc_sd:item'],
            maxDistance: 0.5
          });

          let added = false;

          // Verifica se já existe um slot com o mesmo item
          for (const slotEntity of slotEntities) {
            const slotInventory = slotEntity.getComponent("inventory").container;
            const invItem = slotInventory.getItem(0);
            if (!invItem) continue;

            const quantityKey = slotEntity.getDynamicPropertyIds().find(key => key.startsWith("rc_sd:quantity_"));
            const quantity = quantityKey ? slotEntity.getDynamicProperty(quantityKey) : 0;

            if (API.compareItems(invItem, hopperItem) && quantity < limit) {
              // Adiciona 1 à quantidade
              slotEntity.setDynamicProperty(quantityKey, quantity + 1);

              if (block.typeId === 'rc_sd:ender_drawer') {
                const frequency = slotEntity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                const frequencyData = API.getFrequencyData(frequency);
                API.setFrequency(frequency, frequencyData.quantity + 1, frequencyData.ajust_item, API.loadInv(frequencyData.item))
              }

              // Remove 1 do hopper
              if (hopperItem.amount > 1) {
                hopperItem.amount -= 1;
                hopperInventory.setItem(i, hopperItem);
              } else {
                hopperInventory.setItem(i, undefined);
              }

              added = true;
              break;
            }
          }

          // Se não adicionou a um slot existente, cria um novo
          if (!added) {
            for (const slotEntity of slotEntities) {

              const slotIndex = getSlotIndex(slotEntity, type);

              const getItemType = API.getItemType(block, hopperItem);
              const getNUmberItemType = API.typeToNumber(getItemType);

              const replaceId = getItemType === "fake"
                ? `rc_sd:${hopperItem.typeId.split(":")[1]}_item_fake`
                : hopperItem.typeId;

              const inv = slotEntity.getComponent("inventory").container;

              const currentItem = inv.getItem(0).typeId;
              if (currentItem !== 'rc_sd:air') continue

              const newItem = hopperItem.clone();
              newItem.amount = 1;
              inv.setItem(0, newItem);

              slotEntity.setProperty("rc_sd:ajust_item", getNUmberItemType);
              slotEntity.setDynamicProperty(`rc_sd:quantity_${slotIndex}`, 1);

              if (block.typeId === "rc_sd:ender_drawer") {
                slotEntity.setDynamicProperty("rc_sd:ajust_item", getNUmberItemType);
                slotEntity.setDynamicProperty("rc_sd:item_typeId", hopperItem.typeId);
              }

              if (block.typeId === 'rc_sd:ender_drawer') {
                const frequency = slotEntity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                API.setFrequency(frequency, 1, getNUmberItemType, newItem)
              }

              const inventorySlot = API.getInventorySlot(type, slotIndex);
              if (inventorySlot !== undefined) {
                mc.system.runTimeout(() => {
                  slotEntity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                  if (inventorySlot !== undefined) {
                    API.setItemSlot(replaceId, inventorySlot, entityInventory);
                  }
                }, 1);
              }
              // Remove 1 item do hopper
              if (hopperItem.amount > 1) {
                hopperItem.amount -= 1;
                hopperInventory.setItem(i, hopperItem);
              } else {
                hopperInventory.setItem(i, undefined);
              }
              break
            }
          }

          break; // processa apenas um item por tick
        }
      }
    }
  }
  // Saída: envia do bloco para o hopper abaixo
  const below = block.below();
  if (below?.typeId === "minecraft:hopper") {
    const hopperStates = below.permutation.getAllStates();
    const hopperInventory = below.getComponent("inventory").container;

    if (hopperStates["toggle_bit"] === false) {
      const dimension = block.dimension;

      const slotEntities = dimension.getEntities({
        location: block.center(),
        families: ['rc_sd:item'],
        maxDistance: 0.5
      });

      for (const slotEntity of slotEntities) {
        const inv = slotEntity.getComponent("inventory").container;
        const item = inv.getItem(0);
        if (!item) continue;

        const slotIndex = getSlotIndex(slotEntity, type);
        const quantityKey = `rc_sd:quantity_${slotIndex}`;
        const quantity = slotEntity.getDynamicProperty(quantityKey) ?? 0;
        API.resetStorage(slotIndex, quantity, slotEntity, block)
        const currentItem = inv.getItem(0).typeId;
        if (currentItem === 'rc_sd:air' || quantity < 1) continue

        // Tenta inserir 1 item no hopper
        for (let i = 0; i < hopperInventory.size; i++) {
          const hopperItem = hopperInventory.getItem(i);
          if (!hopperItem) {
            const newItem = item.clone();
            newItem.amount = 1;
            hopperInventory.setItem(i, newItem);
            slotEntity.setDynamicProperty(quantityKey, quantity - 1);
             if (block.typeId === 'rc_sd:ender_drawer') {
                const frequency = slotEntity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                const frequencyData = API.getFrequencyData(frequency);
                API.setFrequency(frequency, frequencyData.quantity - 1, frequencyData.ajust_item, API.loadInv(frequencyData.item))
              }
            break;
          } else if (API.compareItems(item, hopperItem) && hopperItem.amount < hopperItem.maxAmount) {
            hopperItem.amount += 1;
            hopperInventory.setItem(i, hopperItem);
            slotEntity.setDynamicProperty(quantityKey, quantity - 1);
             if (block.typeId === 'rc_sd:ender_drawer') {
                const frequency = slotEntity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                const frequencyData = API.getFrequencyData(frequency);
                API.setFrequency(frequency, frequencyData.quantity - 1, frequencyData.ajust_item, API.loadInv(frequencyData.item))
              }
            break;
          }
        }
        break; // só envia um item por tick
      }
    }
  }

}

function getSlotIndex(entity, type) {
  if (type === "1x1" || type === "ender") return 0;

  const typeId = entity.typeId;
  const last = typeId.split("_").pop();
  const slot = parseInt(last);
  return isNaN(slot) ? 0 : slot;
}
