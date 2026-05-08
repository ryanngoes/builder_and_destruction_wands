import * as mc from '@minecraft/server';
import * as API from './API.js';
import "./items.js"

mc.system.beforeEvents.startup.subscribe((data) => {
  data.blockComponentRegistry.registerCustomComponent("rc_sd:storage_controller", {
    onPlace: ({ block, dimension }, { params }) => {
      dimension.runCommand(`summon rc_sd:storage_inventory upgrades.text ${block.location.x} ${block.location.y + 0.5} ${block.location.z}`)
      const entity = dimension.getEntities({
        location: block.center(),
        type: `rc_sd:storage_inventory`,
        maxDistance: 0.5
      })[0];

      entity.setDynamicProperty("rc_sd:controllerArea", 8);
      entity.setDynamicProperty("rc_sd:storageLocations", JSON.stringify([])); //vazio
    },
    onPlayerInteract: ({ block, player, dimension }, { params }) => {

      API.doubleClick(player);

      const equipment = player.getComponent("equippable");
      const itemStack = equipment.getEquipment("Mainhand");
      const itemStackSlot = equipment.getEquipmentSlot(mc.EquipmentSlot.Mainhand);
      const inventory = player.getComponent("inventory").container;

      const controllerEntity = dimension.getEntities({
        location: block.center(),
        type: `rc_sd:storage_inventory`,
        maxDistance: 0.5
      })[0];

      if (!controllerEntity) return;

      const storageLocations = JSON.parse(controllerEntity.getDynamicProperty("rc_sd:storageLocations") || "[]");

      // Mostra indicador do controller
      dimension.spawnEntity(`rc_sd:block_selection`, { x: block.center().x, y: block.y, z: block.center().z });

      // Atualiza indicadores dos drawers
      storageLocations.forEach(location => {
        const storageBlock = dimension.getBlock(location);
        if (storageBlock?.typeId.includes(`_drawer`)) {
          const indicatorPos = { x: location.x + 0.5, y: location.y, z: location.z + 0.5 };

          // Remove indicador antigo e adiciona novo
          dimension.getEntities({
            location: indicatorPos,
            type: `rc_sd:block_selection`,
            maxDistance: 0.5
          })[0]?.remove();

          dimension.spawnEntity(`rc_sd:block_selection`, indicatorPos);
        }
      });

      if (itemStack?.typeId === 'rc_sd:linking_tool') {
        // Configurar linking tool
        player.onScreenDisplay.setActionBar('§aController configured to the tool');
        const lore = itemStack.getLore() || [];
        const loreIndex = lore.findIndex(l => l.startsWith("§r§eController:"));
        lore[loreIndex] = `§r§eController: §s${block.x}§r, §s${block.y}§r, §s${block.z}`;
        itemStack.setLore(lore);
        itemStack.setDynamicProperty("rc_sd:controllerLocation", block.location);
        API.updateItem(player, itemStack);

      } else {

        for (const location of storageLocations) {
          const storageBlock = dimension.getBlock(location);
          if (!storageBlock?.typeId.includes(`_drawer`)) continue;

          const drawerEntities = dimension.getEntities({
            location: { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
            excludeTypes: [`rc_sd:storage_inventory`, `rc_sd:block_selection`],
            maxDistance: 0.5
          });

          const entityInventory = dimension.getEntities({
            location: { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
            type: `rc_sd:storage_inventory`,
            maxDistance: 0.5
          })[0];

          const config = storageBlock.getComponent("rc_sd:storage_config").customComponentParameters.params;
          const amountPerSlot = config.amount_per_slot;

          const limit = API.getStorageLimit(storageBlock, amountPerSlot, entityInventory, entityInventory.getComponent("inventory").container);

          for (const drawerEntity of drawerEntities) {
            const drawerInventory = drawerEntity.getComponent('inventory')?.container;

            if (!drawerInventory) continue;

            // Processa apenas slots que JÁ CONTÊM ITENS
            for (let slot = 0; slot < drawerInventory.size; slot++) {
              const drawerItem = drawerInventory.getItem(slot);

              if (!drawerItem) continue; // Pula slots vazios

              const quantityKey = drawerEntity.getDynamicPropertyIds().find(key => key.startsWith("rc_sd:quantity_"));
              const currentQuantity = quantityKey ? drawerEntity.getDynamicProperty(quantityKey) : 0;

              let totalAdded = 0;
              const spaceAvailable = limit - currentQuantity;

              if (!player.hasTag("doubleClick") && itemStack) {
                // Single click - apenas item na mão
                if (API.compareItems(drawerItem, itemStack)) {
                  const amountToAdd = Math.min(itemStack.amount, spaceAvailable);
                  totalAdded += amountToAdd;

                  if (itemStack.amount > amountToAdd) {
                    itemStack.amount -= amountToAdd;
                    itemStackSlot.setItem(itemStack);
                  } else {
                    itemStackSlot.setItem(undefined);
                  }
                }
              } else if (player.hasTag("doubleClick")) {
                // Double click - todo o inventário
                for (let invSlot = 0; invSlot < inventory.size; invSlot++) {
                  const inventoryItem = inventory.getItem(invSlot);
                  if (!inventoryItem || !API.compareItems(drawerItem, inventoryItem)) continue;

                  const remainingSpace = spaceAvailable - totalAdded;
                  if (remainingSpace <= 0) break;

                  const amountToAdd = Math.min(inventoryItem.amount, remainingSpace);
                  totalAdded += amountToAdd;

                  if (inventoryItem.amount > amountToAdd) {
                    inventory.setItem(invSlot, new mc.ItemStack(inventoryItem.typeId, inventoryItem.amount - amountToAdd));
                  } else {
                    inventory.setItem(invSlot, undefined);
                  }
                }
              }

              // Atualiza quantidade se houve inserção
              if (totalAdded > 0) {
                drawerEntity.setDynamicProperty(drawerEntity.getDynamicPropertyIds().find(key => key.startsWith("rc_sd:quantity_")), currentQuantity + totalAdded);
                if (storageBlock.typeId === 'rc_sd:ender_drawer') {
                  const frequency = drawerEntity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                  const frequencyData = API.getFrequencyData(frequency);
                  API.setFrequency(frequency, currentQuantity + totalAdded, frequencyData.ajust_item, API.loadInv(frequencyData.item))
                }
              }
            }
          }
        }

      }
    }

  })
  data.itemComponentRegistry.registerCustomComponent("rc_sd:linking_tool", {
    onUse: ({ itemStack, source: player }, { params }) => {

      if (itemStack.typeId === "rc_sd:linking_tool_frequency") {
        if (!player.isSneaking) return;

        player.onScreenDisplay.setActionBar("§9Cleared drawer frequency");

        const newItem = new mc.ItemStack("rc_sd:linking_tool", 1);

        newItem.setDynamicProperty(
          "rc_sd:controllerLocation",
          itemStack.getDynamicProperty("rc_sd:controllerLocation")
        );

        const oldLoreRaw = itemStack.getDynamicProperty("rc_sd:oldLore");
        let oldLore = [];

        try {
          oldLore = JSON.parse(oldLoreRaw)
        } catch (e) { }

        newItem.setLore(oldLore);
        API.updateItem(player, newItem);
        return;
      }

      const lore = itemStack.getLore();

      const actionIndex = lore.findIndex(l => l.startsWith("§r§eLinking Action:"));
      const isCurrentlyAdd = lore[actionIndex].includes("§tAdd");

      lore[actionIndex] = isCurrentlyAdd ?
        "§r§eLinking Action: §vRemove" :
        "§r§eLinking Action: §tAdd";

      itemStack.setDynamicProperty("rc_sd:linkingMode", isCurrentlyAdd ? "remove" : "add");
      itemStack.setLore(lore);
      player.onScreenDisplay.setActionBar(isCurrentlyAdd ? "§6Swapped action to remove" : "§9Swapped action to add");
      API.updateItem(player, itemStack);



    }
  })
})