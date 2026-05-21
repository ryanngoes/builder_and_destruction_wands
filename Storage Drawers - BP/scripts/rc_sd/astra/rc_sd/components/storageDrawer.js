import * as mc from "@minecraft/server";
import * as mcUI from "@minecraft/server-ui";

import * as astraAPI from "../astraAPI";
import { Vector, StorageQuantityScoreboard, InventoryManager, DrawerInventoryManager, addItemFromHopper } from "../astraAPI";
import { updateCompactVisuals, getGroupData, getCompactSlotValue, getCompactTotalBase } from "./compactDrawer.js";

import FaceSelectionPlains from './faceSelection.js';

const isFrontFace = (block, face) => block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();

/** @param {mc.StartupEvent} data */
export function storageDrawerComponent(data) {
    data.blockComponentRegistry.registerCustomComponent("rc_sd:storage_drawer", {
        onPlayerInteract: ({ block, face, faceLocation, player, dimension }, { params }) => {

            const equipment = player.getComponent("equippable");
            const itemStack = equipment.getEquipment("Mainhand");

            const center = block.center();

            const type = params.type; // "1x1", "1x2", "2x2", "ender"
            const amountPerSlot = params.amount_per_slot;

            const rotation = block.permutation.getState("minecraft:cardinal_direction");

            const invertByRotation = {
                north: { invertU: false, invertV: false },
                south: { invertU: false, invertV: false },
                east: { invertU: false, invertV: false },
                west: { invertU: false, invertV: false },
            };

            const slotConfigs = {
                "1x1": [
                    { origin: [2, 2], size: [12, 12] }
                ],
                "1x2": [
                    { origin: [2, 2], size: [12, 5] },
                    { origin: [2, 9], size: [12, 5] }
                ],
                "2x2": [
                    { origin: [2, 2], size: [5, 5] },
                    { origin: [9, 2], size: [5, 5] },
                    { origin: [2, 9], size: [5, 5] },
                    { origin: [9, 9], size: [5, 5] }
                ],
            };

            const slotAreas = slotConfigs[type];
            if (!slotAreas) return;

            if (!isFrontFace(block, face)) return;

            const slot = new FaceSelectionPlains(...slotAreas).getSelected(
                { face, faceLocation },
                invertByRotation[rotation]
            );

            if (slot === undefined) return;

            const [inventoryEntity] = dimension.getEntities({
                location: center,
                type: `rc_sd:drawer_inventory`,
                maxDistance: 0.5
            });

            const [visualItem] = dimension.getEntities({
                location: center,
                type: type === '1x1' ? 'rc_sd:normal_visual_item' : 'rc_sd:small_visual_item',
                maxDistance: 0.5,
                name: `${slot}`
            });

            //console.warn(type === '1x1' ? 'rc_sd:normal_visual_item' : 'rc_sd:small_visual_item', visualItem, slot)

            const inventory = inventoryEntity.getComponent('minecraft:inventory').container

            let quantity = StorageQuantityScoreboard.get(visualItem);
            const maxQuantity = DrawerInventoryManager.getStorageLimit(amountPerSlot, inventory);
            let totalAdded = 0;
            let itemInDrawer = visualItem.getComponent('minecraft:inventory').container.getItem(0)

            //sistema para saber se o player clicou duas vezes
            astraAPI.doubleClick(player)

            if (quantity < maxQuantity) {
                const inventorySlot = astraAPI.getInventorySlot(type, slot)
                if (itemStack) {
                    if (quantity === 0 && block.permutation.getState("rc_sd:lock") === false) {

                        const itemType = astraAPI.itemType(block, itemStack)
                        const numberToType = astraAPI.typeToNumber(itemType);

                        const replaceId = itemType === "fake"
                            ? `rc_sd:${itemStack.typeId.split(":")[1]}_item_fake`
                            : itemStack.typeId;


                        mc.system.runTimeout(() => {
                            visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                        }, 1);

                        const newItem = itemStack.clone();
                        newItem.amount = 1;
                        visualItem.getComponent("inventory").container.setItem(0, newItem);
                        visualItem.setProperty("rc_sd:visual_type", numberToType);
                    }
                }

                if (!player.hasTag("rc_sd:doubleClick")) {
                    itemInDrawer = visualItem.getComponent('minecraft:inventory').container.getItem(0)

                    if (astraAPI.compareItems(itemStack, itemInDrawer)) {
                        const spaceLeft = maxQuantity - quantity;

                        if (itemStack.amount > spaceLeft) {
                            totalAdded += spaceLeft;
                            itemStack.amount = itemStack.amount - spaceLeft;
                            equipment.setEquipment("Mainhand", itemStack);
                        } else {
                            totalAdded += itemStack.amount;
                            equipment.setEquipment("Mainhand", undefined);
                        }
                    }

                    StorageQuantityScoreboard.set(visualItem, quantity + totalAdded);
                } else {
                    const entitiesPerDrawer = dimension.getEntities({
                        location: center,
                        type: type === '1x1' ? 'rc_sd:normal_visual_item' : 'rc_sd:small_visual_item',
                        maxDistance: 0.5,
                        tags: [inventoryEntity.id]
                    });

                    const playerInventory = player.getComponent('minecraft:inventory').container

                    for (const entitiePerDrawer of entitiesPerDrawer) {
                        let drawerQuantity = StorageQuantityScoreboard.get(entitiePerDrawer);
                        let drawerAdded = 0;

                        const itemInDrawer = entitiePerDrawer
                            .getComponent('minecraft:inventory')
                            .container
                            .getItem(0);

                        if (!itemInDrawer) continue;

                        for (let x = 0; x < playerInventory.size; x++) {
                            const item = playerInventory.getItem(x);
                            if (!item) continue;

                            if (astraAPI.compareItems(item, itemInDrawer)) {
                                const drawerMaxQuantity = DrawerInventoryManager.getStorageLimit(
                                    amountPerSlot,
                                    inventory
                                );

                                const spaceLeft = drawerMaxQuantity - (drawerQuantity + drawerAdded);
                                if (spaceLeft <= 0) break;

                                if (item.amount > spaceLeft) {
                                    drawerAdded += spaceLeft;

                                    item.amount -= spaceLeft;
                                    playerInventory.setItem(x, item);

                                    break;
                                } else {
                                    drawerAdded += item.amount;
                                    playerInventory.setItem(x, undefined);
                                }
                            }
                        }

                        if (drawerAdded > 0) {
                            const newQuantity = drawerQuantity + drawerAdded;

                            StorageQuantityScoreboard.set(entitiePerDrawer, newQuantity);

                            const visual = astraAPI.formatVisualNumber(newQuantity);

                            for (const [key, value] of Object.entries(visual)) {
                                entitiePerDrawer.setProperty(`rc_sd:${key}`, value);
                            }
                        }
                    }
                }

                quantity = StorageQuantityScoreboard.get(visualItem);
                itemInDrawer = visualItem.getComponent('minecraft:inventory').container.getItem(0)

                if (quantity <= 0) return
                const displayItem = itemInDrawer?.clone();
                displayItem.amount = 1;
                displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(quantity)}/${astraAPI.normalizeNumber(maxQuantity)}`;

                astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);

                const visual = astraAPI.formatVisualNumber(quantity);

                for (const [key, value] of Object.entries(visual)) {
                    visualItem.setProperty(`rc_sd:${key}`, value);
                }

                //API.playerActionBar(limit, player, entity, entityInventory, slot);
            }
        },
        onPlace: ({ block, dimension }, { params }) => {
            const type = params.type; // "1x1", "1x2", "2x2", "ender"

            const offsets = {
                "1x1": [
                    {
                        entityType: 'rc_sd:normal_visual_item',
                        location: { x: 0, y: 0, z: 0 }
                    },
                ],

                "1x2": [
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: 0, y: 0.24, z: 0 }
                    },
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: 0, y: -0.2, z: 0 }
                    }
                ],
                "2x2": [
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: 0.22, y: 0.24, z: 0 }
                    },
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: -0.22, y: 0.24, z: 0 }
                    },
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: 0.22, y: -0.2, z: 0 }
                    },
                    {
                        entityType: 'rc_sd:small_visual_item',
                        location: { x: -0.22, y: -0.2, z: 0 }
                    }
                ],
            };

            const center = block.center();

            const inventoryEntity = dimension.spawnEntity('rc_sd:drawer_inventory', block.bottomCenter());
            inventoryEntity.nameTag = 'tile.' + block.typeId + '.name';

            const inv = new InventoryManager(inventoryEntity);

            for (let i = 1; i < 8; i++)
                astraAPI.setItemSlot(new mc.ItemStack("rc_sd:air"), i + 5, inventoryEntity);
            const ui = new mc.ItemStack(
                block.typeId.slice(0, -4) + (type === '1x1' ? "" : type === '2x2' ? "4" : block.typeId.slice(-1))
            );

            inv.setSlot(5, ui);

            const selectedOffsets = offsets[type] ?? offsets["1x1"];

            const rotation = block.permutation.getState("minecraft:cardinal_direction");

            for (const [index, offset] of selectedOffsets.entries()) {
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

const drawerHitLock = new Set();

export function afterHitComponent(data) {
    const { hitBlock: block, damagingEntity: player } = data;

    const dimension = block.dimension;
    const center = block.center();

    const config =
        block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params ??
        block.getComponent("rc_sd:compact_drawer")?.customComponentParameters.params;

    const type = config?.type; // "1x1", "1x2", "2x2", "compact", "ender"
    const amountPerSlot = config?.amount_per_slot;

    if (!config || !type) return;

    const playerHead = player.getHeadLocation();
    const viewDirection = player.getViewDirection();

    const forwardOffset = 0.2;

    const startLocation = {
        x: playerHead.x + viewDirection.x * forwardOffset,
        y: playerHead.y + viewDirection.y * forwardOffset + 0.1,
        z: playerHead.z + viewDirection.z * forwardOffset
    };

    const blockTestDistance = player.dimension.getBlockFromRay(
        startLocation,
        viewDirection,
        { maxDistance: 10, includePassableBlocks: true }
    );

    const absoluteDistance = blockTestDistance
        ? Math.floor(Vector.distance(startLocation, blockTestDistance.block.center()) + 1.15)
        : 0;

    const distance = absoluteDistance <= 5 ? absoluteDistance : 0;

    const blockInView = player.dimension.getBlockFromRay(
        startLocation,
        viewDirection,
        { maxDistance: distance * 2, includePassableBlocks: true }
    );

    if (!isFrontFace(blockInView?.block, blockInView?.face)) return;

    const slotConfigs = {
        "1x1": [
            { origin: [2, 2], size: [12, 12] }
        ],
        "1x2": [
            { origin: [2, 2], size: [12, 5] },
            { origin: [2, 9], size: [12, 5] }
        ],
        "2x2": [
            { origin: [2, 2], size: [5, 5] },
            { origin: [9, 2], size: [5, 5] },
            { origin: [2, 9], size: [5, 5] },
            { origin: [9, 9], size: [5, 5] }
        ],
        "compact": [
            { origin: [2, 2], size: [12, 5] },
            { origin: [2, 9], size: [5, 5] },
            { origin: [9, 9], size: [5, 5] }
        ]
    };

    const slotAreas = slotConfigs[type];
    if (!slotAreas) return;

    const slot = new FaceSelectionPlains(...slotAreas).getSelected(blockInView);
    if (slot === undefined) return;

    //const lockKey = `${player.id}:${block.location.x},${block.location.y},${block.location.z}:${slot}`;

    //if (drawerHitLock.has(lockKey)) return;

    //drawerHitLock.add(lockKey);

    //mc.system.runTimeout(() => drawerHitLock.delete(lockKey), 3);

    const [inventoryEntity] = dimension.getEntities({
        location: center,
        type: "rc_sd:drawer_inventory",
        maxDistance: 0.5
    });

    if (!inventoryEntity) return;

    const inventory = inventoryEntity.getComponent("minecraft:inventory")?.container;
    if (!inventory) return;

    if (type === "compact") {
        removeItemFromCompactDrawer({
            block,
            inventoryEntity,
            config,
            slot,
            player
        });

        return;
    }

    const [visualItem] = dimension.getEntities({
        location: center,
        type: type === "1x1" ? "rc_sd:normal_visual_item" : "rc_sd:small_visual_item",
        maxDistance: 0.5,
        name: `${slot}`
    });

    if (!visualItem?.isValid) return;

    const visualInventory = visualItem.getComponent("minecraft:inventory")?.container;
    if (!visualInventory) return;

    const quantity = StorageQuantityScoreboard.get(visualItem);
    const maxQuantity = DrawerInventoryManager.getStorageLimit(amountPerSlot, inventory);

    if (quantity <= 0) return;

    const itemInDrawer = visualInventory.getItem(0);
    if (!itemInDrawer) return;

    const amountToRemove = Math.min(player.isSneaking ? 64 : 1, quantity);

    if (!visualItem?.isValid) return;

    const newItem = itemInDrawer.clone();
    newItem.amount = amountToRemove;

    player.dimension.spawnItem(newItem, player.location);

    const newQuantity = quantity - amountToRemove;

    StorageQuantityScoreboard.set(visualItem, newQuantity);

    const visual = astraAPI.formatVisualNumber(newQuantity);

    for (const [key, value] of Object.entries(visual)) {
        visualItem.setProperty(`rc_sd:${key}`, value);
    }
    const inventorySlot = astraAPI.getInventorySlot(type, Number(visualItem.nameTag));
    if (newQuantity <= 0) {
        visualInventory.setItem(0, undefined);

        visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 air`);
        visualItem.setProperty("rc_sd:visual_type", 0);

        const emptyVisual = astraAPI.formatVisualNumber(0);

        for (const key of Object.keys(emptyVisual)) {
            visualItem.resetProperty(`rc_sd:${key}`);
        }

        const displayItem = new mc.ItemStack("rc_sd:air")
        displayItem.nameTag = ` `;

        astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);

    } else {
        const displayItem = itemInDrawer.clone();
        displayItem.amount = 1;
        displayItem.nameTag =
            `§r§f${astraAPI.normalizeNumber(newQuantity)}/${astraAPI.normalizeNumber(maxQuantity)}`;

        astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);
    }

}

