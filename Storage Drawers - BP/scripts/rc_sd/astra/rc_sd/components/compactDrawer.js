import * as mc from "@minecraft/server";

import * as astraAPI from "../astraAPI.js";
import {
    StorageQuantityScoreboard,
    InventoryManager,
    DrawerInventoryManager
} from "../astraAPI.js";

import FaceSelectionPlains from "./faceSelection.js";

const isFrontFace = (block, face) =>
    block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();


/** @param {mc.StartupEvent} data */
export function compactDrawerComponent(data) {
    data.blockComponentRegistry.registerCustomComponent("rc_sd:compact_drawer", {
        onPlayerInteract: ({ block, face, faceLocation, player, dimension }, { params }) => {
            if (!isFrontFace(block, face)) return;

            const center = block.center();

            const rotation = block.permutation.getState("minecraft:cardinal_direction");

            const invertByRotation = {
                north: { invertU: true, invertV: false },
                south: { invertU: true, invertV: false },
                east: { invertU: false, invertV: false },
                west: { invertU: false, invertV: false },
            };

            const slotConfigs = [
                { origin: [2, 2], size: [12, 5] },
                { origin: [2, 9], size: [5, 5] },
                { origin: [9, 9], size: [5, 5] },
            ];

            const slot = new FaceSelectionPlains(...slotConfigs).getSelected(
                { face, faceLocation },
                invertByRotation[rotation]
            );

            if (slot === undefined) return;

            const equipment = player.getComponent("equippable");
            const itemStack = equipment.getEquipment("Mainhand");

            astraAPI.doubleClick(player);
            const isDoubleClick = player.hasTag("rc_sd:doubleClick");

            const clickedVisualItem = getVisualItem(dimension, center, slot);
            const itemInClickedSlot = clickedVisualItem
                ?.getComponent("minecraft:inventory")
                ?.container
                ?.getItem(0);

            const itemStackGroup = itemStack ? getGroup(itemStack.typeId) : undefined;

            // Se o item da mão não for compactável, ele é tratado como mão vazia.
            const usableHandItem = itemStackGroup ? itemStack : undefined;

            const referenceItem = usableHandItem ?? (isDoubleClick ? itemInClickedSlot : undefined);
            if (!referenceItem) return;

            const group = getGroup(referenceItem.typeId);
            if (!group) return;

            const groupData = getGroupData(group);
            const clickedData = usableHandItem
                ? getItemGroupData(groupData, usableHandItem.typeId)
                : undefined;

            if (!isDoubleClick && !clickedData) return;

            const inventoryEntity = getDrawerInventoryEntity(dimension, center);
            if (!inventoryEntity) return;

            const inventory = inventoryEntity.getComponent("minecraft:inventory").container;
            const maxQuantity = DrawerInventoryManager.getStorageLimit(params.amount_per_slot, inventory);

            const baseValue = getCompactSlotValue(0, groupData);
            const maxBase = maxQuantity * baseValue;

            let totalBase = getCompactTotalBase(dimension, center, groupData);
            if (totalBase >= maxBase) return;

            astraAPI.doubleClick(player);

            if (isDoubleClick) {
                totalBase = addFromPlayerInventory(player, groupData, totalBase, maxBase);
            } else {
                totalBase = addFromMainhand(equipment, usableHandItem, clickedData, groupData, totalBase, maxBase);
            }

            updateCompactVisuals({
                block,
                dimension,
                center,
                inventoryEntity,
                groupData,
                totalBase,
                maxBase
            });
        },

        onPlace: ({ block, dimension }) => {
            const center = block.center();

            const inventoryEntity = dimension.spawnEntity("rc_sd:drawer_inventory", center);
            inventoryEntity.nameTag = `tile.${block.typeId}.name`;

            const inv = new InventoryManager(inventoryEntity);

            for (let i = 1; i < 8; i++) {
                astraAPI.setItemSlot(new mc.ItemStack("rc_sd:air"), i, inventoryEntity);
            }

            inv.setSlot(0, new mc.ItemStack("rc_sd:compact_drawer_front"));

            const rotation = block.permutation.getState("minecraft:cardinal_direction");

            const offsets = [
                { entityType: "rc_sd:small_visual_item", location: { x: 0, y: 0.24, z: 0 } },
                { entityType: "rc_sd:small_visual_item", location: { x: 0.22, y: -0.2, z: 0 } },
                { entityType: "rc_sd:small_visual_item", location: { x: -0.22, y: -0.2, z: 0 } },
            ];

            for (const [index, offset] of offsets.entries()) {
                const rotatedOffset = rotateOffsetByCardinal(offset.location, rotation);

                const visualItem = dimension.spawnEntity(offset.entityType, {
                    x: center.x + rotatedOffset.x,
                    y: center.y + rotatedOffset.y,
                    z: center.z + rotatedOffset.z
                });

                visualItem.nameTag = `${index}`;
                visualItem.addTag(inventoryEntity.id);

                visualItem.setProperty(
                    "rc_sd:rotation_y",
                    astraAPI.cardinalToRotation[rotation].y
                );

                StorageQuantityScoreboard.addEntity(visualItem, 0);
            }
        }
    });
}

