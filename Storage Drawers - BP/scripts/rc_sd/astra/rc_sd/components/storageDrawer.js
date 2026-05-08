import * as mc from "@minecraft/server";
import * as mcUI from "@minecraft/server-ui";

import * as astraAPI from "../astraAPI";
import { Vector, StorageQuantityScoreboard, InventoryManager, DrawerInventoryManager } from "../astraAPI";

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

            const slotConfigs = {
                "1x1": [
                    { origin: [2, 2], size: [12, 12] }
                ],
            };

            const slotAreas = slotConfigs[type];
            if (!slotAreas) return;

            if (!isFrontFace(block, face)) return;

            const slot = new FaceSelectionPlains(...slotAreas).getSelected({ face, faceLocation });

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

                        console.warn(itemType, numberToType)

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
                        const itemInDrawer = entitiePerDrawer.getComponent('minecraft:inventory').container.getItem(0)

                        for (let x = 0; x < playerInventory.size; x++) {

                            const item = playerInventory.getItem(x);

                            if (!item) continue;

                            if (astraAPI.compareItems(item, itemInDrawer)) {
                                const spaceLeft = maxQuantity - (quantity + totalAdded);

                                if (item.amount > spaceLeft) {
                                    totalAdded += spaceLeft;
                                    playerInventory.setItem(x, new mc.ItemStack(item.typeId, item.amount - spaceLeft));
                                    break;
                                } else {
                                    totalAdded += item.amount;
                                    playerInventory.setItem(x, undefined);
                                }
                            }
                        }
                    }

                    //console.warn(entitiesPerDrawer.length)

                    StorageQuantityScoreboard.set(visualItem, quantity + totalAdded);
                }

                quantity = StorageQuantityScoreboard.get(visualItem);
                itemInDrawer = visualItem.getComponent('minecraft:inventory').container.getItem(0)

                if (quantity <= 0) return
                const displayItem = itemInDrawer?.clone();
                displayItem.amount = 1;
                displayItem.nameTag = `§r§f${astraAPI.normalizeNumber(quantity)}/${astraAPI.normalizeNumber(maxQuantity)}`;

                astraAPI.setItemSlot(displayItem, inventorySlot, inventoryEntity);

                //console.warn(astraAPI.formatVisualNumber(quantity))

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
                        entityType: 'rc_sd:normal_visual_item',
                        location: { x: -1, y: 0.5, z: -13.6 }
                    },
                    {
                        entityType: 'rc_sd:normal_visual_item',
                        location: { x: -1, y: 0.5, z: 13.6 }
                    }
                ],
            };

            const center = block.center();

            const inventoryEntity = dimension.spawnEntity('rc_sd:drawer_inventory', center);
            inventoryEntity.nameTag = 'tile.' + block.typeId + '.name';

            const inv = new InventoryManager(inventoryEntity);

            for (let i = 1; i < 8; i++)
                astraAPI.setItemSlot(new mc.ItemStack("rc_sd:air"), i, inventoryEntity);

            const ui = new mc.ItemStack(
                block.typeId.slice(0, -4) + (type === '1x1' ? "" : block.typeId.slice(-1))
            );

            inv.setSlot(0, ui);

            const selectedOffsets = offsets[type] ?? offsets["1x1"];

            for (const [index, offset] of selectedOffsets.entries()) {
                const absoluteLocation = {
                    x: center.x + offset.location.x,
                    y: center.y + offset.location.y,
                    z: center.z + offset.location.z
                };

                const visualItem = dimension.spawnEntity(offset.entityType, absoluteLocation);

                visualItem.nameTag = `${index}`;

                //visualItem.setProperty('rc_sd:digit_0', 0)

                visualItem.addTag(inventoryEntity.id)

                StorageQuantityScoreboard.addEntity(visualItem, 0);
            }
        }
    });
}