export function beforeDrawerBreakComponent(data) {
    const { block, player } = data;

    const dimension = block.dimension;
    const center = block.center();

    const config =
        block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params ??
        block.getComponent("rc_sd:compact_drawer")?.customComponentParameters.params;

    const type = config?.type; // "1x1", "1x2", "2x2", "compact", "ender"
    const amountPerSlot = config?.amount_per_slot;

    if (!config || !type) return;

    const playerHead = player.getHeadLocation();
    const viewDirection = player.getViewDirection();

    const forwardOffset = 0.2;

    const startLocation = {
        x: playerHead.x + viewDirection.x * forwardOffset,
        y: playerHead.y + viewDirection.y * forwardOffset + 0.1,
        z: playerHead.z + viewDirection.z * forwardOffset
    };

    const blockTestDistance = player.dimension.getBlockFromRay(
        startLocation,
        viewDirection,
        { maxDistance: 10, includePassableBlocks: true }
    );

    const absoluteDistance = blockTestDistance
        ? Math.floor(Vector.distance(startLocation, blockTestDistance.block.center()) + 1.15)
        : 0;

    const distance = absoluteDistance <= 5 ? absoluteDistance : 0;

    const blockInView = player.dimension.getBlockFromRay(
        startLocation,
        viewDirection,
        { maxDistance: distance * 2, includePassableBlocks: true }
    );

    if (!isFrontFace(blockInView?.block, blockInView?.face)) return;

    const slotConfigs = {
        "1x1": [
            { origin: [2, 2], size: [12, 12] }
        ],
        "1x2": [
            { origin: [2, 2], size: [12, 5] },
            { origin: [2, 9], size: [12, 5] }
        ],
        "2x2": [
            { origin: [2, 2], size: [5, 5] },
            { origin: [9, 2], size: [5, 5] },
            { origin: [2, 9], size: [5, 5] },
            { origin: [9, 9], size: [5, 5] }
        ],
        "compact": [
            { origin: [2, 2], size: [12, 5] },
            { origin: [2, 9], size: [5, 5] },
            { origin: [9, 9], size: [5, 5] }
        ]
    };

    const slotAreas = slotConfigs[type];
    if (!slotAreas) return;

    const slot = new FaceSelectionPlains(...slotAreas).getSelected(blockInView);
    if (slot === undefined) return;

    if (player.getGameMode() === "Creative")
        data.cancel = true;
}

