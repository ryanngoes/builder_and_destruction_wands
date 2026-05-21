import * as mc from "@minecraft/server";
import * as mcUI from "@minecraft/server-ui";

import * as astraAPI from "../astraAPI.js";
import { Vector, StorageQuantityScoreboard, InventoryManager, DrawerInventoryManager, addItemFromHopper } from "../astraAPI.js";
import { updateCompactVisuals, getGroupData, getCompactSlotValue, getCompactTotalBase } from "./compactDrawer.js";

import FaceSelectionPlains from './faceSelection.js';

const isFrontFace = (block, face) => block.permutation.getState("minecraft:cardinal_direction") === face.toLowerCase();

/** @param {mc.StartupEvent} data */
export function drawerControllerComponent(data) {
    data.blockComponentRegistry.registerCustomComponent("rc_sd:drawer_controller", {
        onPlayerInteract: ({ block, face, faceLocation, player, dimension }, { params }) => {

            astraAPI.doubleClick(player)

            const equipment = player.getComponent("equippable");
            const itemStack = equipment.getEquipment("Mainhand");

            const allDrawersLocation = getAllConnectedDrawers(block, 18)

            for (const drawerLocation of allDrawersLocation) {

                const drawer = block.dimension.getBlock(drawerLocation);

                const config =
                    drawer.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params;

                const type = config?.type;

                for (let slot = 0; slot < (type === '1x1' ? 1 : type === '1x2' ? 2 : type === '2x2' ? 4 : 1); slot++) {
                    const amountPerSlot = config?.amount_per_slot;
                    const center = drawer.center();
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

                    if (quantity < maxQuantity) {
                        const inventorySlot = astraAPI.getInventorySlot(type, slot)
                      //if (itemStack) {
                      //    if (quantity === 0 && drawer.permutation.getState("rc_sd:lock") === false) {

                      //        const itemType = astraAPI.itemType(drawer, itemStack)
                      //        const numberToType = astraAPI.typeToNumber(itemType);

                      //        const replaceId = itemType === "fake"
                      //            ? `rc_sd:${itemStack.typeId.split(":")[1]}_item_fake`
                      //            : itemStack.typeId;


                      //        mc.system.runTimeout(() => {
                      //            visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                      //        }, 1);

                      //        const newItem = itemStack.clone();
                      //        newItem.amount = 1;
                      //        visualItem.getComponent("inventory").container.setItem(0, newItem);
                      //        visualItem.setProperty("rc_sd:visual_type", numberToType);
                      //    }
                      //}

                        if (!player.hasTag("rc_sd:doubleClick")) {
                            itemInDrawer = visualItem.getComponent("minecraft:inventory").container.getItem(0);

                            if (astraAPI.compareItems(itemStack, itemInDrawer)) {
                                const spaceLeft = maxQuantity - quantity;

                                if (itemStack.amount > spaceLeft) {
                                    totalAdded += spaceLeft;
                                    itemStack.amount -= spaceLeft;
                                    equipment.setEquipment("Mainhand", itemStack);
                                } else {
                                    totalAdded += itemStack.amount;
                                    equipment.setEquipment("Mainhand", undefined);
                                }
                            }

                            if (totalAdded <= 0) continue;

                            quantity += totalAdded;
                            StorageQuantityScoreboard.set(visualItem, quantity);

                            const displayItem = itemInDrawer?.clone();
                            displayItem.amount = 1;
                            displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(quantity)}/${astraAPI.normalizeNumber(maxQuantity)}`;

                            astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);

                            const visual = astraAPI.formatVisualNumber(quantity);

                            for (const [key, value] of Object.entries(visual)) {
                                visualItem.setProperty(`rc_sd:${key}`, value);
                            }

                            return;
                        } else {
                            const entitiesPerDrawer = dimension.getEntities({
                                location: center,
                                type: type === "1x1" ? "rc_sd:normal_visual_item" : "rc_sd:small_visual_item",
                                maxDistance: 0.5,
                                tags: [inventoryEntity.id]
                            });

                            const playerInventory = player.getComponent("minecraft:inventory").container;
                            let addedAny = false;

                            for (const entitiePerDrawer of entitiesPerDrawer) {
                                let drawerQuantity = StorageQuantityScoreboard.get(entitiePerDrawer);
                                let drawerAdded = 0;

                                const itemInDrawer = entitiePerDrawer
                                    .getComponent("minecraft:inventory")
                                    .container
                                    .getItem(0);

                                if (!itemInDrawer) continue;

                                const drawerMaxQuantity = DrawerInventoryManager.getStorageLimit(
                                    amountPerSlot,
                                    inventory
                                );

                                const spaceTotal = drawerMaxQuantity - drawerQuantity;
                                if (spaceTotal <= 0) continue;

                                for (let x = 0; x < playerInventory.size; x++) {
                                    const item = playerInventory.getItem(x);
                                    if (!item) continue;

                                    if (astraAPI.compareItems(item, itemInDrawer)) {
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
                                    addedAny = true;

                                    const newQuantity = drawerQuantity + drawerAdded;

                                    StorageQuantityScoreboard.set(entitiePerDrawer, newQuantity);

                                    const visual = astraAPI.formatVisualNumber(newQuantity);

                                    for (const [key, value] of Object.entries(visual)) {
                                        entitiePerDrawer.setProperty(`rc_sd:${key}`, value);
                                    }

                                    const slotIndex = Number(entitiePerDrawer.nameTag);
                                    const inventorySlot = astraAPI.getInventorySlot(type, slotIndex);

                                    const displayItem = itemInDrawer.clone();
                                    displayItem.amount = 1;
                                    displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(newQuantity)}/${astraAPI.normalizeNumber(drawerMaxQuantity)}`;

                                    astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);
                                }
                            }

                            if (addedAny) return;
                        }

                        quantity = StorageQuantityScoreboard.get(visualItem);
                        itemInDrawer = visualItem.getComponent('minecraft:inventory').container.getItem(0)

                        if (quantity <= 0) continue
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
                    continue
                }
            }
        }
    });
}

function isDrawer(block) {
    const id = block.typeId;
    return id.startsWith("rc_sd:") && id.includes("_drawer_");
}

export function getAllConnectedDrawers(startBlock, maxBlocks = 512) {
    const visited = new Set();
    const result = [];
    const stack = [startBlock];

    visited.add(`${startBlock.x}/${startBlock.y}/${startBlock.z}/${startBlock.dimension.id}`);

    while (stack.length > 0 && result.length < maxBlocks) {


        const current = stack.pop();
        if (current !== startBlock) result.push(current);

        for (const face of ["above", "below", "north", "south", "west", "east"]) {
            let neighbor;
            try {
                neighbor = current[face]();
            } catch {
                continue;
            }

            if (!neighbor || !isDrawer(neighbor)) continue;

            const key = `${neighbor.x}/${neighbor.y}/${neighbor.z}/${neighbor.dimension.id}`;
            if (visited.has(key)) continue;

            visited.add(key);
            stack.push(neighbor);
        }
    }

    return result;
}