mc.world.beforeEvents.playerBreakBlock.subscribe(data => {
    const { block, player } = data;

    const config = block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params;
    const type = config?.type; // "1x1", "1x2", "2x2", "ender"

    const playerHead = player.getHeadLocation();
    const viewDirection = player.getViewDirection();

    const forwardOffset = 0.2; // distância a frente da cabeça

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

    const absoluteDistance = blockTestDistance ? Math.floor(Vector.distance(startLocation, blockTestDistance.block.center()) + 1.15) : 0;

    const distance = absoluteDistance <= 5 ? absoluteDistance : 0

    const blockInView = player.dimension.getBlockFromRay(
        startLocation,
        viewDirection,
        { maxDistance: distance * 2, includePassableBlocks: true }
    );

    if (!isFrontFace(blockInView?.block, blockInView?.face)) return;

    const slotConfigs = {
        "ender": [
            { origin: [1, 1], size: [14, 14] }
        ],
        "1x1": [
            { origin: [2, 2], size: [12, 12] }
        ],
        "1x2": [
            { origin: [1, 1], size: [14, 6] },
            { origin: [1, 9], size: [14, 6] }
        ],
        "2x2": [
            { origin: [1, 1], size: [6, 6] },
            { origin: [9, 0], size: [6, 6] },
            { origin: [1, 9], size: [6, 6] },
            { origin: [9, 9], size: [6, 6] },
        ]
    };

    const slotAreas = slotConfigs[type];
    if (!slotAreas) return;

    const slot = new FaceSelectionPlains(...slotAreas).getSelected(blockInView);

    if (slot === undefined) return;

    if (player.getGameMode() === "Creative") data.cancel = true;


});

mc.system.runInterval(() => {
    for (const player of mc.world.getAllPlayers()) {
        const playerHead = player.getHeadLocation();
        const viewDirection = player.getViewDirection();

        const forwardOffset = 0.2; // distância a frente da cabeça

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

        const absoluteDistance = blockTestDistance ? Math.floor(Vector.distance(startLocation, blockTestDistance.block.center()) + 1.15) : 0;

        const distance = absoluteDistance <= 5 ? absoluteDistance : 0

        const blockInView = player.dimension.getBlockFromRay(
            startLocation,
            viewDirection,
            { maxDistance: distance * 2, includePassableBlocks: true }
        );

        if (!blockInView) continue

        const block = blockInView.block

        const config = block.getComponent("rc_sd:storage_drawer")?.customComponentParameters.params;
        const type = config?.type; // "1x1", "1x2", "2x2", "ender"

        const slotConfigs = {
            "ender": [
                { origin: [1, 1], size: [14, 14] }
            ],
            "1x1": [
                { origin: [2, 2], size: [12, 12] }
            ],
            "1x2": [
                { origin: [1, 1], size: [14, 6] },
                { origin: [1, 9], size: [14, 6] }
            ],
            "2x2": [
                { origin: [1, 1], size: [6, 6] },
                { origin: [9, 0], size: [6, 6] },
                { origin: [1, 9], size: [6, 6] },
                { origin: [9, 9], size: [6, 6] },
            ]
        };


        const slotAreas = slotConfigs[type];

        if (!slotAreas) return;

        const slot = new FaceSelectionPlains(...slotAreas).getSelected(blockInView);

        const isFront = isFrontFace(block, blockInView.face);
        const hasSlot = !Number.isNaN(Number(slot));

        if ((isFront && !hasSlot) || !isFront) {
            // não está olhando para o (s) slot (s)
            //console.warn("warn: olhando para a frente, mas fora dos slots");


            const [entity] = block.dimension?.getEntities({
                type: 'rc_sd:drawer_inventory',
                location: block.center(),
                maxDistance: 0.5,
            });

            if (entity) {
                if (!player.isSneaking) {
                    entity.triggerEvent('rc_sd:remove_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', false)
                }

                else {
                    entity.removeTag('rc_sd:validation')
                    entity.triggerEvent('rc_sd:set_block_collision');
                    player.setPropertyOverrideForEntity(entity, 'rc_sd:selection', true)
                }

            }
        }

    }
});

