import * as mc from "@minecraft/server";
import * as mcUI from "@minecraft/server-ui";

import * as astraAPI from "../astraAPI";

/** @param {mc.StartupEvent} data */
export function builderWandComponent(data) {
  data.itemComponentRegistry.registerCustomComponent("rc_bdw:is_builder_wand", {
    onUse: ({ itemStack, source: player }) => {
      if (!player.isSneaking) return;
      showUi(player);
    },
    onUseOn: ({ block, blockFace, usedOnBlockPermutation, itemStack, source: player }, { params }) => {
      const blocksWithFront = astraAPI.FaceAreaSelector.getBlocksWithFront(
        player.dimension,
        block.center(),
        blockFace,
        params.area,
        block.typeId
      );

      const inventoryManager = new astraAPI.InventoryManager(player);
      const itemCooldownManager = astraAPI.ItemCooldownManager

      const placeTypeId = block.typeId;
      let available = inventoryManager.count(placeTypeId);

      // variavel mudável
      let currentWand = itemStack;

      if (itemCooldownManager.isOnCooldown(player, itemStack)) return

      for (const { front } of blocksWithFront) {
        if (!currentWand) break;

        // so coloca no ar
        if (front.typeId !== "minecraft:air") continue;

        // testa se ainda aguenta -1 de durabilidade
        const test = inventoryManager.applyDurability(currentWand, 1, false);

        // se nao aguentaria, para o loop
        if (!test) {
          inventoryManager.setSelectedItem(undefined, "random.break");
          break;
        }

        // se nao for criativo, precisa ter bloco
        if (!inventoryManager.isCreative()) {
          if (available <= 0) break;

          const removed = inventoryManager.removeByType(placeTypeId, 1);
          if (removed <= 0) break;

          itemCooldownManager.startCooldown(player, itemStack);

          available--;
        } else itemCooldownManager.startCooldown(player, itemStack);

        // coloca o bloco
        front.setPermutation(usedOnBlockPermutation);
        front.dimension.spawnEntity('rc_bdw:builder_selection', front.center())

        // salva a nova durabilidade
        currentWand = test;
        inventoryManager.setSelectedItem(currentWand);
      }
    },
  });
}

/** @param {mc.Player} player */
function showUi(player) {
  const form = new mcUI.ModalFormData().title("Wand's Config");
  form.toggle("Only Connected Blocks", { defaultValue: false, tooltip: 'Build only on connected blocks.' });
  //form.divider();
  form.toggle("Is Random", { defaultValue: false, tooltip: 'Build with random blocks from the hotbar.' });
  form.show(player).then(response => {
    const { canceled, formValues } = response;
    if (canceled) return;
    console.warn(formValues)
  })
}