function removeItemFromCompactDrawer({ block, inventoryEntity, config, slot, player }) {
    const drawerInventory = inventoryEntity.getComponent("minecraft:inventory")?.container;
    if (!drawerInventory) return;

    const center = block.center();
    const dimension = block.dimension;

    const existingGroup = astraAPI.getExistingCompactGroup(dimension, center);
    if (!existingGroup) return;

    const groupData = getGroupData(existingGroup);
    if (!groupData) return;

    const totalBase = getCompactTotalBase(dimension, center, groupData);
    if (totalBase <= 0) return;

    const slotValue = getCompactSlotValue(slot, groupData);
    if (!slotValue || slotValue <= 0) return;

    const availableAmountInSlot = Math.floor(totalBase / slotValue);
    if (availableAmountInSlot <= 0) return;

    const [visualItem] = dimension.getEntities({
        location: center,
        type: "rc_sd:small_visual_item",
        maxDistance: 0.5,
        name: `${slot}`
    });

    if (!visualItem?.isValid) return;

    const visualInventory = visualItem.getComponent("minecraft:inventory")?.container;
    if (!visualInventory) return;

    const itemInDrawer = visualInventory.getItem(0);
    if (!itemInDrawer) return;

    const amountToRemove = Math.min(
        player.isSneaking ? 64 : 1,
        availableAmountInSlot
    );

    const removedBase = amountToRemove * slotValue;
    const newTotalBase = Math.max(0, totalBase - removedBase);

    const maxQuantity = DrawerInventoryManager.getStorageLimit(
        config.amount_per_slot,
        drawerInventory
    );

    const baseValue = getCompactSlotValue(0, groupData);
    const maxBase = maxQuantity * baseValue;

    mc.system.run(() => {
        if (!visualItem?.isValid) return;

        const itemToDrop = itemInDrawer.clone();
        itemToDrop.amount = amountToRemove;

        player.dimension.spawnItem(itemToDrop, player.location);

        if (newTotalBase <= 0) {
            clearCompactVisuals(block, inventoryEntity);
            return;
        }

        updateCompactVisuals({
            block,
            dimension,
            center,
            inventoryEntity,
            groupData,
            totalBase: newTotalBase,
            maxBase
        });
    });
}

