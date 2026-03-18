import { world, GameMode } from "@minecraft/server";
import { apiNumbers } from "../math/numbers";
export const apiDurability = new class apiDurability {
    getDurability(item, player) {
        if (player?.getGameMode() == GameMode.creative)
            return 64 ** 2 ** 2;
        const durability = item.getComponent("durability");
        if (durability == undefined)
            return 64 ** 2 ** 2;
        return durability.maxDurability - durability.damage;
    }
    getMaxDurability(item) { return item.getComponent("durability").maxDurability; }
    getRemoveDurability(item, amount) {
        if (item.getComponent("durability") == undefined)
            return 0;
        const enchantment = item.getComponent("enchantable");
        const chance = enchantment?.hasEnchantment("unbreaking") ? Math.floor(100 - (100 / (enchantment.getEnchantment("unbreaking").level + 1))) : 0;
        return amount - apiNumbers.clamp(Math.round(amount * ((Math.random() * (chance - (chance - 10)) + (chance - 10)) / 100)), 0, Infinity);
    }
    removeDurability(player, hand, item, damageAmount) {
        const comp = item.getComponent("durability");
        if (comp == undefined)
            return;
        const damage = apiNumbers.clamp(damageAmount, 0, comp.maxDurability - comp.damage);
        world.sendMessage(`1: ${damageAmount} / ${damage}`);
        comp.damage += damage;
        const durability = this.getDurability(item);
        item.setLore([`Durability: ${durability}/${this.getMaxDurability(item)}`]);
        world.sendMessage(`2: ${damageAmount} / ${damage}`);
        hand.setEquipment("Mainhand", durability <= 0 ? undefined : item);
        if (durability <= 0)
            player.playSound("random.break", { location: player.location });
    }
};
