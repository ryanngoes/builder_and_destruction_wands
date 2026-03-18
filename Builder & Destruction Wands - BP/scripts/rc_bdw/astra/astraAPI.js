import {
    world,
    ItemStack,
    EnchantmentType,
    EquipmentSlot,
    BlockVolume
} from "@minecraft/server";

export class FaceAreaSelector {
    static facePlanes = {
        North: ["x", "y"],
        South: ["x", "y"],
        East: ["z", "y"],
        West: ["z", "y"],
        Up: ["x", "z"],
        Down: ["x", "z"]
    };

    static faceOffset = {
        North: ["z", -1],
        South: ["z", 1],
        East: ["x", 1],
        West: ["x", -1],
        Up: ["y", 1],
        Down: ["y", -1]
    };

    static directions = [
        { x: 0, y: 0, z: -1 }, // North
        { x: 0, y: 0, z: 1 },  // South
        { x: 1, y: 0, z: 0 },  // East
        { x: -1, y: 0, z: 0 }, // West
        { x: 0, y: 1, z: 0 },  // Up
        { x: 0, y: -1, z: 0 }  // Down
    ];

    /**
     * Retorna min e max da área com base na face clicada
     * center = block.location
     * face = "North" | "South" | "East" | "West" | "Up" | "Down"
     * size = tamanho da área (ex: 3, 5, 7)
     */
    static getArea(center, face, size) {
        const plane = this.facePlanes[face];
        if (!plane) return null;

        const radius = Math.floor(size / 2);

        const min = { x: center.x, y: center.y, z: center.z };
        const max = { x: center.x, y: center.y, z: center.z };

        min[plane[0]] -= radius;
        min[plane[1]] -= radius;

        max[plane[0]] += radius;
        max[plane[1]] += radius;

        return { min, max };
    }

    static getFrontLocation(pos, face) {
        const offset = this.faceOffset[face];
        if (!offset) return null;

        const newPos = { x: pos.x, y: pos.y, z: pos.z };
        newPos[offset[0]] += offset[1];
        return newPos;
    }

    /**
     * Pega todos os blocos da área
     * Se typeId for passado, filtra por tipo
     */
    static getBlocks(dimension, center, face, size, typeId = undefined) {
        const area = this.getArea(center, face, size);
        if (!area) return [];

        const options = typeId ? { includeTypes: [typeId] } : undefined;

        return [
            ...dimension
                .getBlocks(new BlockVolume(area.min, area.max), options, true)
                .getBlockLocationIterator()
        ].map(pos => dimension.getBlock(pos));
    }

    static getBlocksWithFront(dimension, center, face, size, typeId = undefined) {
        const blocks = this.getBlocks(dimension, center, face, size, typeId);

        return blocks.map(back => ({
            back,
            front: dimension.getBlock(this.getFrontLocation(back.location, face))
        }));
    }

    /**
     * Retorna apenas os blocos conectados ao startBlock dentro da área.
     * Conexão 6-direções: North, South, East, West, Up, Down
     */
    static getConnectedBlocks(dimension, center, face, size, startBlock, typeId = undefined) {
        const blocks = this.getBlocks(dimension, center, face, size, typeId);
        if (!blocks.length) return [];

        const blockMap = new Map();
        for (const block of blocks) {
            blockMap.set(this.posKey(block.location), block);
        }

        const startKey = this.posKey(startBlock.location);
        if (!blockMap.has(startKey)) return [];

        const visited = new Set();
        const queue = [startBlock.location];
        const connected = [];

        while (queue.length > 0) {
            const pos = queue.shift();
            const key = this.posKey(pos);

            if (visited.has(key)) continue;
            visited.add(key);

            const block = blockMap.get(key);
            if (!block) continue;

            connected.push(block);

            for (const dir of this.directions) {
                const nextPos = this.addPos(pos, dir);
                const nextKey = this.posKey(nextPos);

                if (!visited.has(nextKey) && blockMap.has(nextKey)) {
                    queue.push(nextPos);
                }
            }
        }

        return connected;
    }