function clearCompactVisuals(block, inventoryEntity) {
    const center = block.center();
    const dimension = block.dimension;

    const visualItems = dimension.getEntities({
        location: center,
        type: "rc_sd:small_visual_item",
        maxDistance: 0.5
    });

    for (const visualItem of visualItems) {
        if (!visualItem?.isValid) continue;

        const visualInventory = visualItem.getComponent("minecraft:inventory")?.container;

        // Zera o score
        StorageQuantityScoreboard.set(visualItem, 0);

        // Remove a imagem/item salvo no visual
        if (visualInventory) {
            visualInventory.setItem(0, undefined);
        }

        // Remove o item da mão da entidade visual
        visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 air`);

        // Reseta o tipo visual
        visualItem.setProperty("rc_sd:visual_type", 0);

        // Reseta os números
        const visual = astraAPI.formatVisualNumber(0);

        for (const key of Object.keys(visual)) {
            visualItem.resetProperty(`rc_sd:${key}`);
        }

        // Limpa também o item salvo no inventoryEntity, se você usa ele para guardar display
        const slot = Number(visualItem.nameTag);
        const inventorySlot = astraAPI.getInventorySlot("compact", slot);

        if (inventorySlot !== undefined) {
            astraAPI.setItemSlot(undefined, inventorySlot, inventoryEntity);
        }
    }
}

mc.world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity }) => {
    if (!entity?.isValid) return;
    if (entity.hasTag('rc_sd:validation')) {
        const players = mc.world.getPlayers();
        for (const p of players) {
            entity.triggerEvent('rc_sd:remove_collision');
            p.setPropertyOverrideForEntity(entity, "rc_sd:selection", false);
        }
    }

    const hasDifference = astraAPI.checkSlots(entity);

    if (hasDifference) {
        const block = entity.dimension.getBlock(entity.location)

        const config = block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params;
        const type = config?.type; // "1x1", "1x2", "2x2", "ender"
        const amountPerSlot = config.amount_per_slot;

        const inventory = entity.getComponent('minecraft:inventory').container

        const entitiesPerDrawer = entity.dimension.getEntities({
            location: block.center(),
            type: type === '1x1' ? 'rc_sd:normal_visual_item' : 'rc_sd:small_visual_item',
            maxDistance: 0.5,
            tags: [entity.id]
        });

        for (const entitiePerDrawer of entitiesPerDrawer) {

            const itemInDrawer = entitiePerDrawer
                .getComponent("minecraft:inventory")
                .container
                .getItem(0);

            if (!itemInDrawer) continue;

            const displayItem = itemInDrawer.clone();

            const inventorySlot = astraAPI.getInventorySlot(type, Number(entitiePerDrawer.nameTag))

            let quantity = StorageQuantityScoreboard.get(entitiePerDrawer);
            const maxQuantity = DrawerInventoryManager.getStorageLimit(amountPerSlot, inventory);

            displayItem.amount = 1;
            displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(quantity)}/${astraAPI.normalizeNumber(maxQuantity)}`;



            astraAPI.setItemSlot(displayItem, inventorySlot, entity);
        }
    }

    //entity.remove()
    {
        const delay = entity.getDynamicProperty('rc_sd:delay') ?? 0;
        const nextDelay = (delay + 1) % 8;

        entity.setDynamicProperty('rc_sd:delay', nextDelay);

        if (nextDelay === 0) {
            const block = entity.dimension.getBlock(entity.location);
            //if(block.typeId !== "rc_sd:compact_drawer")
            addItemFromHopper(block, entity, 0, 9);
        }
    }

}, { eventTypes: ["rc_sd:reset_selection"], entityTypes: ["rc_sd:drawer_inventory"] })