mc.world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity }) => {
    try {
        if (entity.hasTag('rc_sd:validation')) {
            const players = mc.world.getPlayers();
            for (const p of players) {
                entity.triggerEvent('rc_sd:remove_collision');
                p.setPropertyOverrideForEntity(entity, "rc_sd:selection", false);
            }
        }
    } catch { }
}, { eventTypes: ["rc_sd:reset_selection"], entityTypes: ["rc_sd:drawer_inventory"] })

/*
mc.system.beforeEvents.startup.subscribe((data) => {
    data.blockComponentRegistry.registerCustomComponent("rc_sd:storage_config", {
        beforeOnPlayerPlace({ block, dimension, permutationToPlace, player }, { params }) {
            if (block.typeId === 'rc_sd:ender_drawer') return;

            const Block = permutationToPlace.getItemStack();

            const equipment = player.getComponent("equippable");
            const itemStack = equipment.getEquipment("Mainhand");
            const lores = itemStack.getLore();
            if (!lores || lores.length === 0) return;

            // Define o tipo do bloco pelo typeId
            let type = "1x1";
            if (Block.typeId.includes("drawer_4")) type = "2x2";
            else if (Block.typeId.includes("drawer2")) type = "1x2";
            else if (Block.typeId.includes("drawer_1x1")) type = "1x1";
            else if (Block.typeId.includes("ender_drawer")) type = "ender";

            // Dicionário com número de slots
            const slotCounts = {
                "1x1": 1,
                "1x2": 2,
                "2x2": 4,
                "ender": 1
            };
            const slotCount = slotCounts[type];
            if (!slotCount) return;

            mc.system.runTimeout(() => {
                const center = {
                    x: block.location.x + 0.5,
                    y: block.location.y + 0.5,
                    z: block.location.z + 0.5
                };

                const itemEntities = dimension.getEntities({
                    location: center,
                    maxDistance: 0.6,
                    families: ['rc_sd:item']
                });

                const inventoryEntity = dimension.getEntities({
                    location: center,
                    maxDistance: 0.6,
                    type: 'rc_sd:storage_inventory'
                })[0];

                if (!inventoryEntity) return;

                for (let i = 0; i < slotCount; i++) {
                    const lore = lores[i];
                    if (!lore || lore.includes("*")) continue;

                    // Remove §r§8 prefix
                    const cleaned = lore.replace("§r§8", "");
                    const [typeId, qtyStr] = cleaned.split(": ").map(s => s.trim());
                    const quantity = parseInt(qtyStr);
                    if (!typeId || isNaN(quantity)) continue;



                    const itemEntity = type === "1x1" || type === "ender"
                        ? itemEntities[0]
                        : itemEntities.find(e => e.typeId === `rc_sd:item_${i}`);

                    if (!itemEntity) continue;

                    const itemStack = new mc.ItemStack(typeId, 1);
                    itemEntity.getComponent("inventory").container.setItem(0, itemStack);
                    itemEntity.setDynamicProperty(`rc_sd:quantity_${i}`, quantity);

                    // Opcional: também aplica ajuste visual
                    const itemType = API.getItemType(block, itemStack);
                    const adjust = API.typeToNumber(itemType);
                    itemEntity.setProperty("rc_sd:ajust_item", adjust);

                    // Se for ender, adiciona propriedades extras
                    if (type === "ender") {
                        itemEntity.setDynamicProperty("rc_sd:ajust_item", adjust);
                        itemEntity.setDynamicProperty("rc_sd:item_typeId", typeId);
                    }

                    // Opcional: aplicar item visual
                    const replaceId = itemType === "fake"
                        ? `rc_sd:${typeId.split(":")[1]}_item_fake`
                        : typeId;

                    const inventorySlot = API.getInventorySlot(type, i);
                    if (inventorySlot !== undefined) {
                        mc.system.runTimeout(() => {
                            itemEntity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                            API.setItemSlot(replaceId, inventorySlot, inventoryEntity);
                            API.setPermutation(block, "rc_sd:has_item", true)
                        }, 1);
                    }
                }
            }, 1);
        },
        onPlayerBreak({ block, dimension, brokenBlockPermutation, player }, { params }) {
            if (block.typeId === 'rc_sd:ender_drawer') {
                const entity = dimension.getEntities({
                    location: block.center(),
                    families: ['rc_sd:item'],
                    maxDistance: 0.5
                })[0];
                API.deleteFrequency(entity.getDynamicProperty("rc_sd:enderDrawerFrequency"))
                return
            }
            if (!brokenBlockPermutation.getState("rc_sd:has_item") || player.getGameMode() === "Creative") return;

            const Block = brokenBlockPermutation.getItemStack();
            let type = "1x1"; // padrão de fallback

            if (Block.typeId.includes("drawer_4")) type = "2x2";
            else if (Block.typeId.includes("drawer2")) type = "1x2";
            else if (Block.typeId.includes("drawer_1x1")) type = "1x1";
            else if (Block.typeId.includes("ender_drawer")) type = "ender";


            // Define número de slots baseado no tipo do drawer
            const slotCounts = {
                "1x1": 1,
                "1x2": 2,
                "2x2": 4,
                "ender": 1
            };

            const slotCount = slotCounts[type];
            if (!slotCount) return;

            const lores = [];

            for (let i = 0; i < slotCount; i++) {
                const entityType = type === "1x1" || type === "ender"
                    ? "rc_sd:item"
                    : `rc_sd:item_${i}`;

                const entity = dimension.getEntities({
                    location: block.center(),
                    type: entityType,
                    maxDistance: 0.5
                })[0];

                if (!entity) {
                    lores.push(`§r§8*`); // Slot vazio (sem entidade)
                    continue;
                }

                const container = entity.getComponent("inventory").container;
                const item = container.getItem(0);

                if (!item || item.typeId === "rc_sd:air") {
                    lores.push(`§r§8*`);
                } else {
                    const quantityKey = entity.getDynamicPropertyIds().find(k => k.startsWith("rc_sd:quantity_"));
                    const quantity = quantityKey ? entity.getDynamicProperty(quantityKey) : 0;
                    lores.push(`§r§8${item.typeId}: ${quantity}`);
                }
            }

            // Adiciona lores e dropa o bloco com elas
            const storageItem = new mc.ItemStack(Block.typeId, 1);
            storageItem.setLore(lores);
            dimension.spawnItem(storageItem, block.location);
        },
        onTick({ block, dimension }, { params }) {

            hopperSystem(block)

            const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
            const amountPerSlot = config.amount_per_slot;

            const entity = dimension.getEntities({
                location: block.center(),
                type: 'rc_sd:storage_inventory',
                maxDistance: 0.5
            })[0];

            const limit = API.getStorageLimit(block, amountPerSlot, entity, entity.getComponent("inventory").container);

            const slotEntities = dimension.getEntities({
                location: block.center(),
                families: ['rc_sd:item'],
                maxDistance: 0.5
            })

            if (!entity) return;

            const inventory = entity.getComponent("inventory").container;

            // Verifica se o bloco tem o modo de coleta ativado
            let foundCollector = false;
            for (let x = 0; x < inventory.size; x++) {
                const item = inventory.getItem(x);
                if (item && item.typeId === "rc_sd:collector_utility") {
                    API.setPermutation(block, 'rc_sd:collector_upgrade', true);
                    foundCollector = true;
                    break;
                }
            }

            if (!foundCollector) {
                API.setPermutation(block, 'rc_sd:collector_upgrade', false);
                return;
            }


            if (block.permutation.getState("rc_sd:collect_utility") === false) return;

            const nearbyItems = dimension.getEntities({
                location: block.center(),
                type: "minecraft:item",
                maxDistance: 3
            });

            for (const drop of nearbyItems) {

                const droppedItem = drop.getComponent("minecraft:item")?.itemStack;
                for (const slotEntity of slotEntities) {
                    const inventory = slotEntity.getComponent("inventory").container;
                    const invItem = inventory.getItem(0);
                    const quantityKey = slotEntity.getDynamicPropertyIds().find(key => key.startsWith("rc_sd:quantity_"));
                    const quantity = quantityKey ? slotEntity.getDynamicProperty(quantityKey) : 0;

                    if (!invItem) continue;

                    if (API.compareItems(invItem, droppedItem) && quantity < limit) {
                        slotEntity.setDynamicProperty(quantityKey, quantity + 1)

                        if (droppedItem.amount > 1) {

                            const singleItem = droppedItem.clone();
                            singleItem.amount -= 1
                            const entity = dimension.spawnItem(singleItem, drop.location);
                            entity.clearVelocity()
                            drop.remove()

                        } else {
                            drop.remove();
                        }

                        break
                    }
                }
            }
        },
        onPlace: ({ block, dimension }, { params }) => {
            const location = block.center();

            const config = block.getComponent("rc_sd:storage_config")?.customComponentParameters.params;
            const type = config?.type; // "1x1", "1x2", "2x2", "ender"

            const offsets = {
                "ender": [[-1, 31, 0.5]],
                "1x1": [[-1, 31, 0.5]],
                "1x2": [[-1, 48.5, -13.6], [-1, 16.5, -13.6]],
                "2x2": [[16, 48.5, -13.6], [-17, 48.5, -13.6], [16, 16.5, -13.6], [-17, 16.5, -13.6]]
            };

            const angle = API.directionToAngle(block.permutation.getState("minecraft:cardinal_direction"));

            const typeOffsets = offsets[type];
            if (!typeOffsets) return;

            for (let i = 0; i < typeOffsets.length; i++) {
                const offset = typeOffsets[i];
                const rotated = rotate(offset[0], offset[2], angle); // x, z

                const entityLocation = {
                    x: location.x + rotated.x / 64.0,
                    y: location.y - 0.5 + offset[1] / 64.0,
                    z: location.z + rotated.y / 64.0,
                };

                let entityType;
                if (type === "ender" || type === "1x1") {
                    entityType = "rc_sd:item";
                } else {
                    entityType = `rc_sd:item_${i}`;
                }

                // Checa se a entidade já existe no local
                const existing = dimension.getEntities({
                    location: location,
                    type: entityType,
                    maxDistance: 0.5
                })[0];

                if (!existing) {
                    const entity = dimension.spawnEntity(entityType, entityLocation);
                    entity.setProperty("rc_sd:rotation_y", angle);
                    entity.setDynamicProperty("rc_sd:ajust_item", 0);
                    const currentItem = entity.getComponent("inventory").container.getItem(0);
                    if (type === "ender") {

                        const frequency = API.getRandomItems(API.itemsList, 6);
                        const frequencyKey = JSON.stringify(frequency);

                        entity.setDynamicProperty("rc_sd:enderDrawerFrequency", frequencyKey);

                        let stored = mc.world.getDynamicProperty("rc_sd:WorldFrequency");
                        let frequencyData = stored ? JSON.parse(stored) : {};

                        if (!frequencyData[frequencyKey]) {
                            frequencyData[frequencyKey] = {
                                quantity: 0,
                                ajust_item: 0,
                                item: API.serializeItem(new mc.ItemStack("rc_sd:air"))
                            };
                        }
                        mc.world.setDynamicProperty("rc_sd:WorldFrequency", JSON.stringify(frequencyData));
                    }
                }
            }
            const id = block.typeId.split(":")[1]
            const parts = id.split("_")
            const item = `rc_sd:${parts[0]}_front_${parts[2]}`;

            dimension.runCommand(`summon rc_sd:storage_inventory tile.rc_sd:drawer.name ${block.location.x} ${block.location.y + 0.5} ${block.location.z}`);

            const entity = dimension.getEntities({
                location: block.center(),
                type: 'rc_sd:storage_inventory',
                maxDistance: 0.5
            })[0];

            const entities = block.dimension.getEntities({
                location: block.center(),
                families: ['rc_sd:item'],
                maxDistance: 0.5
            });

            if (block.typeId !== "rc_sd:ender_drawer") entity.getComponent("inventory").container.setItem(0, new mc.ItemStack(item))

            for (let i = 1; i < 8; i++) {
                API.setItemSlot("rc_sd:air", i, entity);
            }

            for (const entity of entities) {
                API.setItemSlot("rc_sd:air", 0, entity);
            }

        },
        onPlayerInteract: ({ block, face, faceLocation, player, dimension }, { params }) => {
            const equipment = player.getComponent("equippable");
            const itemStack = equipment.getEquipment("Mainhand");
            const itemStackSlot = equipment.getEquipmentSlot(mc.EquipmentSlot.Mainhand);
            const inventory = player.getComponent("inventory").container;

            if (itemStack?.typeId === 'rc_sd:linking_tool') {

                const lore = itemStack.getLore() || [];
                const loreIndex = lore.findIndex(l => l.startsWith("§r§eLinking Action:"));
                const isCurrentlyAdd = lore[loreIndex].includes("§tAdd");

                const controllerLocation = itemStack.getDynamicProperty("rc_sd:controllerLocation");

                if (!controllerLocation) {
                    player.onScreenDisplay.setActionBar('§cNo controller configured! Right-click a Storage Controller first');
                    return;
                }

                // Busca a entidade do controller
                const entityController = dimension.getEntities({
                    location: { x: controllerLocation.x + 0.5, y: controllerLocation.y + 0.5, z: controllerLocation.z + 0.5 },
                    type: `rc_sd:storage_inventory`,
                    maxDistance: 0.5
                })[0];

                if (!entityController) {
                    player.onScreenDisplay.setActionBar('§cController not found! Make sure it is placed correctly');
                    return;
                }

                const controllerArea = entityController.getDynamicProperty("rc_sd:controllerArea") || 8;

                // Verifica se o bloco clicado está dentro da área de controle (8x8x8)
                if (isInArea(block.location, controllerLocation, controllerArea)) {

                    // Pega as localizações atuais dos storages
                    const validStorageLocations = getAndCleanStorageLocations(entityController, dimension);
                    const locationExists = validStorageLocations.some(loc => compareLocations(loc, block.location));

                    let finalLocations = validStorageLocations;
                    let message = '';

                    if (isCurrentlyAdd) {
                        if (!locationExists && block.typeId.includes('_drawer')) {
                            finalLocations = [...validStorageLocations, block.location];
                            message = '§bLinked drawer to the controller';
                        } else if (!block.typeId.includes('_drawer')) {
                            player.onScreenDisplay.setActionBar('§cThis block is not a valid drawer!');
                            return;
                        } else {
                            message = '§bDrawer already linked to the controller';
                        }
                    } else {
                        finalLocations = validStorageLocations.filter(loc => !compareLocations(loc, block.location));
                        message = '§bRemoved drawer from the controller';

                        // Remove indicador do bloco atual
                        dimension.getEntities({
                            location: block.center(),
                            type: `rc_sd:block_selection`,
                            maxDistance: 0.5
                        })[0]?.remove();
                    }

                    // Atualiza storage locations se houve mudança
                    if (finalLocations.length !== validStorageLocations.length) {
                        entityController.setDynamicProperty("rc_sd:storageLocations", JSON.stringify(finalLocations));
                    }

                    player.onScreenDisplay.setActionBar(message);

                    // Mostra todos os indicadores
                    showStorageIndicators(finalLocations, dimension);
                    dimension.spawnEntity(`rc_sd:block_selection`, {
                        x: controllerLocation.x + 0.5,
                        y: controllerLocation.y,
                        z: controllerLocation.z + 0.5
                    });

                }
            } else if (itemStack?.typeId === 'rc_sd:linking_tool_frequency' && block.typeId === "rc_sd:ender_drawer") {
                const entity = dimension.getEntities({
                    location: block.center(),
                    type: 'rc_sd:item',
                    maxDistance: 0.5
                })[0];

                if (entity.getDynamicProperty(`rc_sd:quantity_0`) > 0) {
                    player.onScreenDisplay.setActionBar("§cIt is not possible to change the frequency. Remove all items from the drawer")
                    player.playSound('note.bass')
                    return
                } else player.onScreenDisplay.setActionBar("§bChanged drawer frequency")

                //se for igual, retorna
                if (JSON.stringify(extractFrequencyFromLore(itemStack.getLore())) === entity.getDynamicProperty("rc_sd:enderDrawerFrequency")) return

                entity.setProperty('rc_sd:ajust_item', itemStack.getDynamicProperty('rc_sd:ajust_item'));
                entity.setDynamicProperty('rc_sd:ajust_item', itemStack.getDynamicProperty('rc_sd:ajust_item'));
                entity.setDynamicProperty('rc_sd:enderDrawerFrequency', JSON.stringify(extractFrequencyFromLore(itemStack.getLore())));

            } else if (itemStack?.typeId === 'rc_sd:configuration_tool' && block.typeId !== "rc_sd:ender_drawer") {
                if (block.permutation.getState('rc_sd:lock') === false) API.setPermutation(block, 'rc_sd:lock', true)
                else API.setPermutation(block, 'rc_sd:lock', false)
            }

            if (!player || !isFrontFace(block, face)) return;

            const config = block.getComponent("rc_sd:storage_config").customComponentParameters.params;
            const type = config.type; // "1x1", "1x2", "2x2", "ender"
            const amountPerSlot = config.amount_per_slot;

            const slotConfigs = {
                "ender": [
                    { origin: [1, 1], size: [14, 14] }
                ],
                "1x1": [
                    { origin: [1, 1], size: [14, 14] }
                ],
                "1x2": [
                    { origin: [1, 1], size: [14, 6] },
                    { origin: [1, 9], size: [14, 6] }
                ],
                "2x2": [
                    { origin: [1, 1], size: [6, 6] },
                    { origin: [9, 0], size: [6, 6] },
                    { origin: [1, 9], size: [6, 6] },
                    { origin: [9, 9], size: [6, 6] },
                ]
            };

            const slotAreas = slotConfigs[type];
            if (!slotAreas) return;

            const playerGetView = player.getBlockFromViewDirection();

            const slot = new FaceSelectionPlains(...slotAreas).getSelected(playerGetView);

            if (slot === undefined) return;

            const entityType = type === "1x1" || type === "ender"
                ? "rc_sd:item"
                : `rc_sd:item_${slot}`

            const entity = dimension.getEntities({
                location: block.center(),
                type: entityType,
                maxDistance: 0.5
            })[0];

            if (!entity) return;



            const entityInventory = dimension.getEntities({
                location: block.center(),
                type: `rc_sd:storage_inventory`,
                maxDistance: 0.5
            })[0];

            const limit = API.getStorageLimit(block, amountPerSlot, entityInventory, entityInventory.getComponent("inventory").container);

            const quantity = entity.getDynamicProperty(`rc_sd:quantity_${slot}`) ?? 0;

            API.doubleClick(player)

            let totalAdded = 0;
            if (itemStack?.typeId === 'rc_sd:linking_tool' || itemStack?.typeId === 'rc_sd:linking_tool_frequency' || itemStack?.typeId === 'rc_sd:configuration_tool') return

            if (quantity < limit) {
                if (itemStack) {
                    let slotBonus = 0;
                    if (block.typeId.includes("drawer_1x1")) {
                        slotBonus = 1;
                    } else if (block.typeId.includes("drawer2")) {
                        slotBonus = 2;
                    } else if (block.typeId.includes("drawer_4")) {
                        slotBonus = 4;
                    }

                    if (((quantity === 0 && block.permutation.getState("rc_sd:lock") === false) || entityInventory.getComponent('inventory').container.getItem(slot + slotBonus)?.typeId === 'rc_sd:air') || quantity === 0 && block.typeId === 'rc_sd:ender_drawer') {
                        const getItemType = API.getItemType(block, itemStack);
                        const getNUmberItemType = API.typeToNumber(getItemType);

                        const replaceId = getItemType === "fake"
                            ? `rc_sd:${itemStack.typeId.split(":")[1]}_item_fake`
                            : itemStack.typeId;

                        const inventorySlot = API.getInventorySlot(type, slot);

                        mc.system.runTimeout(() => {
                            entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                            if (inventorySlot !== undefined) {
                                API.setItemSlot(replaceId, inventorySlot, entityInventory);
                            }
                        }, 1);

                        const newItem = itemStack.clone();
                        newItem.amount = 1;
                        entity.getComponent("inventory").container.setItem(0, newItem);
                        entity.setProperty("rc_sd:ajust_item", getNUmberItemType);
                        if (block.typeId === 'rc_sd:ender_drawer') {
                            const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                            const frequencyData = API.getFrequencyData(frequency);
                            API.setFrequency(frequency, frequencyData.quantity, getNUmberItemType, itemStack)
                        }

                    }

                }

                if (!player.hasTag("doubleClick")) {
                    if (itemStack) {
                        if (API.compareItems(entity.getComponent('inventory').container.getItem(0), itemStack)) {
                            const spaceLeft = limit - quantity;

                            if (itemStack.amount > spaceLeft) {
                                totalAdded += spaceLeft;
                                itemStack.amount = itemStack.amount - spaceLeft;
                                itemStackSlot.setItem(itemStack);
                            } else {
                                totalAdded += itemStackSlot.amount;
                                itemStackSlot.setItem(undefined);
                            }
                        }
                    }
                    entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity + totalAdded);
                    if (block.typeId === 'rc_sd:ender_drawer') {
                        const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                        const frequencyData = API.getFrequencyData(frequency);
                        API.setFrequency(frequency, quantity + totalAdded, frequencyData.ajust_item, API.loadInv(frequencyData.item))
                    }
                }

                if (player.hasTag("doubleClick")) {
                    for (let x = 0; x < inventory.size; x++) {
                        const item = inventory.getItem(x);

                        if (!item) continue;

                        if (API.compareItems(entity.getComponent('inventory').container.getItem(0), item)) {
                            const spaceLeft = limit - (quantity + totalAdded);

                            if (item.amount > spaceLeft) {
                                totalAdded += spaceLeft;
                                inventory.setItem(x, new mc.ItemStack(item.typeId, item.amount - spaceLeft));
                                break;
                            } else {
                                totalAdded += item.amount;
                                inventory.setItem(x, undefined);
                            }
                        }
                    }
                    entity.setDynamicProperty(`rc_sd:quantity_${slot}`, quantity + totalAdded);
                    if (block.typeId === 'rc_sd:ender_drawer') {
                        const frequency = entity.getDynamicProperty("rc_sd:enderDrawerFrequency")
                        const frequencyData = API.getFrequencyData(frequency);
                        API.setFrequency(frequency, quantity + totalAdded, frequencyData.ajust_item, API.loadInv(frequencyData.item))
                    }
                }

                API.playerActionBar(limit, player, entity, entityInventory, slot);
            } else if (quantity >= limit && block.permutation.getState("rc_sd:void_upgrade")) {

                if (!player.hasTag("doubleClick")) {
                    if (API.compareItems(entity.getComponent('inventory').container.getItem(0), itemStack)) {
                        itemStackSlot.setItem(undefined);
                    }
                }

                if (player.hasTag("doubleClick")) {
                    for (let x = 0; x < inventory.size; x++) {
                        const item = inventory.getItem(x);

                        if (!item) continue;

                        if (API.compareItems(entity.getComponent('inventory').container.getItem(0), item)) {
                            inventory.setItem(x, undefined);
                        }
                    }
                }
            }

            const itemEntities = dimension.getEntities({
                location: block.center(),
                families: ["rc_sd:item"],
                maxDistance: 0.5
            });

            let hasAnyItem = false;

            for (const entity of itemEntities) {
                const container = entity.getComponent("inventory").container;
                const item = container.getItem(0);
                if (item && item.typeId !== "rc_sd:air") {
                    hasAnyItem = true;
                    break;
                }
            }
            API.setPermutation(block, "rc_sd:has_item", hasAnyItem);

        }

    })
})
    */