    static getConnectedBlocksWithFront(dimension, center, face, size, startBlock, typeId = undefined) {
        const blocks = this.getConnectedBlocks(dimension, center, face, size, startBlock, typeId);

        return blocks.map(back => ({
            back,
            front: dimension.getBlock(this.getFrontLocation(back.location, face))
        }));
    }
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

export class ItemCooldownManager {
    /**
     * Retorna o componente de cooldown de um ItemStack.
     * Se o item não tiver minecraft:cooldown, retorna undefined.
     *
     * @param {import("@minecraft/server").ItemStack | undefined} item
     * @returns {import("@minecraft/server").ItemCooldownComponent | undefined}
     */
    static getCooldownComponent(item) {
        try {
            return item?.getComponent?.("minecraft:cooldown");
        } catch {
            return undefined;
        }
    }

    /**
     * Retorna a categoria de cooldown do item.
     * Nem sempre você precisa disso manualmente, mas é útil
     * quando quiser consultar cooldown pelo player.
     *
     * @param {import("@minecraft/server").ItemStack | undefined} item
     * @param {string} fallbackCategory
     * @returns {string | undefined}
     */
    static getCooldownCategory(item, fallbackCategory = "") {
        const cooldown = this.getCooldownComponent(item);
        if (!cooldown) return fallbackCategory || undefined;

        try {
            return (cooldown.cooldownCategory ?? fallbackCategory) || undefined;
        } catch {
            return fallbackCategory || undefined;
        }
    }

    /**
     * Verifica se o item está em cooldown para aquele player.
     *
     * @param {import("@minecraft/server").Player} player
     * @param {import("@minecraft/server").ItemStack | undefined} item
     * @param {string} fallbackCategory
     * @returns {boolean}
     */
    static isOnCooldown(player, item, fallbackCategory = "") {
        if (!player || !item) return false;

        const cooldown = this.getCooldownComponent(item);
        if (!cooldown) return false;

        try {
            return cooldown.getCooldownTicksRemaining(player) > 0;
        } catch {
            const category = this.getCooldownCategory(item, fallbackCategory);
            if (!category) return false;

            try {
                return player.getItemCooldown(category) > 0;
            } catch {
                return false;
            }
        }
    }

    /**
     * Retorna quantos ticks faltam do cooldown.
     *
     * @param {import("@minecraft/server").Player} player
     * @param {import("@minecraft/server").ItemStack | undefined} item
     * @param {string} fallbackCategory
     * @returns {number}
     */
    static getRemainingTicks(player, item, fallbackCategory = "") {
        if (!player || !item) return 0;

        const cooldown = this.getCooldownComponent(item);
        if (!cooldown) return 0;

        try {
            return cooldown.getCooldownTicksRemaining(player);
        } catch {
            const category = this.getCooldownCategory(item, fallbackCategory);
            if (!category) return 0;

            try {
                return player.getItemCooldown(category);
            } catch {
                return 0;
            }
        }
    }

    /**
     * Ativa o cooldown do item.
     * Isso usa o próprio componente minecraft:cooldown do item.
     *
     * @param {import("@minecraft/server").Player} player
     * @param {import("@minecraft/server").ItemStack | undefined} item
     * @returns {boolean}
     */
    static startCooldown(player, item) {
        if (!player || !item) return false;

        const cooldown = this.getCooldownComponent(item);
        if (!cooldown) return false;

        try {
            cooldown.startCooldown(player);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Ativa cooldown manualmente pela categoria.
     * Útil se você quiser forçar cooldown mesmo sem acessar o componente.
     *
     * @param {import("@minecraft/server").Player} player
     * @param {string} category
     * @param {number} ticks
     * @returns {boolean}
     */
    static startCooldownByCategory(player, category, ticks) {
        if (!player || !category) return false;

        try {
            player.startItemCooldown(category, Math.max(0, Math.floor(ticks)));
            return true;
        } catch {
            return false;
        }
    }
}