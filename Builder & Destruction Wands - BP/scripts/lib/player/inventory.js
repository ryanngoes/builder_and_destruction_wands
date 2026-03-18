import { ItemStack } from "@minecraft/server";
export const apiInventory = new class apiInventory {
    getItems(inventory, items) {
        const list = [];
        for (let i = 0; i < inventory.size; i++) {
            if (items.includes(inventory.getItem(i)?.typeId))
                list.push({ slot: i, amount: inventory.getItem(i).amount, priority: items.findIndex(value => value == inventory.getItem(i).typeId) });
        }
        list.sort((a, b) => a.priority - b.priority);
        return list.length > 0 ? { list: list, amount: list.reduce((acc, current) => acc + current.amount, 0) } : { list: [], amount: 0 };
    }
    removeItems(inventory, list, amount) {
        let missing = amount;
        for (const slot of list) {
            if (missing >= slot.amount) {
                inventory.setItem(slot.slot, undefined);
                missing -= slot.amount;
            }
            else {
                inventory.setItem(slot.slot, new ItemStack(inventory.getItem(slot.slot).typeId, slot.amount - missing));
                break;
            }
        }
    }
};