function addFromMainhand(equipment, itemStack, clickedData, groupData, totalBase, maxBase) {
    const result = calculateAdd(itemStack, clickedData, groupData, totalBase, maxBase);
    if (result.amount <= 0) return totalBase;

    totalBase += result.base;

    if (itemStack.amount > result.amount) {
        itemStack.amount -= result.amount;
        equipment.setEquipment("Mainhand", itemStack);
    } else {
        equipment.setEquipment("Mainhand", undefined);
    }

    return totalBase;
}

function addFromPlayerInventory(player, groupData, totalBase, maxBase) {
    const playerInventory = player.getComponent("minecraft:inventory").container;

    for (let slot = 0; slot < playerInventory.size; slot++) {
        if (totalBase >= maxBase) break;

        const item = playerInventory.getItem(slot);
        if (!item) continue;

        const itemData = getItemGroupData(groupData, item.typeId);
        if (!itemData) continue;

        const result = calculateAdd(item, itemData, groupData, totalBase, maxBase);
        if (result.amount <= 0) continue;

        totalBase += result.base;

        if (item.amount > result.amount) {
            item.amount -= result.amount;
            playerInventory.setItem(slot, item);
        } else {
            playerInventory.setItem(slot, undefined);
        }
    }

    return totalBase;
}

function calculateAdd(itemStack, itemData, groupData, totalBase, maxBase) {
    const value = getCompactSlotValue(itemData.relativeSlot, groupData);
    const spaceLeftBase = maxBase - totalBase;

    if (spaceLeftBase <= 0) {
        return { amount: 0, base: 0 };
    }

    const maxItemsToAdd = Math.floor(spaceLeftBase / value);
    const amount = Math.min(itemStack.amount, maxItemsToAdd);

    return {
        amount,
        base: amount * value
    };
}

