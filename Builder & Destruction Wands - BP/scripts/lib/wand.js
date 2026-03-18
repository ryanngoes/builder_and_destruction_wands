import { wandSize } from "./variables";
import { apiNumbers } from "./math/numbers";
export const apiWandInfo = new class apiWandInfo {
    getMaxSize(item) {
        return wandSize[item.typeId];
    }
    getOldDamage(item, pos) {
        const oldDamage = item.getDynamicProperty(`buidler_wand:old_damage_${item.typeId.replace("builder_wand:", "").replace("builder_", "")}`);
        if (!oldDamage)
            return;
        const info = JSON.parse(oldDamage);
        if (info.pos != apiNumbers.vectorToString(pos))
            return;
        return info.damage;
    }
    reduceAmount(blocks, durability, damage, inventory) {
        const newArray = [...blocks];
        let amount = newArray.length;
        const removeDurability = durability > damage ? amount : durability;
        if (amount > removeDurability)
            amount = durability;
        if (amount > inventory)
            amount = inventory;
        newArray.splice(amount);
        return newArray;
    }
    setNextDamage(player, item, pos, amount) {
        item.setDynamicProperty(`buidler_wand:old_damage_${item.typeId.replace("builder_wand:", "").replace("builder_", "")}`, amount ? JSON.stringify({ damage: amount, pos: apiNumbers.vectorToString(pos) }) : undefined);
        player.getComponent("equippable").setEquipment("Mainhand", item);
    }
    testValidWand(item) {
        return item.getTags().includes("builder_wand:wand") || item.getTags().includes("builder_wand:creative") ? true : false;
    }
    testWandCreative(item) {
        return item.getTags().includes("builder_wand:creative") ? true : false;
    }
};
