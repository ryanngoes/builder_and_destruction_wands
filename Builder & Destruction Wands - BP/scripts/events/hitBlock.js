import { validBlocks } from "../lib/space/validBlocks";
import { world, system } from "@minecraft/server";
import { apiCooldown } from "../lib/player/cooldown";
import { apiNumbers } from "../lib/math/numbers";
import { apiWandInfo } from "../lib/wand";
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity: entity, hitBlock: block, blockFace }) => {
    const player = entity;
    const hand = player.getComponent("equippable").getEquipment("Mainhand");
    if (!hand)
        return;
    if (!apiWandInfo.testValidWand(hand))
        return;
    if (apiCooldown.testTimeOut(player, "builder_wand:cooldown_preview_area"))
        return;
    apiCooldown.setCooldown(player, "builder_wand:cooldown_preview_area", 2);
    validBlocks.reduceBlocks(player, hand, block, blockFace, true, (info, player) => {
        if (!info)
            return apiCooldown.setCooldown(player, "builder_wand:cooldown_preview_area", 2);
        system.runJob(spawnParticle(info.blocks));
    });
});
function* spawnParticle(blocks) {
    for (const info of blocks) {
        info.front.dimension.spawnParticle("minecraft:shulker_bullet", apiNumbers.centerVector(info.front.location));
        yield;
    }
}