export function updateCompactVisuals({ block, dimension, center, inventoryEntity, groupData, totalBase, maxBase }) {
    for (const data of groupData) {
        const visualItem = getVisualItem(dimension, center, data.relativeSlot);
        if (!visualItem) continue;

        const value = getCompactSlotValue(data.relativeSlot, groupData);
        const quantity = Math.floor(totalBase / value);
        const maxForSlot = Math.floor(maxBase / value);

        StorageQuantityScoreboard.set(visualItem, quantity);

        const itemInDrawer = ensureVisualItem(block, visualItem, data.itemId);
        if (!itemInDrawer) continue;

        const displayItem = itemInDrawer.clone();
        displayItem.amount = 1;
        displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(quantity)}/${astraAPI.normalizeNumber(maxForSlot)}`;

        const inventorySlot = astraAPI.getInventorySlot("compact", data.relativeSlot);
        astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);

        const visual = astraAPI.formatVisualNumber(quantity);

        for (const [key, value] of Object.entries(visual)) {
            visualItem.setProperty(`rc_sd:${key}`, value);
        }
    }
}

function ensureVisualItem(block, visualItem, itemId) {
    const container = visualItem.getComponent("minecraft:inventory").container;
    const current = container.getItem(0);

    if (current?.typeId === itemId) {
        return current;
    }

    const item = new mc.ItemStack(itemId);
    item.amount = 1;

    const itemType = astraAPI.itemType(block, item);
    const numberToType = astraAPI.typeToNumber(itemType);

    const replaceId = itemType === "fake"
        ? `rc_sd:${itemId.split(":")[1]}_item_fake`
        : itemId;

    mc.system.runTimeout(() => {
        visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
    }, 1);

    container.setItem(0, item);
    visualItem.setProperty("rc_sd:visual_type", numberToType);

    return item;
}

export function getCompactTotalBase(dimension, center, groupData) {
    const baseData = getLowestValueData(groupData);
    const visualItem = getVisualItem(dimension, center, baseData.relativeSlot);

    if (!visualItem) return 0;

    return StorageQuantityScoreboard.get(visualItem);
}

function getLowestValueData(groupData) {
    return groupData.reduce((lowest, data) => {
        const lowestValue = getCompactSlotValue(lowest.relativeSlot, groupData);
        const dataValue = getCompactSlotValue(data.relativeSlot, groupData);

        return dataValue < lowestValue ? data : lowest;
    }, groupData[0]);
}

export function getCompactSlotValue(relativeSlot, groupData) {
    const sorted = [...groupData].sort((a, b) => a.relativeSlot - b.relativeSlot);

    let value = 1;

    for (let i = sorted.length - 1; i >= 0; i--) {
        const data = sorted[i];

        if (data.relativeSlot === relativeSlot) {
            return value;
        }

        value *= data.amount;
    }

    return 1;
}

function getDrawerInventoryEntity(dimension, center) {
    const [inventoryEntity] = dimension.getEntities({
        location: center,
        type: "rc_sd:drawer_inventory",
        maxDistance: 0.5
    });

    return inventoryEntity;
}

export function getVisualItem(dimension, center, relativeSlot) {
    const [visualItem] = dimension.getEntities({
        location: center,
        type: "rc_sd:small_visual_item",
        maxDistance: 0.5,
        name: `${relativeSlot}`
    });

    return visualItem;
}

function rotateOffsetByCardinal(offset, direction) {
    const { x, y, z } = offset;

    switch (direction) {
        case "north":
            return { x, y, z };

        case "east":
            return { x: -z, y, z: x };

        case "south":
            return { x: -x, y, z: -z };

        case "west":
            return { x: z, y, z: -x };

        default:
            return { x, y, z };
    }
}

const compactItems = [
    {
        "minecraft:iron_block": { relativeSlot: 0, amount: 9 },
        "minecraft:iron_ingot": { relativeSlot: 1, amount: 9 },
        "minecraft:iron_nugget": { relativeSlot: 2, amount: 9 },
    },
    {
        "minecraft:gold_block": { relativeSlot: 0, amount: 9 },
        "minecraft:gold_ingot": { relativeSlot: 1, amount: 9 },
        "minecraft:gold_nugget": { relativeSlot: 2, amount: 9 },
    },
    {
        "minecraft:copper_block": { relativeSlot: 0, amount: 9 },
        "minecraft:copper_ingot": { relativeSlot: 1, amount: 9 },
        "minecraft:copper_nugget": { relativeSlot: 2, amount: 9 },
    },
    {
        "minecraft:diamond_block": { relativeSlot: 0, amount: 9 },
        "minecraft:diamond": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:emerald_block": { relativeSlot: 0, amount: 9 },
        "minecraft:emerald": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:lapis_block": { relativeSlot: 0, amount: 9 },
        "minecraft:lapis_lazuli": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:redstone_block": { relativeSlot: 0, amount: 9 },
        "minecraft:redstone": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:coal_block": { relativeSlot: 0, amount: 9 },
        "minecraft:coal": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:quartz_block": { relativeSlot: 0, amount: 4 },
        "minecraft:quartz": { relativeSlot: 1, amount: 4 },
    },
    {
        "minecraft:bone_block": { relativeSlot: 0, amount: 9 },
        "minecraft:bone_meal": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:glowstone": { relativeSlot: 0, amount: 4 },
        "minecraft:glowstone_dust": { relativeSlot: 1, amount: 4 },
    },
    {
        "minecraft:hay_block": { relativeSlot: 0, amount: 9 },
        "minecraft:wheat": { relativeSlot: 1, amount: 9 },
    },
    {
        "minecraft:snow_block": { relativeSlot: 0, amount: 4 },
        "minecraft:snowball": { relativeSlot: 1, amount: 4 },
    },
    {
        "minecraft:clay": { relativeSlot: 0, amount: 4 },
        "minecraft:clay_ball": { relativeSlot: 1, amount: 4 },
    },
];

export function getGroupData(group) {
    return Object.entries(group).map(([itemId, data]) => ({
        itemId,
        relativeSlot: data.relativeSlot,
        amount: data.amount,
    }));
}

export function getGroup(itemId) {
    return compactItems.find(group => itemId in group) ?? null;
}

export function getItemGroupData(groupData, itemId) {
    return groupData.find(data => data.itemId === itemId);
}