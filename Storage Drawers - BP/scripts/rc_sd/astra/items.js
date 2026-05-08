import * as mc from "@minecraft/server"
import * as API from "./API";


mc.system.runInterval(() => {
  for (const player of mc.world.getAllPlayers()) {
    if (!player) return;

    const inventory = player.getComponent("inventory").container
    for (let slot = 0; slot < inventory.size; slot++) {
      const item = inventory.getItem(slot)

      if (!item) continue;

      if (item.typeId.includes('linking_tool')) {
        const lore = [
          "§r§eLinking Mode: §bSingle",
          "§r§eLinking Action: §tAdd",
          "§r§eController: §s???",
          "§r§hRight click a controller to setup the tool then use it nearby drawers to link."
        ]
        const itemLore = item.getLore()

        if (!itemLore.length > 0) {
          item.setLore(lore)
          inventory.setItem(slot, item)
          break
        }

      }
    }
    const block = player?.getBlockFromViewDirection()?.block
    const mainHand = player.getComponent("equippable").getEquipment("Mainhand")
    const entity = player?.dimension?.getEntities({ location: block?.center(), maxDistance: 0.5, type: `rc_sd:storage_inventory` })[0]
    if (!entity) return
    const storageInventory = entity.getComponent("inventory");
    const container = storageInventory?.container;

    for (let i = 0; i < 8; i++) {
      const item = container.getItem(i);

      if (!item) continue;

      if (item.amount > 1) {
        const clone = item.clone()
        item.amount -= 1
        clone.amount = 1
        container.setItem(i, clone);
        player.dimension.spawnItem(item, player.location);
      }
    }

    for (let i = 8; i < 12; i++) {
      const item = container.getItem(i);

      if (!item) continue;

      if ((!item.typeId?.includes("upgrade") && !item.typeId?.includes("downgrade")) || item.amount > 1) {
        const clone = item.clone()
        if (item.amount > 1 && (item.typeId?.includes("upgrade") || item.typeId?.includes("downgrade"))) {
          item.amount -= 1
          clone.amount = 1
          container.setItem(i, clone);
        } else if (!item.typeId?.includes("upgrade") && !item.typeId?.includes("downgrade")) {
          container.setItem(i, undefined);
        }
        player.dimension.spawnItem(item, player.location);
      }
    }

    for (let i = 12; i < 15; i++) {
      const item = container.getItem(i);

      if (!item) continue;

      if (!item.typeId?.includes("utility") || item.amount > 1) {
        const clone = item.clone()
        if (item.amount > 1 && item.typeId?.includes("utility")) {
          item.amount -= 1
          clone.amount = 1
          container.setItem(i, clone);
        } else if (!item.typeId?.includes("utility")) container.setItem(i, undefined);
        player.dimension.spawnItem(item, player.location);
      }
    }
    if (mainHand?.typeId === 'rc_sd:configuration_tool' && entity && player.isSneaking && block.typeId !== "rc_sd:ender_drawer") {
      entity.triggerEvent('rc_sd:open')
    }

  }
});

mc.system.runInterval(() => {

  const dimensions = [mc.world.getDimension("overworld"), mc.world.getDimension("nether"), mc.world.getDimension("the_end")];

  for (const dimension of dimensions) {
    const drawers = dimension.getEntities({ families: ["rc_sd:item"] })
      .filter(e => e.getDynamicProperty("rc_sd:enderDrawerFrequency"));

    for (const drawer of drawers) {
      const inventoryEntity = dimension.getEntities({ type: "rc_sd:storage_inventory", location: drawer.location })[0]

      const inv = drawer.getComponent("inventory").container;

      const frequency = drawer.getDynamicProperty("rc_sd:enderDrawerFrequency")
      const frequencyData = API.getFrequencyData(frequency);

      //console.warn(drawer.getProperty("rc_sd:ajust_item"), frequencyData.ajust_item)

      if (drawer.getDynamicProperty("rc_sd:quantity_0") != frequencyData.quantity) drawer.setDynamicProperty("rc_sd:quantity_0", frequencyData.quantity)
      if (drawer.getDynamicProperty("rc_sd:ajust_item") != frequencyData.ajust_item) {
        drawer.setDynamicProperty("rc_sd:ajust_item", frequencyData.ajust_item)
        drawer.setProperty("rc_sd:ajust_item", frequencyData.ajust_item)
      }
      const currentItem = inv.getItem(0);
      const newItem = API.loadInv(frequencyData.item);

      if (!newItem) {
        console.warn(`Frequência "${frequency}" não tem item válido.`);
        continue; // pula para o próximo drawer
      }

      if (!currentItem || currentItem.typeId !== newItem.typeId) {
        mc.system.runTimeout(() => {
          try {
            drawer.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${newItem.typeId}`);
            inv.setItem(0, newItem);
            if (inventoryEntity) {
              inventoryEntity.getComponent("inventory").container.setItem(1, newItem);
            }
          } catch (e) {
            console.warn("Erro ao tentar aplicar item:", e);
          }
        }, 1);
      }

      //console.warn(JSON.stringify(API.getFrequencyData(drawer.getDynamicProperty("rc_sd:enderDrawerFrequency"))))

    }

  }

}, 1);

