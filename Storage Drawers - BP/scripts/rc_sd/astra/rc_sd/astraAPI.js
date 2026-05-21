import {
    world,
    ItemStack,
    EnchantmentType,
    EquipmentSlot,
    BlockVolume,
    BlockTypes,
    Block,
    BlockPermutation,
    system
} from "@minecraft/server";

import { getGroup, getVisualItem, getGroupData, getItemGroupData, getCompactSlotValue, getCompactTotalBase, updateCompactVisuals } from "./components/compactDrawer";

/**
 * Converte direção para número.
 * @param {string} direction
 * @returns {number|undefined}
 */
export function directionToNum(direction) {
    if (direction === "up" || direction === "above") return 1;
    if (direction === "down" || direction === "below") return 0;
    if (direction === "north") return 2;
    if (direction === "south") return 3;
    if (direction === "west") return 4;
    if (direction === "east") return 5;
}

export function addItemFromHopper(block, entity) {
    if (!block?.isValid || !entity?.isValid) return;

    const storageComponent = block.getComponent("rc_sd:storage_drawer");
    const compactComponent = block.getComponent("rc_sd:compact_drawer");

    const config =
        storageComponent?.customComponentParameters.params ??
        compactComponent?.customComponentParameters.params;

    if (!config) return;

    if (compactComponent) {
        return addItemFromHopperCompact(block, entity, config);
    }

    return addItemFromHopperNormal(block, entity, config);
}

