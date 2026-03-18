import { system, BlockVolume, GameMode } from "@minecraft/server";
import { apiInventory } from "../player/inventory";
import { apiAreaInfo } from "./areaInfo";
import { apiNumbers } from "../math/numbers";
import { apiDurability } from "../item/durability";
import { apiConfigInfo } from "../player/config";
import { multipleBlocks } from "../variables";
import { apiWandInfo } from "../wand";
export const validBlocks = new class validBlocks {
    getAll(player, area, block, direction) {
        const blocksBack = [...player.dimension.getBlocks(new BlockVolume(area.min, area.max), { includeTypes: [block.typeId] }, true).getBlockLocationIterator()];
        try {
            const locations = blocksBack.map(pos => {
                const back = player.dimension.getBlock(pos);
                const front = player.dimension.getBlock(apiAreaInfo.applyOffset(pos, direction));
                if (front.typeId == "minecraft:air" || front.typeId == "minecraft:short_grass")
                    return { back: back, front: front, queue: apiNumbers.distance(block.location, front.location) };
            }).filter(value => value !== undefined).sort((a, b) => a.queue - b.queue).map(value => ({ back: value.back, front: value.front }));
            return locations;
        }
        catch {
            return [];
        }
    }
    reduceBlocks(player, item, block, face, nextDamage = false, onComplete) {
        const config = apiConfigInfo.getWandConfig(player, item);
        const inventory = apiInventory.getItems(player.getComponent("inventory").container, Object.keys(multipleBlocks).includes(block.getItemStack().typeId) ? multipleBlocks[block.getItemStack().typeId] : [block.getItemStack().typeId]);
        const durability = apiDurability.getDurability(item, player);
        if (inventory.amount == 0 && player.getGameMode() != GameMode.creative && !apiWandInfo.testWandCreative(item))
            return;
        const startBlocks = apiAreaInfo.getBlocksToPlace(player, block, face, item);
        const damage = nextDamage ? apiDurability.getRemoveDurability(item, startBlocks.length) : apiWandInfo.getOldDamage(item, block.location) ?? apiDurability.getRemoveDurability(item, startBlocks.length);
        const reducedBlocks = apiWandInfo.reduceAmount(startBlocks, durability, damage, player.getGameMode() == GameMode.creative || apiWandInfo.testWandCreative(item) ? 64 ** 2 ** 2 : inventory.amount);
        const newDamage = apiDurability.getRemoveDurability(item, reducedBlocks.length);
        if (nextDamage)
            apiWandInfo.setNextDamage(player, item, block.location, newDamage);
        if (!config.connect)
            return onComplete({ blocks: reducedBlocks, allBlocks: startBlocks, damage: newDamage, inventory: inventory.list }, player, item);
        system.runJob(this.connectBlocks(player, item, block, startBlocks, inventory, nextDamage, reducedBlocks, (connect, player, item, block, nextDamage, startBlocks, inventory) => {
            const connectDamage = apiDurability.getRemoveDurability(item, connect.length);
            if (nextDamage)
                apiWandInfo.setNextDamage(player, item, block.location, connectDamage);
            onComplete({ blocks: connect, allBlocks: startBlocks, damage: connectDamage, inventory: inventory.list }, player, item);
        }));
    }
    *connectBlocks(player, item, block, startBlocks, inventory, nextDamage, oldBlocks, onComplete) {
        const blocks = oldBlocks.map((value, index) => (value.back.location));
        const verified = [0];
        for (let i = 0; i < verified.length; i++) {
            player.onScreenDisplay.setActionBar({ translate: `${i < verified.length - 1 ? i : "finished"}` });
            const pos = blocks[verified[i]];
            blocks[verified[i]] = null;
            if (!pos)
                continue;
            const all = JSON.stringify(blocks);
            for (const dir of ["North", "South", "East", "West", "Up", "Down"]) {
                if (all.includes(JSON.stringify(apiNumbers.vectorAdd(pos, dir)))) {
                    const newPos = apiNumbers.vectorAdd(pos, dir);
                    const index = blocks.findIndex(value => (value?.x == newPos.x && value?.y == newPos.y && value?.z == newPos.z));
                    if (index == -1)
                        continue;
                    verified.push(index);
                }
            }
            yield;
        }
        const sortedBlocks = [...new Set(verified)].sort((a, b) => a - b).map(value => { return oldBlocks[value]; });
        onComplete(sortedBlocks, player, item, block, nextDamage, startBlocks, inventory);
    }
};
