import { world, system, BlockPermutation, GameMode } from "@minecraft/server";
import { validBlocks } from "../lib/space/validBlocks";
import { apiDurability } from "../lib/item/durability";
import { apiInventory } from "../lib/player/inventory";
import { apiConfigInfo } from "../lib/player/config";
import { apiCooldown } from "../lib/player/cooldown";
import { apiWandInfo } from "../lib/wand";
world.beforeEvents.worldInitialize.subscribe(({ itemComponentRegistry: customI }) => {
    customI.registerCustomComponent("builder_wand:onUseOn", {
        onUseOn: ({ block, blockFace, source, itemStack: item }) => {
            const player = source;
            if (apiCooldown.testTimeOut(player, "builder_wand:cooldown_place_area"))
                return;
            apiCooldown.setCooldown(player, "builder_wand:cooldown_place_area", 0.25);
            if (apiWandInfo.testValidWand(item)) {
                try {
                    system.run(() => {
                        validBlocks.reduceBlocks(player, item, block, blockFace, false, (info, player, item) => {
                            apiCooldown.setCooldown(player, "builder_wand:cooldown_place_area", 0);
                            if (!info)
                                return;
                            world.sendMessage(`${info.blocks.length} / ${info.damage}`);
                            if (player.getGameMode() != GameMode.creative && !apiWandInfo.testWandCreative(item))
                                apiDurability.removeDurability(player, player.getComponent("equippable"), item, info.damage > info.blocks.length ? info.blocks.length : info.damage);
                            if (player.getGameMode() != GameMode.creative && !apiWandInfo.testWandCreative(item))
                                apiInventory.removeItems(player.getComponent("inventory").container, info.inventory, info.blocks.length);
                            system.runJob(placeBlocks(apiWandInfo.testWandCreative(item) && !apiConfigInfo.getWandConfig(player, item).connect ? info.allBlocks : info.blocks, player));
                        });
                    });
                }
                catch { }
            }
        }
    });
});
function* placeBlocks(blocks, player) {
    try {
        for (const info of blocks) {
            if (info.front.typeId == "minecraft:air" || info.front.typeId == "minecraft:short_grass")
                info.front.setPermutation(BlockPermutation.resolve(info.back.typeId, info.back.permutation.getAllStates()));
            yield;
        }
    }
    catch { }
}