function addItemFromHopperNormal(block, entity, config) {
    const type = config.type;
    const amountPerSlot = config.amount_per_slot;

    const drawerInventory = entity.getComponent("minecraft:inventory")?.container;
    if (!drawerInventory) return;

    const faces = ["above", "east", "south", "west", "north"];

    for (const face of faces) {
        const hopperBlock = block[face]?.();
        if (!hopperBlock || hopperBlock.typeId !== "minecraft:hopper") continue;

        const states = hopperBlock.permutation.getAllStates();

        const isValidHopper =
            states["facing_direction"] === directionToNum(invertFace(face)) &&
            states["toggle_bit"] === false;

        if (!isValidHopper) continue;

        const hopperInventory = hopperBlock.getComponent("minecraft:inventory")?.container;
        if (!hopperInventory) continue;

        const visualItems = block.dimension.getEntities({
            location: block.center(),
            type: type === "1x1" ? "rc_sd:normal_visual_item" : "rc_sd:small_visual_item",
            maxDistance: 0.5,
            tags: [entity.id]
        }).sort((a, b) => Number(a.nameTag) - Number(b.nameTag));

        for (let hopperSlot = 0; hopperSlot < hopperInventory.size; hopperSlot++) {
            const hopperItem = hopperInventory.getItem(hopperSlot);
            if (!hopperItem) continue;

            for (const visualItem of visualItems) {
                if (!visualItem?.isValid) continue;

                const visualInventory = visualItem.getComponent("minecraft:inventory")?.container;
                if (!visualInventory) continue;

                let quantity = StorageQuantityScoreboard.get(visualItem);
                const maxQuantity = DrawerInventoryManager.getStorageLimit(amountPerSlot, drawerInventory);

                if (quantity >= maxQuantity) continue;

                let itemInDrawer = visualInventory.getItem(0);

                // Drawer vazio
                if (!itemInDrawer) {
                    // Se estiver lockado, não pode definir item novo
                    if (block.permutation.getState("rc_sd:lock") === true) continue;

                    const visualItemType = itemType(block, hopperItem);
                    const numberToType = typeToNumber(visualItemType);

                    const replaceId = visualItemType === "fake"
                        ? `rc_sd:${hopperItem.typeId.split(":")[1]}_item_fake`
                        : hopperItem.typeId;

                    system.runTimeout(() => {
                        visualItem.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${replaceId}`);
                    }, 1)

                    const newItem = hopperItem.clone();
                    newItem.amount = 1;

                    visualInventory.setItem(0, newItem);
                    visualItem.setProperty("rc_sd:visual_type", numberToType);

                    itemInDrawer = newItem;
                }

                if (!compareItems(hopperItem, itemInDrawer)) continue;

                const spaceLeft = maxQuantity - quantity;
                if (spaceLeft <= 0) continue;

                // Comportamento de hopper vanilla: passa 1 item por vez
                const amountToAdd = Math.min(1, hopperItem.amount, spaceLeft);

                StorageQuantityScoreboard.set(visualItem, quantity + amountToAdd);

                if (hopperItem.amount > amountToAdd) {
                    hopperItem.amount -= amountToAdd;
                    hopperInventory.setItem(hopperSlot, hopperItem);
                } else {
                    hopperInventory.setItem(hopperSlot, undefined);
                }

                const newQuantity = quantity + amountToAdd;

                const displayItem = itemInDrawer.clone();
                displayItem.amount = 1;
                displayItem.nameTag = `§r§f${normalizeNumber(newQuantity)}/${normalizeNumber(maxQuantity)}`;

                const inventorySlot = getInventorySlot(type, Number(visualItem.nameTag));
                setItemSlot(displayItem, inventorySlot, entity);

                const visual = formatVisualNumber(newQuantity);

                for (const [key, value] of Object.entries(visual)) {
                    visualItem.setProperty(`rc_sd:${key}`, value);
                }

                // Depois de mover 1 item, para imitar o hopper vanilla.
                return;
            }
        }
    }
}

function addItemFromHopperCompact(block, inventoryEntity, config) {
    const drawerInventory = inventoryEntity.getComponent("minecraft:inventory")?.container;
    if (!drawerInventory) return;

    const center = block.center();
    const dimension = block.dimension;

    const faces = ["above", "east", "south", "west", "north"];

    for (const face of faces) {
        const hopperBlock = block[face]?.();
        if (!hopperBlock || hopperBlock.typeId !== "minecraft:hopper") continue;

        const states = hopperBlock.permutation.getAllStates();

        const isValidHopper =
            states["facing_direction"] === directionToNum(invertFace(face)) &&
            states["toggle_bit"] === false;

        if (!isValidHopper) continue;

        const hopperInventory = hopperBlock.getComponent("minecraft:inventory")?.container;
        if (!hopperInventory) continue;

        for (let hopperSlot = 0; hopperSlot < hopperInventory.size; hopperSlot++) {
            const hopperItem = hopperInventory.getItem(hopperSlot);
            if (!hopperItem) continue;

            const hopperGroup = getGroup(hopperItem.typeId);
            if (!hopperGroup) continue;

            const existingGroup = getExistingCompactGroup(dimension, center);

            // Drawer vazio + lockado não pode definir item novo
            if (!existingGroup && block.permutation.getState("rc_sd:lock") === true) {
                continue;
            }

            // Se já tem grupo, só aceita itens do mesmo grupo
            if (existingGroup && existingGroup !== hopperGroup) {
                continue;
            }

            const group = existingGroup ?? hopperGroup;
            const groupData = getGroupData(group);

            const itemData = getItemGroupData(groupData, hopperItem.typeId);
            if (!itemData) continue;

            const maxQuantity = DrawerInventoryManager.getStorageLimit(
                config.amount_per_slot,
                drawerInventory
            );

            const baseValue = getCompactSlotValue(0, groupData);
            const maxBase = maxQuantity * baseValue;

            let totalBase = getCompactTotalBase(dimension, center, groupData);
            if (totalBase >= maxBase) continue;

            const result = calculateHopperCompactAdd(
                hopperItem,
                itemData,
                groupData,
                totalBase,
                maxBase
            );

            if (result.amount <= 0) continue;

            totalBase += result.base;

            if (hopperItem.amount > result.amount) {
                hopperItem.amount -= result.amount;
                hopperInventory.setItem(hopperSlot, hopperItem);
            } else {
                hopperInventory.setItem(hopperSlot, undefined);
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

            // Hopper vanilla move 1 item por vez
            return;
        }
    }
}
export function getExistingCompactGroup(dimension, center) {
    for (let slot = 0; slot < 3; slot++) {
        const visualItem = getVisualItem(dimension, center, slot);
        if (!visualItem?.isValid) continue;

        const item = visualItem
            .getComponent("minecraft:inventory")
            ?.container
            ?.getItem(0);

        if (!item) continue;

        const group = getGroup(item.typeId);
        if (group) return group;
    }

    return null;
}
function calculateHopperCompactAdd(itemStack, itemData, groupData, totalBase, maxBase) {
    const value = getCompactSlotValue(itemData.relativeSlot, groupData);
    const spaceLeftBase = maxBase - totalBase;

    if (spaceLeftBase <= 0) {
        return { amount: 0, base: 0 };
    }

    const maxItemsToAdd = Math.floor(spaceLeftBase / value);

    const amount = Math.min(
        1,
        itemStack.amount,
        maxItemsToAdd
    );

    return {
        amount,
        base: amount * value
    };
}

export function removeItemFromHopper(block, slotA, slotB) {
    let [entity] = block.dimension.getEntities({
        type: block.typeId,
        location: block.center(),
        maxDistance: 0.75
    });

    const [dataBase] = block.dimension.getEntities({
        type: "vtng_pb:data_base",
        location: block.center(),
        maxDistance: 0.75
    });

    if (!dataBase) return;

    const dataInv = dataBase.getComponent("inventory").container;

    const machineConfig = {
        "vtng_pb:centrifuge": {
            updateVisual: (inv, entity) => centrifuge.updateVisualSlots(inv, entity)
        },
        "vtng_pb:powered_centrifuge": {
            updateVisual: (inv, entity) => poweredCentrifuge.updateVisualSlots(inv, entity)
        },
        "vtng_pb:heated_centrifuge": {
            updateVisual: (inv, entity) => heatedCentrifuge.updateVisualSlots(inv, entity)
        }
    };

    let config = machineConfig[block.typeId];

    if (!config && block.typeId.includes("advanced_") && block.typeId.includes("_beehive")) {
        const connection = block.permutation.getState("vtng_pb:connection_direction");
        [entity] = block.dimension.getEntities({ type: connection == "none" ? "vtng_pb:advanced_beehive" : "vtng_pb:advanced_beehive_expanded", location: block.center(), maxDistance: 0.75 });
        config = {
            updateVisual: (inv, entity) => beeHive.updateVisualSlots(inv, entity)
        };
    }

    if (!config) return;

    const hopper = block.below();
    if (!hopper || hopper.typeId !== "minecraft:hopper") return;

    const states = hopper.permutation.getAllStates();
    if (states["toggle_bit"] !== false) return;

    const hopperInv = hopper.getComponent("inventory").container;

    for (let i = slotA; i <= slotB; i++) {
        const item = dataInv.getItem(i);
        if (!item) continue;

        const newItem = item.clone();
        newItem.amount = 1;

        const leftover = hopperInv.addItem(newItem);

        if (!leftover) {
            if (item.amount > 1) {
                item.amount--;
                dataInv.setItem(i, item);
            } else
                dataInv.setItem(i, null);

            if (entity)
                config.updateVisual(dataInv, entity);

            break;
        }
    }
}

/**
 * Retorna a face oposta (invertida).
 * @param {"above"|"below"|"north"|"south"|"west"|"east"} face
 * @returns {string|undefined}
 */
export function invertFace(face) {
    if (face == "above") return "below";
    if (face == "below") return "above";
    if (face == "north") return "south";
    if (face == "south") return "north";
    if (face == "west") return "east";
    if (face == "east") return "west";
}

/**
 * Converte uma face “local” (relativa) para a face “real” no mundo, baseado no state de rotação do bloco.
 * @param {mc.Block} block
 * @param {"north"|"south"|"west"|"east"} face Face relativa
 * @param {string} [stateName="minecraft:cardinal_direction"] Nome do state
 * @returns {string}
 */
export function trueFace(block, face, stateName) {
    const rotation = block?.permutation?.getState(stateName || "minecraft:cardinal_direction");
    if (!rotation) return face;

    const faceMap = {
        north: { north: "north", south: "south", west: "west", east: "east" },
        east: { north: "west", south: "east", west: "south", east: "north" },
        south: { north: "south", south: "north", west: "east", east: "west" },
        west: { north: "east", south: "west", west: "north", east: "south" },
    };

    return faceMap[rotation]?.[face] || face;
}

export function setPermutation(block, stateAdd, stateValue) {
    const result = block.permutation.getAllStates();
    result[stateAdd] = stateValue;
    block.setPermutation(BlockPermutation.resolve(block?.typeId, result));
}

export function moveItemFromContainers(
    fromContainer,
    fromSlot,
    toContainer,
    toSlot,
    quantity
) {
    if (!fromContainer || !toContainer) return 0;
    if (typeof quantity !== "number" || quantity <= 0) return 0;

    const src = fromContainer.getItem(fromSlot);
    if (!src) return 0;

    // limita à quantidade disponível no slot
    const toMove = Math.min(quantity | 0, src.amount);

    // clona e ajusta a quantidade
    const clone = src.clone();
    clone.amount = toMove;

    // coloca no destino (sobrescreve)
    toContainer.setItem(toSlot, clone);

    // desconta do slot de origem
    const remaining = src.amount - toMove;
    if (remaining > 0) {
        const newSrc = src.clone();
        newSrc.amount = remaining;
        fromContainer.setItem(fromSlot, newSrc);
    } else {
        fromContainer.setItem(fromSlot, undefined); // limpa slot
    }

    return toMove;
}

const lastClickTimes = new Map();
export function doubleClick(player) {
    const currentTime = Date.now();
    const playerId = player.name;

    if (lastClickTimes.has(playerId) && currentTime - lastClickTimes.get(playerId) < 260) {
        player.addTag("rc_sd:doubleClick");
    } else {
        player.removeTag("rc_sd:doubleClick");
    }

    lastClickTimes.set(playerId, currentTime);
}

export function formatVisualNumber(value) {
    if (value >= 1_000_000_000) {
        return makeCompact(value / 1_000_000_000, 3); // B
    }

    if (value >= 1_000_000) {
        return makeCompact(value / 1_000_000, 2); // M
    }

    if (value >= 1_000) {
        return makeCompact(value / 1_000, 1); // K
    }

    return makePlain(value);
}

function makeCompact(num, suffix) {
    const fixed = num.toFixed(1);
    const parts = fixed.split(".");

    const integer = parts[0];
    const decimal = parts[1];

    const digits = integer.padStart(3, " ").slice(-3);

    return {
        digit_0: charToDigit(digits[0]),
        digit_1: charToDigit(digits[1]),
        digit_2: charToDigit(digits[2]),

        dot: true,

        digit_3: charToDigit(decimal[0]),

        suffix: suffix
    };
}

function makePlain(value) {
    const text = Math.floor(value).toString().padStart(3, " ").slice(-3);

    return {
        digit_0: charToDigit(text[0]),
        digit_1: charToDigit(text[1]),
        digit_2: charToDigit(text[2]),

        dot: false,

        digit_3: 10,

        suffix: 0
    };
}

function charToDigit(char) {
    if (char === " ") return 10;
    return Number(char);
}

const watchedSlots = [0,1,2,3,4]; // slots que você quer observar
const previous = new Map();

function getSlotKey(entityId, slot) {
    return `${entityId}:${slot}`;
}

export function checkSlots(entity) {
    const inventory = entity.getComponent("minecraft:inventory");
    const container = inventory?.container;

    if (!container) return false;

    const entityId = entity.id;
    const slots = watchedSlots;
    const prev = previous;

    let changed = false;

    for (let i = 0, len = slots.length; i < len; i++) {

        const slot = slots[i];
        const key = getSlotKey(entityId, slot);

        const currentItem = container.getItem(slot);
        const previousItem = prev.get(key);

        if (currentItem == null) {
            if (previousItem != null) {
                prev.delete(key);
                changed = true;
            }

            continue;
        }

        if (previousItem == null) {
            prev.set(key, currentItem.clone());
            changed = true;
            continue;
        }

        if (!compareItems(previousItem, currentItem)) {
            prev.set(key, currentItem.clone());
            changed = true;
        }
    }

    return changed;
}

export function compareItems(a, b) {
    if (!a || !b) return false;

    // typeId
    if ((a.typeId ?? "") !== (b.typeId ?? "")) return false;

    // nameTag
    if ((a.nameTag ?? "") !== (b.nameTag ?? "")) return false;

    // lore
    const loreA = a.getLore() ?? [];
    const loreB = b.getLore() ?? [];

    if (loreA.length !== loreB.length) return false;

    for (let i = 0; i < loreA.length; i++) {
        if (loreA[i] !== loreB[i]) return false;
    }

    // tags
    const tagsA = [...(a.getTags() ?? [])].sort();
    const tagsB = [...(b.getTags() ?? [])].sort();

    if (tagsA.length !== tagsB.length) return false;

    for (let i = 0; i < tagsA.length; i++) {
        if (tagsA[i] !== tagsB[i]) return false;
    }

    // canDestroy
    const canDestroyA = [...(a.getCanDestroy?.() ?? [])].sort();
    const canDestroyB = [...(b.getCanDestroy?.() ?? [])].sort();

    if (canDestroyA.length !== canDestroyB.length) return false;

    for (let i = 0; i < canDestroyA.length; i++) {
        if (canDestroyA[i] !== canDestroyB[i]) return false;
    }

    // canPlaceOn
    const canPlaceOnA = [...(a.getCanPlaceOn?.() ?? [])].sort();
    const canPlaceOnB = [...(b.getCanPlaceOn?.() ?? [])].sort();

    if (canPlaceOnA.length !== canPlaceOnB.length) return false;

    for (let i = 0; i < canPlaceOnA.length; i++) {
        if (canPlaceOnA[i] !== canPlaceOnB[i]) return false;
    }

    // durabilidade
    const durA = a.getComponent("durability")?.damage ?? 0;
    const durB = b.getComponent("durability")?.damage ?? 0;

    if (durA !== durB) return false;

    // encantamentos
    const enchA = a.getComponent("enchantable")?.getEnchantments?.() ?? [];
    const enchB = b.getComponent("enchantable")?.getEnchantments?.() ?? [];

    const normalizeEnchantments = (enchants) => {
        return enchants
            .map(e => ({
                id: e.type.id,
                level: e.level
            }))
            .sort((a, b) => {
                if (a.id === b.id) return a.level - b.level;
                return a.id.localeCompare(b.id);
            });
    };

    const sortedEnchA = normalizeEnchantments(enchA);
    const sortedEnchB = normalizeEnchantments(enchB);

    if (sortedEnchA.length !== sortedEnchB.length) return false;

    for (let i = 0; i < sortedEnchA.length; i++) {
        if (sortedEnchA[i].id !== sortedEnchB[i].id) return false;
        if (sortedEnchA[i].level !== sortedEnchB[i].level) return false;
    }

    // propriedades dinâmicas
    const dynIdsA = [...(a.getDynamicPropertyIds?.() ?? [])].sort();
    const dynIdsB = [...(b.getDynamicPropertyIds?.() ?? [])].sort();

    if (dynIdsA.length !== dynIdsB.length) return false;

    for (let i = 0; i < dynIdsA.length; i++) {
        if (dynIdsA[i] !== dynIdsB[i]) return false;

        const valueA = a.getDynamicProperty(dynIdsA[i]);
        const valueB = b.getDynamicProperty(dynIdsB[i]);

        if (valueA !== valueB) return false;
    }

    return true;
}

export function normalizeString(id) {
    if (!id || typeof id !== "string") return "";

    return id
        // remove namespace, exemplo: rc_sd:oak_drawer → oak_drawer
        .split(":")
        .pop()

        // troca _ e - por espaço
        .replace(/[_-]+/g, " ")

        // remove espaços extras
        .trim()
        .replace(/\s+/g, " ")

        // coloca primeira letra de cada palavra em maiúscula
        .replace(/\b\w/g, char => char.toUpperCase());
}

export function normalizeNumber(value) {
    const number = Number(value);

    if (Number.isNaN(number)) return "0";

    const abs = Math.abs(number);

    const units = [
        { value: 1_000_000_000_000_000, suffix: "Q" },
        { value: 1_000_000_000_000, suffix: "T" },
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "K" },
    ];

    if (abs < 1000) {
        return `${number}`;
    }

    for (const unit of units) {
        if (abs >= unit.value) {
            const formatted = (number / unit.value)
                .toFixed(1);

            return `${formatted}${unit.suffix}`;
        }
    }

    return `${number}`;
}

export const itemType = (block, item) => ItemTypeManager.get(block, item);
export const typeToNumber = type => ItemTypeManager.toNumber(type);
export const getInventorySlot = (type, visualSlot) => DrawerInventoryManager.getInventorySlot(type, visualSlot);
const getContainer = e => e?.getComponent?.("minecraft:inventory")?.container ?? e?.getComponent?.("inventory")?.container;
export function setItemSlot(item, slot, entity) {
    const container = getContainer(entity);
    if (!container) return false;
    container.setItem(slot, item);
    return true;
}

export class ItemTypeManager {
    static typeNumbers = Object.freeze({
        block: 128,
        item: 127,
        invert: 126,
        weapon: 125,
        stair: 124,

        misc: 3,
        small: 4,
        beacon: 5,
        heavy: 8,
        wall: 9,
        rod: 10,
        dripstone: 11,
        fake: 12,

    });

    static nonBlockItems = new Set([
        "minecraft:lantern",
        "minecraft:soul_lantern",
        "minecraft:deadbush",
        "minecraft:sniffer_egg",
        "minecraft:lever",
        "minecraft:flower_pot",
        "minecraft:frog_spawn",
        "minecraft:web",
        "minecraft:nether_wart",
        "minecraft:dandelion",
        "minecraft:peony",
        "minecraft:blue_orchid",
        "minecraft:cornflower",
        "minecraft:sunflower",
        "minecraft:torchflower",
        "minecraft:poppy",
        "minecraft:azure_bluet",
        "minecraft:lily_of_the_valley",
        "minecraft:allium",
        "minecraft:lilac",
        "minecraft:pitcher_plant",
        "minecraft:oxeye_daisy",
        "minecraft:open_eyeblossom",
        "minecraft:closed_eyeblossom",
        "minecraft:bush",
        "minecraft:mangrove_propagule",
        "minecraft:crimson_fungus",
        "minecraft:warped_fungus",
        "minecraft:leaf_litter",
        "minecraft:glow_lichen",
        "minecraft:seagrass",
        "minecraft:nether_sprouts",
        "minecraft:hanging_roots"
    ]);

    static fakeItems = new Set([
        "minecraft:banner",
        "minecraft:bow",
        "minecraft:crossbow",
        "minecraft:shield",
        "minecraft:spyglass",
        "minecraft:trident"
    ]);

    static invertBlocks = new Set([
        "minecraft:chest",
        "minecraft:trapped_chest",
        "minecraft:ender_chest",
        "rc_sd:storage_controller"
    ]);

    static exactBlockItems = new Set([
        "minecraft:bedrock",
        "minecraft:end_portal_frame"
    ]);

    static exactWeaponItems = new Set([
        "minecraft:mace",
        "minecraft:breeze_rod",
        "minecraft:blaze_rod",
        "minecraft:fishing_rod",
        "minecraft:carrot_on_a_stick",
        "minecraft:warped_fungus_on_a_stick",
        "minecraft:stick",
        "minecraft:bamboo"
    ]);

    static nonBlockPatterns = [
        "kelp",
        "coral",
        "vine",
        "glowstone_dust",
        "hopper",
        "chain",
        "resin_clump",
        "candle",
        "campfire",
        "cauldron",
        "armor_stand",
        "sign",
        "item_frame",
        "painting",
        "mushroom",
        "bell",
        "rail",
        "torch",
        "amethyst_cluster",
        "bud",
        "_door",
        "ladder",
        "iron_bars",
        "bed",
        "sea_pickle",
        "brewing_stand",
        "tripwire_hook",
        "sapling",
        "_grass",
        "fern",
        "tulip",
        "rose",
        "bush"
    ];

    static weaponSuffixes = [
        "_sword",
        "_pickaxe",
        "_axe",
        "_shovel",
        "_hoe"
    ];

    static blockCache = new Map();

    static get(block, item) {
        const id = item?.typeId;

        if (!id) return "item";

        if (this.fakeItems.has(id)) return "fake";

        if (id === "minecraft:frame" || id === "minecraft:glow_frame") {
            return "item";
        }

        if (this.exactBlockItems.has(id)) {
            return "block";
        }

        if (id.includes("stair")) return "stair";

        if (this.nonBlockItems.has(id) || this.matchesAny(id, this.nonBlockPatterns) || (id.startsWith("minecraft:") && id.endsWith("_lantern"))) {
            return "item";
        }

        if (this.isWeapon(id)) {
            return "weapon";
        }

        if (id.includes("_wall")) return "wall";

        if (this.invertBlocks.has(id) || (id.endsWith("_chest"))) {
            return "invert";
        }

        if (id === "minecraft:pointed_dripstone") return "dripstone";
        if (id === "minecraft:heavy_core") return "heavy";

        if (id === "minecraft:end_rod" || id === "minecraft:lightning_rod") {
            return "rod";
        }

        if (this.isRegisteredBlock(id)) {
            return "block";
        }

        // Use isso só como fallback extremo, porque altera o mundo.
        if (this.canSetBlockCached(block, id)) {
            return "block";
        }

        return "item";
    }

    static isWeapon(id) {
        if (this.exactWeaponItems.has(id)) return true;

        const shortId = id.split(":")[1] ?? id;

        return this.weaponSuffixes.some(suffix => shortId.endsWith(suffix));
    }

    static matchesAny(id, patterns) {
        return patterns.some(pattern => id.includes(pattern));
    }

    static toNumber(type) {
        return this.typeNumbers[type] ?? this.typeNumbers.item;
    }

    static isRegisteredBlock(typeId) {
        try {
            return !!BlockTypes.get(typeId);
        } catch {
            return false;
        }
    }

    static canSetBlockCached(block, typeId) {
        if (this.blockCache.has(typeId)) {
            return this.blockCache.get(typeId);
        }

        const result = this.canSetBlock(block, typeId);
        this.blockCache.set(typeId, result);

        return result;
    }

    static canSetBlock(block, typeId) {
        if (!block?.dimension || !typeId) return false;

        try {
            const pos = `${block.x} -64 ${block.z}`;

            const test = block.dimension.runCommand(`setblock ${pos} ${typeId}`);

            if (test.successCount <= 0) {
                return false;
            }

            block.dimension.runCommand(`setblock ${pos} bedrock`);

            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Cardinal → Rotation XY
 */
export const cardinalToRotation = {
    north: { x: 0, y: 0 },
    south: { x: 0, y: 180 },
    west: { x: 0, y: -90 },
    east: { x: 0, y: 90 },
    up: { x: -90, y: 0 },
    down: { x: 90, y: 0 }
};

/**
 * Classe utilitária de vetor 3D.
 * - Representa um ponto/direção no espaço com x, y, z.
 */
export class Vector {
    /**
     * @param {number} [x=0] Coordenada X
     * @param {number} [y=0] Coordenada Y
     * @param {number} [z=0] Coordenada Z
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Soma dois vetores (x+y+z).
     * @param {{x:number,y:number,z:number}} vetorA
     * @param {{x:number,y:number,z:number}} vetorB
     * @returns {Vector} Novo Vector com a soma
     */
    static sum(vetorA, vetorB) {
        return new Vector(
            (vetorA?.x || 0) + (vetorB?.x || 0),
            (vetorA?.y || 0) + (vetorB?.y || 0),
            (vetorA?.z || 0) + (vetorB?.z || 0)
        );
    }

    /**
     * Multiplica um vetor por um escalar.
     * @param {{x:number,y:number,z:number}} vetor
     * @param {number} num
     * @returns {Vector}
     */
    static multiply(vetor, num) {
        return new Vector((vetor?.x || 0) * num, (vetor?.y || 0) * num, (vetor?.z || 0) * num);
    }

    /**
     * Distância Euclidiana 3D entre dois vetores (com Y).
     * @param {{x:number,y:number,z:number}} vetorA
     * @param {{x:number,y:number,z:number}} vetorB
     * @returns {number|undefined} Distância, ou undefined se faltar parâmetro
     */
    static distance(vetorA, vetorB) {
        if (!vetorA || !vetorB) return undefined;
        const dx = (vetorA.x || 0) - (vetorB.x || 0);
        const dy = (vetorA.y || 0) - (vetorB.y || 0);
        const dz = (vetorA.z || 0) - (vetorB.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Distância no plano XZ (ignora Y).
     * @param {{x:number,y?:number,z:number}} vetorA
     * @param {{x:number,y?:number,z:number}} vetorB
     * @returns {number|undefined}
     */
    static distanceXZ(vetorA, vetorB) {
        if (!vetorA || !vetorB) return undefined;
        const dx = (vetorA.x || 0) - (vetorB.x || 0);
        const dz = (vetorA.z || 0) - (vetorB.z || 0);
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Subtrai vetorB de vetorA (A - B).
     * @param {{x:number,y:number,z:number}} vetorA
     * @param {{x:number,y:number,z:number}} vetorB
     * @returns {Vector|undefined}
     */
    static subtract(vetorA, vetorB) {
        if (!vetorA || !vetorB) return undefined;
        return new Vector((vetorA.x || 0) - (vetorB.x || 0), (vetorA.y || 0) - (vetorB.y || 0), (vetorA.z || 0) - (vetorB.z || 0));
    }

    /**
     * Compara igualdade estrita de coordenadas.
     * @param {{x:number,y:number,z:number}} a
     * @param {{x:number,y:number,z:number}} b
     * @returns {boolean}
     */
    static compare(a, b) {
        return a?.x === b?.x && a?.y === b?.y && a?.z === b?.z;
    }

    /**
     * Normaliza (transforma em vetor unitário).
     * @param {{x:number,y:number,z:number}} vetor
     * @returns {{x:number,y:number,z:number}} Objeto normalizado
     */
    static normalize(vetor) {
        const m = Math.hypot(vetor?.x || 0, vetor?.y || 0, vetor?.z || 0) || 1;
        return { x: (vetor?.x || 0) / m, y: (vetor?.y || 0) / m, z: (vetor?.z || 0) / m };
    }

    /**
     * Cria uma lista de posições formando um círculo no plano XZ, no Y do bloco.
     * @param {Block} startblock Bloco de referência (usa center())
     * @param {number} radius Raio do círculo
     * @param {number} numBlocks Quantidade de pontos no círculo
     * @returns {Vector[]} Lista de vetores (posições)
     */
    static createCircle(startblock, radius, numBlocks) {
        if (!startblock || !radius || !numBlocks) return [];
        const softness = (2 * Math.PI) / numBlocks;
        const blockLocations = [];
        const startBlockCenter = startblock.center();

        for (let i = 0; i < numBlocks; i++) {
            const x = startBlockCenter.x + radius * Math.cos(i * softness);
            const z = startBlockCenter.z + radius * Math.sin(i * softness);
            const y = startBlockCenter.y;
            blockLocations.push(new Vector(x, y, z));
        }
        return blockLocations;
    }

    /**
     * Converte um vetor relativo (offset) para absoluto somando no "base".
     * @param {{x:number,y:number,z:number}} base
     * @param {{x:number,y:number,z:number}} relative
     * @returns {{x:number,y:number,z:number}}
     */
    static relativeToAbsolute(base, relative) {
        return { x: base.x + relative.x, y: base.y + relative.y, z: base.z + relative.z };
    }
}

export class StorageQuantityScoreboard {
    static objectiveName = "rc_sd:storage_quantity";

    /**
     * Garante que o scoreboard existe.
     */
    static getObjective() {
        let objective = world.scoreboard.getObjective(this.objectiveName);

        if (!objective) {
            objective = world.scoreboard.addObjective(
                this.objectiveName,
                this.objectiveName
            );
        }

        return objective;
    }

    /**
     * Adiciona uma entidade no scoreboard com valor inicial.
     */
    static addEntity(entity, initialValue = 0) {
        const objective = this.getObjective();

        if (!entity) return false;

        objective.setScore(entity, initialValue);
        return true;
    }

    /**
     * Remove uma entidade do scoreboard.
     */
    static removeEntity(entity) {
        const objective = this.getObjective();

        if (!entity?.scoreboardIdentity) return false;

        objective.removeParticipant(entity.scoreboardIdentity);
        return true;
    }

    /**
     * Verifica se a entidade está no scoreboard.
     */
    static hasEntity(entity) {
        const objective = this.getObjective();

        if (!entity?.scoreboardIdentity) return false;

        try {
            objective.getScore(entity.scoreboardIdentity);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Pega a quantidade atual da entidade.
     */
    static get(entity) {
        const objective = this.getObjective();

        if (!entity?.scoreboardIdentity) return 0;

        try {
            return objective.getScore(entity.scoreboardIdentity) ?? 0;
        } catch {
            return 0;
        }
    }

    /**
     * Define uma quantidade exata para a entidade.
     */
    static set(entity, value) {
        const objective = this.getObjective();

        if (!entity?.scoreboardIdentity) return false;

        objective.setScore(entity.scoreboardIdentity, value);
        return true;
    }

    /**
     * Soma pontos para a entidade.
     */
    static add(entity, amount = 1) {
        const current = this.get(entity);
        console.warn(current)
        return this.set(entity, current + amount);
    }

    /**
     * Diminui pontos da entidade.
     */
    static remove(entity, amount = 1) {
        const current = this.get(entity);
        return this.set(entity, current - amount);
    }

    /**
     * Diminui pontos, mas nunca deixa abaixo de zero.
     */
    static removeClamped(entity, amount = 1) {
        const current = this.get(entity);
        const next = Math.max(0, current - amount);

        return this.set(entity, next);
    }

    /**
     * Zera os pontos da entidade.
     */
    static clear(entity) {
        return this.set(entity, 0);
    }

    /**
     * Adiciona a entidade se ela ainda não existir.
     */
    static ensureEntity(entity, initialValue = 0) {
        if (!entity?.scoreboardIdentity) return false;

        if (!this.hasEntity(entity)) {
            return this.addEntity(entity, initialValue);
        }

        return true;
    }

    /**
     * Pega todos os participantes desse scoreboard.
     */
    static getParticipants() {
        const objective = this.getObjective();
        return objective.getParticipants();
    }

    /**
     * Pega todos os participantes com suas pontuações.
     */
    static getAllScores() {
        const objective = this.getObjective();

        return objective.getParticipants().map(participant => {
            return {
                participant,
                score: objective.getScore(participant) ?? 0
            };
        });
    }

    /**
     * Remove todos os participantes desse scoreboard.
     */
    static clearAll() {
        const objective = this.getObjective();

        for (const participant of objective.getParticipants()) {
            objective.removeParticipant(participant);
        }
    }
}

export class DrawerInventoryManager {
    static upgrades = {
        "rc_sd:copper_upgrade": 8,
        "rc_sd:iron_upgrade": 12,
        "rc_sd:gold_upgrade": 16,
        "rc_sd:diamond_upgrade": 24,
        "rc_sd:netherite_upgrade": 32
    };

    static getStorageLimit(amountPerSlot, inventory) {
        let limit = amountPerSlot;
        let hasVoidUpgrade = false;

        for (let slot = 0; slot < inventory.size; slot++) {
            const item = inventory.getItem(slot);

            if (!item) continue;

            const upgradeMultiplier = this.upgrades[item.typeId];

            if (upgradeMultiplier) {
                limit += limit * upgradeMultiplier;
            }

            else if (item.typeId === "rc_sd:iron_downgrade") {
                limit = 64;
            }

            if (item.typeId === "rc_sd:void_utility") {
                hasVoidUpgrade = true;
            }
        }

        return limit;
    }

    static slotInventoryMap = Object.freeze({ "ender": [6], "1x1": [6], "1x2": [7, 8], "2x2": [9, 10, 11, 12], "compact": [7, 11, 12] });
    static listUpgrade = Object.freeze({ "rc_sd:copper_upgrade": 8, "rc_sd:gold_upgrade": 16, "rc_sd:diamond_upgrade": 24, "rc_sd:netherite_upgrade": 32 });
    static utilityUpgrade = Object.freeze(["rc_sd:void_upgrade"]);

    static getInventorySlot(type, visualSlot) { return this.slotInventoryMap[type]?.[visualSlot]; }
}

/**
 * InventoryManager
 * ------------------------------------------------------------------
 * Classe utilitária para manipular inventário/equipamentos de players
 * e entidades com inventário.
 *
 * Ideia:
 * - centralizar tudo em uma classe só
 * - evitar repetir lógica de container/equipment
 * - facilitar consumo de item, dano, limpeza de mão, troca de slot etc
 *
 * Pode ser usada assim:
 *
 * const inv = new InventoryManager(player);
 * inv.removeFromSelectedSlot(1);
 * inv.clearMainhand(1);
 * inv.damageSelectedItem(1);
 * inv.setSlot(5, new ItemStack("minecraft:stone", 64));
 */
export class InventoryManager {
    /**
     * @param {import("@minecraft/server").Entity} source
     */
    constructor(source) {
        this.source = source;
    }

    // =========================================================
    // COMPONENTES / GETTERS BASE
    // =========================================================

    /**
     * Retorna o componente de inventário da entidade, se existir.
     * @returns {import("@minecraft/server").EntityInventoryComponent | undefined}
     */
    get inventoryComponent() {
        return this.source?.getComponent?.("minecraft:inventory")
            ?? this.source?.getComponent?.("inventory");
    }

    /**
     * Retorna o container do inventário, se existir.
     * @returns {import("@minecraft/server").Container | undefined}
     */
    get container() {
        return this.inventoryComponent?.container;
    }

    /**
     * Retorna o componente de equipamentos, se existir.
     * @returns {import("@minecraft/server").EntityEquippableComponent | undefined}
     */
    get equipmentComponent() {
        return this.source?.getComponent?.("minecraft:equippable")
            ?? this.source?.getComponent?.("equippable");
    }

    /**
     * Retorna se a entidade possui container.
     * @returns {boolean}
     */
    get hasContainer() {
        return !!this.container;
    }

    /**
     * Retorna o tamanho do inventário.
     * @returns {number}
     */
    get size() {
        return this.container?.size ?? 0;
    }

    /**
     * Retorna true se a source for player.
     * @returns {boolean}
     */
    get isPlayer() {
        return this.source?.typeId === "minecraft:player";
    }

    /**
     * Retorna o gamemode atual, se a source for player.
     * Em entidades normais, retorna undefined.
     * @returns {string | undefined}
     */
    getGameMode() {
        try {
            return this.source?.getGameMode?.();
        } catch {
            return undefined;
        }
    }

    /**
     * Retorna true se o player estiver em criativo.
     * @returns {boolean}
     */
    isCreative() {
        return this.getGameMode?.() === "Creative" || this.getGameMode?.() === "creative";
    }

    /**
     * Retorna true se o player estiver em sobrevivência.
     * @returns {boolean}
     */
    isSurvival() {
        return this.getGameMode?.() === "Survival" || this.getGameMode?.() === "survival";
    }

    /**
     * Verifica se um índice de slot é válido.
     * @param {number} slot
     * @returns {boolean}
     */
    isValidSlot(slot) {
        return Number.isInteger(slot) && slot >= 0 && slot < this.size;
    }

    // =========================================================
    // LEITURA BÁSICA
    // =========================================================

    /**
     * Retorna o item de um slot.
     * @param {number} slot
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    getSlot(slot) {
        if (!this.hasContainer || !this.isValidSlot(slot)) return undefined;
        return this.container.getItem(slot);
    }

    /**
     * Retorna o índice do slot selecionado do player.
     * Se não for player, retorna undefined.
     * @returns {number | undefined}
     */
    getSelectedSlot() {
        if (!this.isPlayer) return undefined;
        return this.source.selectedSlotIndex;
    }

    /**
     * Retorna o item do slot selecionado.
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    getSelectedItem() {
        const slot = this.getSelectedSlot();
        if (slot === undefined) return undefined;
        return this.getSlot(slot);
    }

    /**
     * Retorna equipamento de um slot de armor/mão.
     * Ex:
     * - EquipmentSlot.Mainhand
     * - EquipmentSlot.Offhand
     * - EquipmentSlot.Head
     * @param {EquipmentSlot} slot
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    getEquipment(slot) {
        return this.equipmentComponent?.getEquipment?.(slot);
    }

    /**
     * Retorna todos os equipamentos principais em um objeto.
     * @returns {{
     *  mainhand?: import("@minecraft/server").ItemStack,
     *  offhand?: import("@minecraft/server").ItemStack,
     *  head?: import("@minecraft/server").ItemStack,
     *  chest?: import("@minecraft/server").ItemStack,
     *  legs?: import("@minecraft/server").ItemStack,
     *  feet?: import("@minecraft/server").ItemStack
     * }}
     */
    getEquipments() {
        const eq = this.equipmentComponent;
        if (!eq) return {};

        return {
            mainhand: eq.getEquipment(EquipmentSlot.Mainhand),
            offhand: eq.getEquipment(EquipmentSlot.Offhand),
            head: eq.getEquipment(EquipmentSlot.Head),
            chest: eq.getEquipment(EquipmentSlot.Chest),
            legs: eq.getEquipment(EquipmentSlot.Legs),
            feet: eq.getEquipment(EquipmentSlot.Feet)
        };
    }

    /**
     * Retorna todos os itens do inventário em array.
     * Slots vazios podem ser pulados.
     * @param {boolean} includeEmpty Se true, retorna undefined nos slots vazios
     * @returns {(import("@minecraft/server").ItemStack | undefined)[]}
     */
    getAllSlots(includeEmpty = false) {
        if (!this.hasContainer) return [];
        const list = [];
        for (let i = 0; i < this.size; i++) {
            const item = this.container.getItem(i);
            if (includeEmpty || item) list.push(item);
        }
        return list;
    }

    /**
    * Retorna todas as entradas da hotbar com slot + item.
    *
    * @param {boolean} includeEmpty Se true, inclui slots vazios
    * @param {boolean} includeSelected Se true, inclui o slot selecionado
    * @returns {{ slot: number, item?: import("@minecraft/server").ItemStack }[]}
    */
    getHotbar(includeEmpty = false, includeSelected = true) {
        if (!this.hasContainer) return [];

        const selectedSlot = this.getSelectedSlot();
        const list = [];

        for (let i = 0; i < 9; i++) {
            if (!includeSelected && selectedSlot === i) continue;

            const item = this.getSlot(i);
            if (includeEmpty || item) {
                list.push({ slot: i, item });
            }
        }

        return list;
    }

    /**
     * Encontra o primeiro slot que contenha um item do typeId informado.
     * @param {string} typeId
     * @returns {number}
     */
    findFirstSlotByType(typeId) {
        if (!this.hasContainer) return -1;
        for (let i = 0; i < this.size; i++) {
            const item = this.container.getItem(i);
            if (item?.typeId === typeId) return i;
        }
        return -1;
    }

    /**
     * Retorna todos os slots que possuem o typeId informado.
     * @param {string} typeId
     * @returns {number[]}
     */
    findAllSlotsByType(typeId) {
        if (!this.hasContainer) return [];
        const result = [];
        for (let i = 0; i < this.size; i++) {
            const item = this.container.getItem(i);
            if (item?.typeId === typeId) result.push(i);
        }
        return result;
    }

    /**
 * Retorna as entradas da hotbar que são blocos colocáveis
 * (possuem o componente "minecraft:block_placer" ou são typeId de bloco).
 * Exclui itens sem quantidade, slots vazios e o slot selecionado (wand).
 *
 * Estratégia de detecção de bloco:
 *  - Tenta getComponent("minecraft:block_placer") → item é colocável
 *  - Fallback: typeId que NÃO começa com "minecraft:air"
 *    e possui um BlockType registrado no mundo
 *
 * @param {boolean} includeSelected - Se true, inclui o slot da wand
 * @returns {{ slot: number, item: import("@minecraft/server").ItemStack }[]}
 */
    getPlaceableHotbar(includeSelected = false) {
        const entries = this.getHotbar(false, includeSelected);
        return entries.filter(({ item }) => {
            if (!item || item.amount <= 0) return false;
            // Tenta pelo componente oficial de bloco colocável
            if (item.getComponent?.("minecraft:block_placer")) return true;
            // Fallback: verifica se existe um BlockType com esse id
            try {
                return !!BlockTypes.get(item.typeId);
            } catch {
                return false;
            }
        });
    }

    /**
     * Sorteia aleatoriamente uma entrada dentre os colocáveis da hotbar
     * e consome 1 unidade daquele slot.
     *
     * Retorna o typeId do item consumido, ou undefined se não houver
     * nenhum item disponível.
     *
     * @param {{ slot: number, item: import("@minecraft/server").ItemStack }[]} placeableEntries
     *   Lista obtida via getPlaceableHotbar() — reutilize a mesma snapshot
     *   para não re-checar o inventário a cada bloco.
     * @returns {string | undefined} typeId sorteado, ou undefined
     */
    consumeRandomPlaceable(placeableEntries) {
        const available = placeableEntries.filter(e => e.item.amount > 0);
        if (!available.length) return undefined;

        const entry = available[Math.floor(Math.random() * available.length)];
        const typeId = entry.item.typeId;

        if (entry.item.amount > 1) {
            entry.item.amount -= 1;
            this.setSlot(entry.slot, entry.item);
        } else {
            this.clearSlot(entry.slot);

            const originalIndex = placeableEntries.indexOf(entry);
            if (originalIndex !== -1) {
                placeableEntries.splice(originalIndex, 1);
            }
        }

        return typeId;
    }

    /**
     * Conta a quantidade total de um item no inventário.
     * @param {string} typeId
     * @returns {number}
     */
    count(typeId) {
        if (!this.hasContainer) return 0;
        let amount = 0;
        for (let i = 0; i < this.size; i++) {
            const item = this.container.getItem(i);
            if (item?.typeId === typeId) amount += item.amount;
        }
        return amount;
    }

    /**
     * Retorna true se houver pelo menos "amount" do item.
     * @param {string} typeId
     * @param {number} amount
     * @returns {boolean}
     */
    has(typeId, amount = 1) {
        return this.count(typeId) >= Math.max(1, amount);
    }

    // =========================================================
    // ESCRITA BÁSICA
    // =========================================================

    /**
     * Define o item em um slot.
     * Se item for undefined/null, limpa o slot.
     * @param {number} slot
     * @param {import("@minecraft/server").ItemStack | undefined | null} item
     * @returns {boolean}
     */
    setSlot(slot, item) {
        if (!this.hasContainer || !this.isValidSlot(slot)) return false;
        this.container.setItem(slot, item ?? undefined);
        return true;
    }

    /**
     * Limpa um slot específico.
     * @param {number} slot
     * @returns {boolean}
     */
    clearSlot(slot) {
        return this.setSlot(slot, undefined);
    }

    /**
     * Adiciona um item ao container.
     * Usa addItem do próprio container.
     * @param {import("@minecraft/server").ItemStack} item
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    addItem(item) {
        if (!this.hasContainer || !item) return item;
        return this.container.addItem(item);
    }

    /**
     * Troca dois slots entre si.
     * @param {number} slotA
     * @param {number} slotB
     * @returns {boolean}
     */
    swapSlots(slotA, slotB) {
        if (!this.hasContainer) return false;
        if (!this.isValidSlot(slotA) || !this.isValidSlot(slotB)) return false;

        const a = this.getSlot(slotA);
        const b = this.getSlot(slotB);

        this.setSlot(slotA, b);
        this.setSlot(slotB, a);
        return true;
    }

    /**
     * Move um item inteiro de um slot para outro.
     * Sobrescreve o destino.
     * @param {number} from
     * @param {number} to
     * @returns {boolean}
     */
    moveSlot(from, to) {
        if (!this.hasContainer) return false;
        if (!this.isValidSlot(from) || !this.isValidSlot(to)) return false;
        if (from === to) return true;

        const item = this.getSlot(from);
        this.setSlot(to, item);
        this.clearSlot(from);
        return true;
    }

    /**
     * Limpa todos os slots do inventário.
     * @returns {number} quantidade de slots limpos
     */
    clearInventory() {
        if (!this.hasContainer) return 0;
        let cleared = 0;
        for (let i = 0; i < this.size; i++) {
            if (this.getSlot(i)) {
                this.clearSlot(i);
                cleared++;
            }
        }
        return cleared;
    }

    // =========================================================
    // REMOÇÃO / CONSUMO
    // =========================================================

    /**
     * Remove quantidade de um slot específico.
     * - Se amount for menor que a pilha, decrementa
     * - Se for maior/igual, limpa o slot
     *
     * @param {number} slot
     * @param {number} amount
     * @returns {number} quanto realmente removeu
     */
    removeFromSlot(slot, amount = 1) {
        if (!this.hasContainer || !this.isValidSlot(slot)) return 0;

        amount = Math.max(1, Math.floor(amount));
        const item = this.getSlot(slot);
        if (!item) return 0;

        const removed = Math.min(item.amount, amount);

        if (item.amount > amount) {
            item.amount -= amount;
            this.setSlot(slot, item);
        } else {
            this.clearSlot(slot);
        }

        return removed;
    }

    /**
     * Remove quantidade do slot selecionado do player.
     * @param {number} amount
     * @returns {number} quanto realmente removeu
     */
    removeFromSelectedSlot(amount = 1) {
        const slot = this.getSelectedSlot();
        if (slot === undefined) return 0;
        return this.removeFromSlot(slot, amount);
    }

    /**
     * Remove itens por typeId, percorrendo o inventário inteiro.
     * Muito útil para craft, consumo e sistemas de custo.
     *
     * @param {string} typeId
     * @param {number} amount
     * @returns {number} quanto realmente removeu
     */
    removeByType(typeId, amount = 1) {
        if (!this.hasContainer) return 0;
        amount = Math.max(1, Math.floor(amount));

        let remaining = amount;
        let removed = 0;

        for (let i = 0; i < this.size; i++) {
            if (remaining <= 0) break;

            const item = this.getSlot(i);
            if (!item || item.typeId !== typeId) continue;

            const take = Math.min(item.amount, remaining);
            this.removeFromSlot(i, take);

            remaining -= take;
            removed += take;
        }

        return removed;
    }

    /**
     * Remove itens apenas se houver quantidade suficiente.
     * Não remove parcialmente.
     *
     * @param {string} typeId
     * @param {number} amount
     * @returns {boolean}
     */
    consume(typeId, amount = 1) {
        if (!this.has(typeId, amount)) return false;
        this.removeByType(typeId, amount);
        return true;
    }

    /**
     * Limpa a mão principal.
     * Em sobrevivência, remove do item equipado na mainhand.
     * Em criativo, por padrão não remove nada.
     *
     * @param {number} amount
     * @param {boolean} clearInCreative
     * @returns {number} quanto removeu
     */
    clearMainhand(amount = 1, clearInCreative = false) {
        if (!this.equipmentComponent) return 0;
        if (!clearInCreative && this.isCreative()) return 0;

        amount = Math.max(1, Math.floor(amount));
        const item = this.getEquipment(EquipmentSlot.Mainhand);
        if (!item) return 0;

        const removed = Math.min(item.amount, amount);

        if (item.amount > amount) {
            item.amount -= amount;
            this.equipmentComponent.setEquipment(EquipmentSlot.Mainhand, item);
        } else {
            this.equipmentComponent.setEquipment(EquipmentSlot.Mainhand, undefined);
        }

        return removed;
    }

    /**
     * Limpa a mão secundária.
     * @param {number} amount
     * @param {boolean} clearInCreative
     * @returns {number} quanto removeu
     */
    clearOffhand(amount = 1, clearInCreative = false) {
        if (!this.equipmentComponent) return 0;
        if (!clearInCreative && this.isCreative()) return 0;

        amount = Math.max(1, Math.floor(amount));
        const item = this.getEquipment(EquipmentSlot.Offhand);
        if (!item) return 0;

        const removed = Math.min(item.amount, amount);

        if (item.amount > amount) {
            item.amount -= amount;
            this.equipmentComponent.setEquipment(EquipmentSlot.Offhand, item);
        } else {
            this.equipmentComponent.setEquipment(EquipmentSlot.Offhand, undefined);
        }

        return removed;
    }

    // =========================================================
    // EQUIPAMENTOS
    // =========================================================

    /**
     * Define um equipamento.
     * @param {EquipmentSlot} slot
     * @param {import("@minecraft/server").ItemStack | undefined | null} item
     * @returns {boolean}
     */
    setEquipment(slot, item) {
        if (!this.equipmentComponent) return false;
        this.equipmentComponent.setEquipment(slot, item ?? undefined);
        return true;
    }

    /**
     * Remove um equipamento.
     * @param {EquipmentSlot} slot
     * @returns {boolean}
     */
    clearEquipment(slot) {
        return this.setEquipment(slot, undefined);
    }

    // =========================================================
    // DURABILIDADE
    // =========================================================

    /**
     * Aplica dano de durabilidade em um ItemStack.
     * Se quebrar, retorna undefined.
     *
     * @param {import("@minecraft/server").ItemStack} item
     * @param {number} damage
     * @param {boolean} playBreakSound
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    applyDurability(item, damage = 1, playBreakSound = true) {
        if (!item || damage <= 0 || this.isCreative()) return item;

        const durability = item.getComponent?.("minecraft:durability");
        if (!durability) return item;

        const nextDamage = durability.damage + damage;

        if (nextDamage >= durability.maxDurability) {
            if (playBreakSound && this.source?.playSound) {
                try {
                    this.source.playSound("random.break");
                } catch { }
            }
            return undefined;
        }

        durability.damage = nextDamage;
        return item;
    }

    /**
     * Aplica dano ao item de um slot específico.
     * Se quebrar, limpa o slot.
     *
     * @param {number} slot
     * @param {number} damage
     * @returns {boolean}
     */
    damageSlotItem(slot, damage = 1) {
        if (!this.hasContainer || !this.isValidSlot(slot)) return false;

        const item = this.getSlot(slot);
        if (!item) return false;

        const result = this.applyDurability(item, damage);
        this.setSlot(slot, result);
        return true;
    }

    /**
     * Aplica dano ao item do slot selecionado.
     * @param {number} damage
     * @returns {boolean}
     */
    damageSelectedItem(damage = 1) {
        const slot = this.getSelectedSlot();
        if (slot === undefined) return false;
        return this.damageSlotItem(slot, damage);
    }

    /**
     * Aplica dano a um equipamento específico.
     * Ex: mainhand, offhand, armor etc.
     *
     * @param {EquipmentSlot} slot
     * @param {number} damage
     * @returns {boolean}
     */
    damageEquipment(slot, damage = 1) {
        if (!this.equipmentComponent) return false;

        const item = this.getEquipment(slot);
        if (!item) return false;

        const result = this.applyDurability(item, damage);
        this.setEquipment(slot, result);
        return true;
    }

    // =========================================================
    // SERIALIZAÇÃO / SAVE / LOAD
    // =========================================================

    /**
     * Serializa um item para objeto simples.
     * Útil para salvar em dynamicProperty/JSON.
     *
     * @param {import("@minecraft/server").ItemStack} item
     * @returns {object | null}
     */
    serializeItem(item) {
        if (!item) return null;

        const durability = item.getComponent?.("minecraft:durability");
        const enchantable = item.getComponent?.("minecraft:enchantable");

        return {
            typeId: item.typeId,
            amount: item.amount,
            nameTag: item.nameTag,
            lore: item.getLore?.() ?? [],
            keepOnDeath: item.keepOnDeath,
            lockMode: item.lockMode,
            canDestroy: item.getCanDestroy?.() ?? [],
            canPlaceOn: item.getCanPlaceOn?.() ?? [],
            damage: durability?.damage,
            enchantments: enchantable?.getEnchantments?.()?.map(ench => ({
                typeId: ench.type.id,
                level: ench.level
            })) ?? [],
            dynamicProperties: item.getDynamicPropertyIds?.()?.map(id => [
                id,
                item.getDynamicProperty(id)
            ]) ?? []
        };
    }

    /**
     * Reconstrói um ItemStack a partir de um objeto serializado.
     *
     * @param {any} data
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    deserializeItem(data) {
        if (!data?.typeId) return undefined;

        const item = new ItemStack(data.typeId, data.amount ?? 1);

        if (data.nameTag) item.nameTag = data.nameTag;
        if (Array.isArray(data.lore)) item.setLore(data.lore);
        if (Array.isArray(data.canDestroy)) item.setCanDestroy(data.canDestroy);
        if (Array.isArray(data.canPlaceOn)) item.setCanPlaceOn(data.canPlaceOn);

        if (typeof data.keepOnDeath === "boolean") item.keepOnDeath = data.keepOnDeath;
        if (data.lockMode !== undefined) item.lockMode = data.lockMode;

        const durability = item.getComponent?.("minecraft:durability");
        if (durability && typeof data.damage === "number") {
            durability.damage = data.damage;
        }

        const enchantable = item.getComponent?.("minecraft:enchantable");
        if (enchantable && Array.isArray(data.enchantments)) {
            for (const ench of data.enchantments) {
                try {
                    enchantable.addEnchantment({
                        type: new EnchantmentType(ench.typeId),
                        level: ench.level
                    });
                } catch { }
            }
        }

        if (Array.isArray(data.dynamicProperties)) {
            for (const [id, value] of data.dynamicProperties) {
                try {
                    item.setDynamicProperty(id, value);
                } catch { }
            }
        }

        return item;
    }

    /**
     * Serializa o inventário inteiro.
     * Slots vazios são salvos como null para preservar posição.
     *
     * @returns {(object|null)[]}
     */
    serializeInventory() {
        if (!this.hasContainer) return [];

        const data = [];
        for (let i = 0; i < this.size; i++) {
            data.push(this.serializeItem(this.getSlot(i)));
        }
        return data;
    }

    /**
     * Carrega um inventário serializado.
     * Mantém os índices dos slots.
     *
     * @param {(object|null)[]} data
     * @param {boolean} clearBefore
     * @returns {boolean}
     */
    loadSerializedInventory(data, clearBefore = true) {
        if (!this.hasContainer || !Array.isArray(data)) return false;

        if (clearBefore) this.clearInventory();

        for (let i = 0; i < Math.min(data.length, this.size); i++) {
            const item = this.deserializeItem(data[i]);
            this.setSlot(i, item);
        }

        return true;
    }

    /**
     * Salva o inventário em dynamic property da entidade.
     *
     * @param {string} propertyId
     * @returns {boolean}
     */
    saveToDynamicProperty(propertyId = "inventory:save") {
        try {
            const data = this.serializeInventory();
            this.source.setDynamicProperty(propertyId, JSON.stringify(data));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Carrega o inventário de uma dynamic property.
     *
     * @param {string} propertyId
     * @param {boolean} clearBefore
     * @returns {boolean}
     */
    loadFromDynamicProperty(propertyId = "inventory:save", clearBefore = true) {
        try {
            const raw = this.source.getDynamicProperty(propertyId);
            if (typeof raw !== "string" || !raw) return false;

            const data = JSON.parse(raw);
            return this.loadSerializedInventory(data, clearBefore);
        } catch {
            return false;
        }
    }

    /**
     * Remove a dynamic property usada para save.
     * @param {string} propertyId
     * @returns {boolean}
     */
    clearSavedDynamicProperty(propertyId = "inventory:save") {
        try {
            this.source.setDynamicProperty(propertyId, undefined);
            return true;
        } catch {
            return false;
        }
    }

    // =========================================================
    // UTILITÁRIOS EXTRAS
    // =========================================================

    /**
     * Retorna uma cópia do item de um slot.
     * @param {number} slot
     * @returns {import("@minecraft/server").ItemStack | undefined}
     */
    cloneSlotItem(slot) {
        const item = this.getSlot(slot);
        return item?.clone?.();
    }

    /**
     * Retorna quantos slots vazios existem.
     * @returns {number}
     */
    getEmptySlotCount() {
        return this.container?.emptySlotsCount ?? 0;
    }

    /**
     * Retorna o primeiro slot vazio.
     * @returns {number}
     */
    findEmptySlot() {
        if (!this.hasContainer) return -1;
        for (let i = 0; i < this.size; i++) {
            if (!this.getSlot(i)) return i;
        }
        return -1;
    }

    /**
     * Verifica se o container pode receber um item sem garantir 100% da stack logic.
     * Bom para check rápido.
     *
     * @param {import("@minecraft/server").ItemStack} item
     * @returns {boolean}
     */
    canAccept(item) {
        if (!this.hasContainer || !item) return false;

        if (this.getEmptySlotCount() > 0) return true;

        for (let i = 0; i < this.size; i++) {
            const current = this.getSlot(i);
            if (!current) continue;

            if (
                current.isStackableWith?.(item) &&
                current.amount < current.maxAmount &&
                current.amount + item.amount <= current.maxAmount
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Atualiza o item do slot selecionado do player.
     * Muito útil quando você já editou o ItemStack fora.
     *
     * @param {import("@minecraft/server").ItemStack | undefined | null} item
     * @returns {boolean}
     * @param {string | false | undefined | null} sound
     */
    setSelectedItem(item, sound = false) {
        const slot = this.getSelectedSlot();
        if (sound && this.source?.playSound) {
            try {
                this.source.playSound(sound);
            } catch { }
        }
        if (slot === undefined) return false;
        return this.setSlot(slot, item);
    }
}
